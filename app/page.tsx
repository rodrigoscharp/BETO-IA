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
interface SpotifyAction { action: string; query?: string; level?: number; }

const WAKE = ["jarvis", "olá jarvis", "ola jarvis", "hey jarvis", "ei jarvis"];
const SPOTIFY_TAG_RE = /^\[SPOTIFY:(\{[\s\S]*?\})\]\s*/;

function getSR(): SRCtor | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

function pickVoice(): SpeechSynthesisVoice | null {
  const all = window.speechSynthesis.getVoices();
  const try_ = (fn: (v: SpeechSynthesisVoice) => boolean) => all.find(fn) ?? null;
  return (
    try_(v => /francisca/i.test(v.name) && v.lang.startsWith("pt"))        ||
    try_(v => /vitoria online|victoria online/i.test(v.name))               ||
    try_(v => /leila|camila|giovanna/i.test(v.name) && v.lang.startsWith("pt")) ||
    try_(v => v.name === "Google português do Brasil")                      ||
    try_(v => /luciana/i.test(v.name) && v.lang.startsWith("pt"))          ||
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

/* ── Component ───────────────────────────────────────────────────────────── */
export default function JarvisPage() {
  const [orbState, setOrbState] = useState<OrbState>("wake");
  const [caption,  setCaption]  = useState("");

  const mode      = useRef<Mode>("idle");
  const history   = useRef<Msg[]>([]);
  const wakeRec   = useRef<SR | null>(null);
  const activeRec = useRef<SR | null>(null);
  const timer     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deviceId  = useRef<string | null>(null); // Spotify Web Playback device ID
  const started   = useRef(false);

  /* ── Spotify auth + Web Playback SDK init on mount ───────────────────── */
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("spotify") === "ok") {
      window.history.replaceState({}, "", "/");
      initSpotifySDK();
      return;
    }
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
  }

  /* ── TTS ──────────────────────────────────────────────────────────────── */
  function speak(text: string, onDone: () => void) {
    const synth = window.speechSynthesis;
    if (!synth) { onDone(); return; }
    synth.cancel();
    setTimeout(() => {
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice();
      if (v) { u.voice = v; u.lang = v.lang; }
      else     { u.lang = "pt-BR"; }
      u.rate = 0.92; u.pitch = 1.05; u.volume = 1;
      u.onstart = () => { setMode("speaking"); setCaption(text); };
      u.onend   = () => { setCaption(""); onDone(); };
      u.onerror = () => { setCaption(""); onDone(); };
      synth.speak(u);
    }, 100);
  }

  /* ── Spotify command executor ─────────────────────────────────────────── */
  async function execSpotify(action: SpotifyAction): Promise<string | null> {
    try {
      // For play commands, ensure device is ready first
      let did = deviceId.current;
      if (action.action === "play" || action.action === "resume") {
        did = await waitForDevice();
        if (!did) {
          return "Spotify Premium é necessário para tocar músicas pelo Jarvis. Conecte uma conta Premium e tente novamente.";
        }
      }

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
      const { action, text: spokenText } = parseSpotify(rawReply);
      history.current = [...msgs, { role: "assistant", content: rawReply }];

      if (action) {
        const override = await execSpotify(action);
        speak(override ?? spokenText, () => { setMode("wake"); startWake(); });
      } else {
        speak(spokenText, () => { setMode("wake"); startWake(); });
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
    if (m === "speaking") { window.speechSynthesis?.cancel(); setMode("wake"); startWake(); return; }
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
      background: "#07101f",
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
