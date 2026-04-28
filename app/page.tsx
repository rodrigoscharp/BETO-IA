"use client";

import { useState, useRef, useEffect } from "react";
import Orb, { OrbState } from "@/components/Orb";

/* ── Speech Recognition shim ─────────────────────────────────────────────── */
interface SREvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SR extends EventTarget {
  lang: string; interimResults: boolean;
  continuous: boolean; maxAlternatives: number;
  start(): void; stop(): void; abort(): void;
  onstart:  ((e: Event) => void) | null;
  onresult: ((e: SREvent) => void) | null;
  onerror:  ((e: Event) => void) | null;
  onend:    ((e: Event) => void) | null;
}
interface SRCtor { new(): SR; }
declare global {
  interface Window { SpeechRecognition: SRCtor; webkitSpeechRecognition: SRCtor; }
}

type Mode = "idle" | "wake" | "listening" | "thinking" | "speaking";
interface Msg { role: "user" | "assistant"; content: string; }
interface SpotifyAction  { action: string; query?: string; level?: number; }
interface CalendarAction { action: string; title?: string; date?: string; time?: string; duration?: number; query?: string; }

const WAKE = ["jarvis", "olá jarvis", "ola jarvis", "hey jarvis", "ei jarvis"];
const SPOTIFY_TAG_RE  = /^\[SPOTIFY:(\{[\s\S]*?\})\]\s*/;
const CALENDAR_TAG_RE = /^\[CALENDAR:(\{[\s\S]*?\})\]\s*/;

function getSR(): SRCtor | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

function pickVoice(): SpeechSynthesisVoice | null {
  const all = window.speechSynthesis.getVoices();
  const try_ = (fn: (v: SpeechSynthesisVoice) => boolean) => all.find(fn) ?? null;
  // Prefer known masculine pt-BR / pt voices; fall back to any pt voice
  return (
    try_(v => /daniel/i.test(v.name)  && v.lang.startsWith("pt"))          ||
    try_(v => /ricardo/i.test(v.name) && v.lang.startsWith("pt"))          ||
    try_(v => /antonio|antônio/i.test(v.name) && v.lang.startsWith("pt"))  ||
    try_(v => /eddy/i.test(v.name)    && v.lang.startsWith("pt"))          ||
    try_(v => /reed/i.test(v.name)    && v.lang.startsWith("pt"))          ||
    try_(v => /thomas|tomás/i.test(v.name) && v.lang.startsWith("pt"))     ||
    try_(v => /luca/i.test(v.name)    && v.lang.startsWith("pt"))          ||
    try_(v => v.lang === "pt-BR" && !v.localService)                       ||
    try_(v => v.lang === "pt-BR")                                           ||
    try_(v => v.lang.startsWith("pt"))                                      ||
    null
  );
}

function parseSpotify(reply: string): { action: SpotifyAction | null; text: string } {
  const m = reply.match(SPOTIFY_TAG_RE);
  if (!m) return { action: null, text: reply };
  try {
    return { action: JSON.parse(m[1]) as SpotifyAction, text: reply.slice(m[0].length).trim() };
  } catch {
    return { action: null, text: reply };
  }
}

function parseCalendar(reply: string): { action: CalendarAction | null; text: string } {
  const m = reply.match(CALENDAR_TAG_RE);
  if (!m) return { action: null, text: reply };
  try {
    return { action: JSON.parse(m[1]) as CalendarAction, text: reply.slice(m[0].length).trim() };
  } catch {
    return { action: null, text: reply };
  }
}

/* ── Component ───────────────────────────────────────────────────────────── */
export default function JarvisPage() {
  const [orbState, setOrbState] = useState<OrbState>("wake");
  const [caption,  setCaption]  = useState("");

  const mode      = useRef<Mode>("idle");
  const history   = useRef<Msg[]>([]);
  const wakeRec   = useRef<SR | null>(null);
  const activeRec = useRef<SR | null>(null);
  const timer     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deviceId  = useRef<string | null>(null);
  const started   = useRef(false);
  const audioRef  = useRef<HTMLAudioElement | null>(null);

  /* ── Spotify + Google Calendar auth on mount ─────────────────────────── */
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);

    // Handle OAuth callbacks
    if (p.get("spotify") === "ok")  { window.history.replaceState({}, "", "/"); initSpotifySDK(); return; }
    if (p.get("calendar") === "ok") { window.history.replaceState({}, "", "/"); }

    // Init Spotify
    fetch("/api/spotify/status")
      .then(r => r.json())
      .then(d => {
        if (d.connected) initSpotifySDK();
        else window.location.href = "/api/spotify/login";
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Spotify Web Playback SDK ────────────────────────────────────────── */
  function initSpotifySDK() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).Spotify) { createSpotifyPlayer(); return; }

    const s = document.createElement("script");
    s.src   = "https://sdk.scdn.co/spotify-player.js";
    s.async = true;
    document.head.appendChild(s);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).onSpotifyWebPlaybackSDKReady = createSpotifyPlayer;
  }

  function createSpotifyPlayer() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SDK = (window as any).Spotify;
    if (!SDK) return;

    const player = new SDK.Player({
      name: "Jarvis",
      getOAuthToken: (cb: (t: string) => void) => {
        fetch("/api/spotify/token")
          .then(r => r.json())
          .then(d => { if (d.token) cb(d.token); })
          .catch(() => {});
      },
      volume: 0.8,
    });

    player.addListener("ready",     ({ device_id }: { device_id: string }) => {
      deviceId.current = device_id;
    });
    player.addListener("not_ready", () => { deviceId.current = null; });
    player.addListener("account_error", () => {
      console.warn("[Jarvis] Spotify Premium necessário para o Web Playback SDK.");
    });

    player.connect();
  }

  /* Wait up to 8 s for Spotify device to be ready */
  async function waitForDevice(): Promise<string | null> {
    if (deviceId.current) return deviceId.current;
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 200));
      if (deviceId.current) return deviceId.current;
    }
    return null;
  }

  /* ── helpers ──────────────────────────────────────────────────────────── */
  function setMode(m: Mode) {
    mode.current = m;
    setOrbState(
      m === "speaking"  ? "speaking"  :
      m === "thinking"  ? "thinking"  :
      m === "listening" ? "listening" : "wake"
    );
  }

  function clearTimer() {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  }

  function stopAll() {
    clearTimer();
    try { wakeRec.current?.abort();   } catch { /* ok */ }
    try { activeRec.current?.abort(); } catch { /* ok */ }
    wakeRec.current = null;
    activeRec.current = null;
    window.speechSynthesis?.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
  }

  /* ── TTS: ElevenLabs → fallback Web Speech ───────────────────────────── */
  function speak(text: string, onDone: () => void) {
    // Stop any current audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    window.speechSynthesis?.cancel();

    setMode("speaking");
    setCaption(text);

    fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
      .then(res => {
        if (!res.ok) throw new Error("TTS API falhou");
        return res.blob();
      })
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          URL.revokeObjectURL(url);
          audioRef.current = null;
          setCaption("");
          onDone();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          audioRef.current = null;
          setCaption("");
          onDone();
        };
        audio.play().catch(() => { setCaption(""); onDone(); });
      })
      .catch(() => {
        // Fallback: Web Speech API
        const synth = window.speechSynthesis;
        if (!synth) { setCaption(""); onDone(); return; }
        const u = new SpeechSynthesisUtterance(text);
        const v = pickVoice();
        if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = "pt-BR"; }
        u.rate = 0.93; u.pitch = 0.78; u.volume = 1;
        u.onend   = () => { setCaption(""); onDone(); };
        u.onerror = () => { setCaption(""); onDone(); };
        synth.speak(u);
      });
  }

  /* ── Open a spotify: URI in the desktop app via hidden iframe ────────── */
  function openSpotifyUri(uri: string) {
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none;";
    iframe.src = uri;
    document.body.appendChild(iframe);
    setTimeout(() => { try { document.body.removeChild(iframe); } catch { /* ok */ } }, 3000);
  }

  /* ── Spotify command executor ─────────────────────────────────────────── */
  async function execSpotify(action: SpotifyAction): Promise<string | null> {
    try {
      const did = deviceId.current;

      const res = await fetch("/api/spotify/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...action, device_id: did }),
      });

      if (res.status === 401) {
        return "Spotify não autenticado. Recarregue a página para reconectar.";
      }

      const d = await res.json();

      if (action.action === "current") {
        if (!d.playing) return "Nenhuma música tocando no momento.";
        return `Está tocando ${d.track} de ${d.artist}.`;
      }

      // Open Spotify URI directly in the app (works for free + premium accounts)
      if (d.spotifyUri) {
        openSpotifyUri(d.spotifyUri);
        if (d.track) return `Tocando ${d.track}${d.artist ? " de " + d.artist : ""} no Spotify.`;
        if (d.name)  return `Abrindo ${d.name} no Spotify.`;
      }

      if (action.action === "play" && d.track) {
        return `Tocando ${d.track}${d.artist ? " de " + d.artist : ""}.`;
      }
      if (action.action === "play" && d.name) {
        return `Tocando ${d.name}.`;
      }
      if (d.error) return d.error;

      return null;
    } catch {
      return "Erro ao conectar com o Spotify.";
    }
  }

  /* ── Calendar command executor ───────────────────────────────────────── */
  async function execCalendar(action: CalendarAction): Promise<string> {
    try {
      const res = await fetch("/api/calendar/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });

      if (res.status === 401) {
        window.location.href = "/api/calendar/login";
        return "Redirecionando para autorizar o Google Calendar.";
      }

      const d = await res.json();

      if (action.action === "create") {
        if (d.error) return d.error;
        if (d.ok) {
          // d.start is already a local datetime string like "2026-04-27T15:00:00"
          const dt = new Date(d.start);
          const dateStr = dt.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
          const timeStr = dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
          return `Evento "${d.title}" criado para ${dateStr} às ${timeStr}.`;
        }
      }

      if (action.action === "list") {
        if (d.error) return d.error;
        if (!d.events?.length) return "Você não tem eventos próximos na agenda.";
        const list = d.events.map((e: { title: string; start: string }) => {
          // strip timezone offset so browser doesn't convert to UTC
          const raw = e.start.replace(/([+-]\d{2}:\d{2}|Z)$/, "");
          const dt = new Date(raw);
          const dateStr = dt.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
          const timeStr = dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
          return `${e.title} — ${dateStr} às ${timeStr}`;
        }).join(". ");
        return `Seus próximos eventos: ${list}.`;
      }

      return d.error ?? "Pronto.";
    } catch {
      return "Erro ao conectar com o Google Calendar.";
    }
  }

  /* ── Active listener ──────────────────────────────────────────────────── */
  function startActive() {
    const API = getSR();
    if (!API) return;
    setMode("listening");

    try { activeRec.current?.abort(); } catch { /* ok */ }
    const rec = new API();
    activeRec.current = rec;
    rec.lang = "pt-BR"; rec.interimResults = false;
    rec.continuous = false; rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      const text = e.results[0][0].transcript.trim();
      if (text.length >= 2) sendToJarvis(text);
      else { setMode("wake"); startWake(); }
    };
    rec.onerror = () => { setMode("wake"); startWake(); };
    rec.onend   = () => { if (mode.current === "listening") { setMode("wake"); startWake(); } };
    try { rec.start(); } catch { setMode("wake"); startWake(); }
  }

  /* ── Wake word listener ───────────────────────────────────────────────── */
  function startWake() {
    clearTimer();
    if (mode.current !== "wake") return;
    const API = getSR();
    if (!API) return;

    try { wakeRec.current?.abort(); } catch { /* ok */ }
    wakeRec.current = null;

    const rec = new API();
    wakeRec.current = rec;
    rec.lang = "pt-BR"; rec.interimResults = true;
    rec.continuous = true; rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript.toLowerCase().trim();
        if (WAKE.some(w => t.includes(w))) {
          try { rec.abort(); } catch { /* ok */ }
          wakeRec.current = null;
          clearTimer();
          timer.current = setTimeout(startActive, 150);
          return;
        }
      }
    };
    rec.onerror = () => { if (mode.current === "wake") timer.current = setTimeout(startWake, 800); };
    rec.onend   = () => { if (mode.current === "wake") timer.current = setTimeout(startWake, 400); };
    try { rec.start(); } catch { /* mic not ready */ }
  }

  /* ── Groq + Spotify ───────────────────────────────────────────────────── */
  async function sendToJarvis(text: string) {
    setMode("thinking");
    const msgs: Msg[] = [...history.current, { role: "user", content: text }];
    history.current = msgs;

    try {
      const res  = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: msgs.slice(-20) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      const rawReply = data.reply as string;
      history.current = [...msgs, { role: "assistant", content: rawReply }];

      // Check for Spotify or Calendar tags
      const spotify  = parseSpotify(rawReply);
      const calendar = parseCalendar(rawReply);

      if (spotify.action) {
        const override = await execSpotify(spotify.action);
        speak(override ?? spotify.text, () => { setMode("wake"); startWake(); });
      } else if (calendar.action) {
        const result = await execCalendar(calendar.action);
        speak(result, () => { setMode("wake"); startWake(); });
      } else {
        speak(rawReply, () => { setMode("wake"); startWake(); });
      }
    } catch {
      speak("Desculpe, houve um erro na comunicação.", () => { setMode("wake"); startWake(); });
    }
  }

  /* ── Click handler ────────────────────────────────────────────────────── */
  function handleClick() {
    if (!started.current) {
      started.current = true;
      const synth = window.speechSynthesis;
      if (synth) {
        synth.getVoices();
        synth.onvoiceschanged = () => synth.getVoices();
        const u = new SpeechSynthesisUtterance(" ");
        u.volume = 0;
        synth.speak(u);
      }
      setMode("wake");
      startWake();
      return;
    }

    const m = mode.current;
    if (m === "thinking") return;
    if (m === "speaking") {
      window.speechSynthesis?.cancel();
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; audioRef.current = null; }
      setCaption("");
      setMode("wake"); startWake(); return;
    }
    if (m === "listening") {
      try { activeRec.current?.abort(); } catch { /* ok */ }
      setMode("wake"); startWake(); return;
    }
    try { wakeRec.current?.abort(); } catch { /* ok */ }
    wakeRec.current = null;
    clearTimer();
    timer.current = setTimeout(startActive, 150);
  }

  /* ── Keepalive + cleanup ──────────────────────────────────────────────── */
  useEffect(() => {
    const ka = setInterval(() => {
      const s = window.speechSynthesis;
      if (s?.speaking) { s.pause(); s.resume(); }
    }, 10_000);
    return () => { clearInterval(ka); stopAll(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main style={{
      position: "fixed", inset: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "#000000",
    }}>
      <Orb state={orbState} onClick={handleClick} />

      <div style={{
        position: "fixed", top: 18, left: 22,
        color: "rgba(255,255,255,0.18)",
        fontSize: 11, fontFamily: "monospace", letterSpacing: "0.15em",
        textTransform: "uppercase", pointerEvents: "none", userSelect: "none",
      }}>
        JARVIS · ONLINE
      </div>

      {caption && (
        <div style={{
          position: "fixed", bottom: 52, left: "50%",
          transform: "translateX(-50%)",
          maxWidth: "min(660px, 86vw)",
          textAlign: "center",
          padding: "10px 24px", borderRadius: 6,
          background: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(8px)",
          color: "#fff",
          fontSize: "clamp(15px, 2vw, 19px)",
          fontFamily: "'Segoe UI', system-ui, sans-serif",
          fontWeight: 400, lineHeight: 1.55, letterSpacing: "0.01em",
          textShadow: "0 1px 8px rgba(0,0,0,0.9)",
          border: "1px solid rgba(255,255,255,0.07)",
          animation: "fadeUp 0.2s ease",
          pointerEvents: "none",
        }}>
          {caption}
        </div>
      )}

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateX(-50%) translateY(8px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </main>
  );
}
