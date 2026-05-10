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
  interface Window {
    SpeechRecognition: SRCtor;
    webkitSpeechRecognition: SRCtor;
    Spotify: { Player: new (opts: SpotifyPlayerOptions) => SpotifyPlayer };
    onSpotifyWebPlaybackSDKReady: () => void;
  }
}

interface SpotifyPlayerOptions {
  name: string;
  getOAuthToken: (cb: (t: string) => void) => void;
  volume: number;
}
interface SpotifyPlayer {
  addListener(event: string, cb: (arg: { device_id: string }) => void): void;
  connect(): void;
}

type Mode = "idle" | "wake" | "listening" | "thinking" | "speaking";
interface Msg { role: "user" | "assistant"; content: string; }
interface SpotifyAction  { action: string; query?: string; level?: number; }
interface CalendarAction { action: string; title?: string; date?: string; time?: string; duration?: number; query?: string; }
interface WhatsAppAction { action: string; to?: string; message?: string; }
interface GithubAction   { action: string; repo?: string; }
interface GmailAction    { action: string; }
interface TimerAction    { action: string; minutes?: number; label?: string; }
interface MemoryAction   { action: string; content?: string; category?: string; }
interface BriefingAction { action: string; }

const WAKE = ["jarvis", "olá jarvis", "ola jarvis", "hey jarvis", "ei jarvis"];
const SPOTIFY_TAG_RE  = /^\[SPOTIFY:(\{[\s\S]*?\})\]\s*/;
const CALENDAR_TAG_RE = /^\[CALENDAR:(\{[\s\S]*?\})\]\s*/;
const WHATSAPP_TAG_RE = /^\[WHATSAPP:(\{[\s\S]*?\})\]\s*/;
const GITHUB_TAG_RE   = /^\[GITHUB:(\{[\s\S]*?\})\]\s*/;
const GMAIL_TAG_RE    = /^\[GMAIL:(\{[\s\S]*?\})\]\s*/;
const TIMER_TAG_RE    = /^\[TIMER:(\{[\s\S]*?\})\]\s*/;
const MEMORY_TAG_RE   = /^\[MEMORY:(\{[\s\S]*?\})\]\s*/;
const BRIEFING_TAG_RE = /^\[BRIEFING:(\{[\s\S]*?\})\]\s*/;

function sanitize(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "")           // code blocks
    .replace(/`[^`\n]+`/g, "")                // inline code
    .replace(/^\s*#{1,6}\s+/gm, "")           // headers
    .replace(/\*\*([^*]+)\*\*/g, "$1")        // bold
    .replace(/\*([^*\n]+)\*/g, "$1")          // italic
    .replace(/^\s*[-*+]\s+/gm, "")            // bullet points
    .replace(/^\s*\d+\.\s+/gm, "")            // numbered lists
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")  // markdown links
    .replace(/https?:\/\/\S+/g, "")           // bare URLs
    .replace(/\n{2,}/g, ". ")                 // paragraph breaks → pause
    .replace(/\n/g, " ")                       // line breaks → space
    .replace(/\s{2,}/g, " ")                  // collapse spaces
    .trim();
}

function getSR(): SRCtor | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

function pickVoice(): SpeechSynthesisVoice | null {
  const all = window.speechSynthesis.getVoices();
  const try_ = (fn: (v: SpeechSynthesisVoice) => boolean) => all.find(fn) ?? null;
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

function parseTag<T>(reply: string, re: RegExp): { action: T | null; text: string } {
  const m = reply.match(re);
  if (!m) return { action: null, text: reply };
  try { return { action: JSON.parse(m[1]) as T, text: reply.slice(m[0].length).trim() }; }
  catch { return { action: null, text: reply }; }
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/* ── Component ───────────────────────────────────────────────────────────── */
export default function JarvisPage() {
  const [orbState,     setOrbState]     = useState<OrbState>("wake");
  const [caption,      setCaption]      = useState("");
  const [timerDisplay, setTimerDisplay] = useState<{ label: string; timeLeft: number } | null>(null);

  const mode        = useRef<Mode>("idle");
  const history     = useRef<Msg[]>([]);
  const wakeRec     = useRef<SR | null>(null);
  const activeRec   = useRef<SR | null>(null);
  const timer       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deviceId    = useRef<string | null>(null);
  const started     = useRef(false);
  const audioRef    = useRef<HTMLAudioElement | null>(null);

  // Timer state
  const timerInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerSecsLeft = useRef<number>(0);
  const timerLabel    = useRef<string>("");

  /* ── Spotify + Google Calendar auth on mount ─────────────────────────── */
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("spotify") === "ok")  { window.history.replaceState({}, "", "/"); initSpotifySDK(); return; }
    if (p.get("calendar") === "ok") { window.history.replaceState({}, "", "/"); }

    fetch("/api/spotify/status")
      .then(r => r.json())
      .then(d => { if (d.connected) initSpotifySDK(); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Spotify Web Playback SDK ────────────────────────────────────────── */
  function initSpotifySDK() {
    if (window.Spotify) { createSpotifyPlayer(); return; }
    const s = document.createElement("script");
    s.src = "https://sdk.scdn.co/spotify-player.js"; s.async = true;
    document.head.appendChild(s);
    window.onSpotifyWebPlaybackSDKReady = createSpotifyPlayer;
  }

  function createSpotifyPlayer() {
    const SDK = window.Spotify;
    if (!SDK) return;
    const player = new SDK.Player({
      name: "Jarvis",
      getOAuthToken: (cb: (t: string) => void) => {
        fetch("/api/spotify/token").then(r => r.json()).then(d => { if (d.token) cb(d.token); }).catch(() => {});
      },
      volume: 0.8,
    });
    player.addListener("ready",     ({ device_id }: { device_id: string }) => { deviceId.current = device_id; });
    player.addListener("not_ready", () => { deviceId.current = null; });
    player.addListener("account_error", () => { console.warn("[Jarvis] Spotify Premium necessário."); });
    player.connect();
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
  function clearTimer() { if (timer.current) { clearTimeout(timer.current); timer.current = null; } }
  function stopAll() {
    clearTimer();
    try { wakeRec.current?.abort();   } catch { /* ok */ }
    try { activeRec.current?.abort(); } catch { /* ok */ }
    wakeRec.current = null; activeRec.current = null;
    window.speechSynthesis?.cancel();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; audioRef.current = null; }
  }

  /* ── Timer ────────────────────────────────────────────────────────────── */
  function startTimer(minutes: number, label: string) {
    stopTimerInterval();
    timerSecsLeft.current = minutes * 60;
    timerLabel.current = label;
    setTimerDisplay({ label, timeLeft: timerSecsLeft.current });

    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    timerInterval.current = setInterval(() => {
      timerSecsLeft.current -= 1;
      setTimerDisplay({ label: timerLabel.current, timeLeft: timerSecsLeft.current });
      if (timerSecsLeft.current <= 0) {
        stopTimerInterval();
        setTimerDisplay(null);
        onTimerEnd(timerLabel.current);
      }
    }, 1000);
  }

  function stopTimerInterval() {
    if (timerInterval.current) { clearInterval(timerInterval.current); timerInterval.current = null; }
  }

  function onTimerEnd(label: string) {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("Jarvis", { body: `${label} finalizado!`, icon: "/favicon.ico" });
    }
    const msg = label.toLowerCase().includes("pomodoro")
      ? "Pomodoro finalizado! Hora de uma pausa merecida."
      : label.toLowerCase().includes("pausa")
        ? "Pausa encerrada. Bora voltar ao foco!"
        : `${label} finalizado!`;
    speak(msg, () => { setMode("wake"); startWake(); });
  }

  function getTimerStatus(): string {
    if (!timerInterval.current || timerSecsLeft.current <= 0) return "Não há nenhum timer ativo no momento.";
    return `Faltam ${formatTime(timerSecsLeft.current)} para o ${timerLabel.current}.`;
  }

  /* ── TTS ──────────────────────────────────────────────────────────────── */
  function speak(text: string, onDone: () => void) {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; audioRef.current = null; }
    window.speechSynthesis?.cancel();
    setMode("speaking");
    setCaption(text);

    const fallbackSynth = () => {
      const synth = window.speechSynthesis;
      if (!synth) { setCaption(""); onDone(); return; }
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice();
      if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = "pt-BR"; }
      u.rate = 0.93; u.pitch = 0.78; u.volume = 1;
      u.onend   = () => { setCaption(""); onDone(); };
      u.onerror = () => { setCaption(""); onDone(); };
      synth.speak(u);
    };

    fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) })
      .then(res => {
        if (!res.ok || !res.body) throw new Error("TTS falhou");

        // Progressive streaming via MediaSource (Chrome/Edge/Firefox)
        const supportsMS =
          typeof MediaSource !== "undefined" &&
          MediaSource.isTypeSupported("audio/mpeg");

        if (supportsMS) {
          const ms  = new MediaSource();
          const url = URL.createObjectURL(ms);
          const audio = new Audio(url);
          audioRef.current = audio;

          const cleanup = () => { URL.revokeObjectURL(url); audioRef.current = null; setCaption(""); onDone(); };
          audio.onended = cleanup;
          audio.onerror = cleanup;

          ms.addEventListener("sourceopen", async () => {
            let sb: SourceBuffer;
            try { sb = ms.addSourceBuffer("audio/mpeg"); }
            catch { cleanup(); return; }

            const reader = res.body!.getReader();
            let started = false;

            const waitUpdate = () =>
              new Promise<void>(r => sb.addEventListener("updateend", () => r(), { once: true }));

            try {
              for (;;) {
                const { done, value } = await reader.read();
                if (done) {
                  if (sb.updating) await waitUpdate();
                  if (ms.readyState === "open") ms.endOfStream();
                  return;
                }
                if (sb.updating) await waitUpdate();
                sb.appendBuffer(value);
                if (!started) { started = true; audio.play().catch(() => {}); }
              }
            } catch { cleanup(); }
          });

        } else {
          // Fallback: blob (Safari)
          res.blob().then(blob => {
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audioRef.current = audio;
            audio.onended = () => { URL.revokeObjectURL(url); audioRef.current = null; setCaption(""); onDone(); };
            audio.onerror = () => { URL.revokeObjectURL(url); audioRef.current = null; setCaption(""); onDone(); };
            audio.play().catch(() => { setCaption(""); onDone(); });
          }).catch(fallbackSynth);
        }
      })
      .catch(fallbackSynth);
  }

  function openSpotifyUri(uri: string) {
    // Open Spotify app via deep link (anchor click is most reliable cross-browser)
    const a = document.createElement("a");
    a.href = uri;
    a.style.cssText = "position:fixed;width:0;height:0;opacity:0;pointer-events:none;";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { try { a.remove(); } catch { /* ok */ } }, 500);

    // Poll until Spotify is up, then force play via API (up to 10s)
    let attempts = 0;
    const poll = setInterval(async () => {
      attempts++;
      if (attempts > 10) { clearInterval(poll); return; }
      try {
        const res = await fetch("/api/spotify/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "play_uri", uri }),
        });
        const d = await res.json();
        if (d.ok) clearInterval(poll);
      } catch { /* retry */ }
    }, 1000);
  }

  /* ── Executors ────────────────────────────────────────────────────────── */
  async function execSpotify(action: SpotifyAction): Promise<string> {
    try {
      const res = await fetch("/api/spotify/command", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...action, device_id: deviceId.current }),
      });
      if (res.status === 401) return "Spotify não autenticado. Recarregue a página.";
      const d = await res.json();
      if (d.error) return d.error;
      if (action.action === "current") {
        return d.playing ? `Tocando ${d.track} de ${d.artist}.` : "Nada tocando no momento.";
      }
      if (d.spotifyUri) openSpotifyUri(d.spotifyUri);
      // Short affirmative — no need to repeat what the user asked
      if (action.action === "play")     return d.track ? `${d.track}.` : "Pronto.";
      if (action.action === "pause")    return "Pausado.";
      if (action.action === "resume")   return "Continuando.";
      if (action.action === "next")     return "Ok.";
      if (action.action === "previous") return "Ok.";
      if (action.action === "volume")   return "Feito.";
      if (action.action === "shuffle")  return "Aleatório ativado.";
      return "Pronto.";
    } catch { return "Erro ao conectar com o Spotify."; }
  }

  async function execCalendar(action: CalendarAction): Promise<string> {
    try {
      const res = await fetch("/api/calendar/command", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action),
      });
      if (res.status === 401) { window.location.href = "/api/calendar/login"; return "Redirecionando para o Google Calendar."; }
      const d = await res.json();
      if (action.action === "create") {
        if (d.error) return d.error;
        if (d.ok) {
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
          const raw = e.start.replace(/([+-]\d{2}:\d{2}|Z)$/, "");
          const dt  = new Date(raw);
          return `${e.title} — ${dt.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })} às ${dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
        }).join(". ");
        return `Seus próximos eventos: ${list}.`;
      }
      return d.error ?? "Pronto.";
    } catch { return "Erro ao conectar com o Google Calendar."; }
  }

  async function execWhatsApp(action: WhatsAppAction): Promise<string> {
    try {
      const res = await fetch("/api/whatsapp/command", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action),
      });
      const d = await res.json();
      if (d.error) return d.error;
      return d.ok ? "Mensagem enviada com sucesso." : "Não consegui enviar a mensagem.";
    } catch { return "Serviço WhatsApp não disponível."; }
  }

  async function execGmail(_action: GmailAction): Promise<string> {
    try {
      const res = await fetch("/api/gmail/summary");
      if (res.status === 401) { window.location.href = "/api/calendar/login"; return "Redirecionando para autorizar."; }
      const d = await res.json();
      return d.summary ?? d.error ?? "Não consegui verificar os emails.";
    } catch { return "Erro ao acessar o Gmail."; }
  }

  async function execGithub(action: GithubAction): Promise<string> {
    try {
      const res = await fetch("/api/github/command", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action),
      });
      const d = await res.json();
      return d.summary ?? d.error ?? "Não consegui buscar os dados do GitHub.";
    } catch { return "Erro ao conectar com o GitHub."; }
  }

  function execTimer(action: TimerAction): string {
    if (action.action === "start") {
      const mins  = action.minutes ?? 25;
      const label = action.label   ?? "Timer";
      startTimer(mins, label);
      return `${label} de ${mins} minuto${mins > 1 ? "s" : ""} iniciado. Vou te avisar quando terminar.`;
    }
    if (action.action === "cancel") { stopTimerInterval(); setTimerDisplay(null); return "Timer cancelado."; }
    if (action.action === "status") return getTimerStatus();
    return "Não entendi o comando do timer.";
  }

  async function execBriefing(): Promise<string> {
    try {
      const res = await fetch("/api/briefing");
      if (res.status === 401) {
        window.location.href = "/api/calendar/login";
        return "Redirecionando para autorizar o Google.";
      }
      const d = await res.json();
      return d.briefing ?? d.error ?? "Não consegui montar o briefing agora.";
    } catch { return "Erro ao buscar o briefing."; }
  }

  async function execMemory(action: MemoryAction, fallbackText: string): Promise<string> {
    try {
      const res = await fetch("/api/memory/command", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action),
      });
      const d = await res.json();
      if (action.action === "save") return d.ok ? (fallbackText || "Anotado, não vou esquecer.") : fallbackText;
      if (action.action === "list") {
        if (!d.memories?.length) return "Ainda não tenho nada guardado sobre você.";
        const list = d.memories.map((m: { category: string; content: string }) => `${m.content}`).join(". ");
        return `Aqui está o que eu sei sobre você: ${list}.`;
      }
      return fallbackText || "Pronto.";
    } catch { return fallbackText || "Erro ao acessar a memória."; }
  }

  /* ── Active listener ──────────────────────────────────────────────────── */
  function startActive(timeoutMs = 8000) {
    const API = getSR();
    if (!API) return;
    setMode("listening");
    try { activeRec.current?.abort(); } catch { /* ok */ }
    const rec = new API();
    activeRec.current = rec;
    rec.lang = "pt-BR"; rec.interimResults = false; rec.continuous = true; rec.maxAlternatives = 1;

    let captured = false;

    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          const text = e.results[i][0].transcript.trim();
          const lower = text.toLowerCase();
          // Ignore bare wake words — user may say "Jarvis" thinking they need to re-trigger
          const isOnlyWake = WAKE.some(w => lower === w || lower === w + ".");
          if (text.length >= 2 && !captured && !isOnlyWake) {
            captured = true;
            try { rec.abort(); } catch { /* ok */ }
            sendToJarvis(text);
          }
        }
      }
    };
    rec.onerror = () => { if (!captured) { setMode("wake"); startWake(); } };
    const timeout = setTimeout(() => {
      if (!captured && mode.current === "listening") {
        try { rec.abort(); } catch { /* ok */ }
        setMode("wake"); startWake();
      }
    }, timeoutMs);
    rec.onend = () => { clearTimeout(timeout); if (!captured && mode.current === "listening") { setMode("wake"); startWake(); } };
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
    rec.lang = "pt-BR"; rec.interimResults = true; rec.continuous = true; rec.maxAlternatives = 1;
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

  /* ── Main chat handler ────────────────────────────────────────────────── */
  async function sendToJarvis(text: string) {
    setMode("thinking");
    const msgs: Msg[] = [...history.current, { role: "user", content: text }];
    history.current = msgs;

    try {
      const res  = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: msgs.slice(-20) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      const rawReply = data.reply as string;
      history.current = [...msgs, { role: "assistant", content: rawReply }];

      const spotify  = parseTag<SpotifyAction>(rawReply,  SPOTIFY_TAG_RE);
      const calendar = parseTag<CalendarAction>(rawReply, CALENDAR_TAG_RE);
      const whatsapp = parseTag<WhatsAppAction>(rawReply, WHATSAPP_TAG_RE);
      const github   = parseTag<GithubAction>(rawReply,   GITHUB_TAG_RE);
      const gmail    = parseTag<GmailAction>(rawReply,    GMAIL_TAG_RE);
      const timerTag = parseTag<TimerAction>(rawReply,    TIMER_TAG_RE);
      const memory   = parseTag<MemoryAction>(rawReply,   MEMORY_TAG_RE);
      const briefing = parseTag<BriefingAction>(rawReply, BRIEFING_TAG_RE);

      // After speaking, listen 4s for follow-up, then fall back to wake word mode
      const done = () => setTimeout(() => startActive(4000), 400);

      const say = (t: string) => speak(sanitize(t), done);

      if (spotify.action) {
        say(await execSpotify(spotify.action));
      } else if (calendar.action) {
        say(await execCalendar(calendar.action));
      } else if (whatsapp.action) {
        say(await execWhatsApp(whatsapp.action));
      } else if (github.action) {
        say(await execGithub(github.action));
      } else if (gmail.action) {
        say(await execGmail(gmail.action));
      } else if (timerTag.action) {
        say(execTimer(timerTag.action));
      } else if (memory.action) {
        say(await execMemory(memory.action, memory.text));
      } else if (briefing.action) {
        say(await execBriefing());
      } else {
        say(rawReply);
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
      setCaption(""); setMode("wake"); startWake(); return;
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
    return () => { clearInterval(ka); stopTimerInterval(); stopAll(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Render ───────────────────────────────────────────────────────────── */
  return (
    <main style={{ position: "fixed", inset: 0, background: "#000000" }}>
      <Orb state={orbState} onClick={handleClick} />

      {/* Status badge */}
      <div style={{
        position: "fixed", top: 18, left: 22, zIndex: 10,
        color: "rgba(255,255,255,0.18)",
        fontSize: 11, fontFamily: "monospace", letterSpacing: "0.15em",
        textTransform: "uppercase", pointerEvents: "none", userSelect: "none",
      }}>
        JARVIS · ONLINE
      </div>

      {/* Timer display — canto superior direito */}
      {timerDisplay && (
        <div style={{
          position: "fixed", top: 18, right: 22, zIndex: 10,
          color: "rgba(255,255,255,0.75)",
          textAlign: "right", pointerEvents: "none", userSelect: "none",
        }}>
          <div style={{
            fontSize: 10, fontFamily: "monospace", letterSpacing: "0.12em",
            color: "rgba(255,255,255,0.35)", textTransform: "uppercase", marginBottom: 3,
          }}>
            {timerDisplay.label}
          </div>
          <div style={{ fontSize: 22, fontFamily: "monospace", fontWeight: 300, letterSpacing: "0.06em" }}>
            {formatTime(timerDisplay.timeLeft)}
          </div>
        </div>
      )}

      {/* Caption */}
      {caption && (
        <div style={{
          position: "fixed", bottom: 52, left: "50%", zIndex: 10,
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
