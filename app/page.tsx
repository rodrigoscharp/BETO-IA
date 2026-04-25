"use client";

import { useState, useRef, useEffect } from "react";
import Orb, { OrbState } from "@/components/Orb";

// ── Speech Recognition types ──────────────────────────────────────────────
interface ISpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface ISpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart:  ((ev: Event) => void) | null;
  onresult: ((ev: ISpeechRecognitionEvent) => void) | null;
  onerror:  ((ev: Event) => void) | null;
  onend:    ((ev: Event) => void) | null;
}
interface ISpeechRecognitionCtor { new(): ISpeechRecognition; }
declare global {
  interface Window {
    SpeechRecognition: ISpeechRecognitionCtor;
    webkitSpeechRecognition: ISpeechRecognitionCtor;
  }
}

type Mode = "init" | "wake" | "listening" | "thinking" | "speaking";
interface Message { role: "user" | "assistant"; content: string; }

const WAKE_WORDS = ["jarvis", "olá jarvis", "ola jarvis", "hey jarvis", "ei jarvis"];

function getSpeechAPI(): ISpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

// Pick the best available voice for Jarvis — British male preferred,
// falls back gracefully to whatever the browser has.
function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const prefer = [
    // Chrome on any OS
    (v: SpeechSynthesisVoice) => v.name === "Google UK English Male",
    (v: SpeechSynthesisVoice) => v.name === "Google UK English Female",
    // macOS built-in British
    (v: SpeechSynthesisVoice) => v.name === "Daniel",
    (v: SpeechSynthesisVoice) => v.name === "Malcolm",
    (v: SpeechSynthesisVoice) => v.name === "Oliver",
    // Windows
    (v: SpeechSynthesisVoice) => v.name.includes("Microsoft George"),
    (v: SpeechSynthesisVoice) => v.name.includes("Microsoft David"),
    // Any British/UK voice
    (v: SpeechSynthesisVoice) => v.lang === "en-GB",
    // Any English voice as last resort
    (v: SpeechSynthesisVoice) => v.lang.startsWith("en"),
  ];
  for (const fn of prefer) {
    const match = voices.find(fn);
    if (match) return match;
  }
  return null;
}

export default function JarvisPage() {
  const [orbState, setOrbState] = useState<OrbState>("wake");

  const modeRef       = useRef<Mode>("init");
  const messagesRef   = useRef<Message[]>([]);
  const wakeRecRef    = useRef<ISpeechRecognition | null>(null);
  const activeRecRef  = useRef<ISpeechRecognition | null>(null);
  const restartRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ttsReadyRef   = useRef(false); // true after first user gesture
  const micReadyRef   = useRef(false);

  function setMode(m: Mode) {
    modeRef.current = m;
    const visual: OrbState =
      m === "speaking"  ? "speaking"  :
      m === "thinking"  ? "thinking"  :
      m === "listening" ? "listening" : "wake";
    setOrbState(visual);
  }

  function clearTimer() {
    if (restartRef.current) { clearTimeout(restartRef.current); restartRef.current = null; }
  }

  // ── Unlock speechSynthesis — MUST run inside a user gesture ──────────
  function unlockTTS() {
    if (ttsReadyRef.current) return;
    ttsReadyRef.current = true;
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.getVoices(); // trigger voice load
    synth.onvoiceschanged = () => synth.getVoices();
    // Speak a zero-volume utterance to permanently unlock TTS for this page
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    synth.speak(u);
  }

  // ── TTS via speechSynthesis ───────────────────────────────────────────
  function speak(text: string, onDone: () => void) {
    const synth = window.speechSynthesis;
    if (!synth) { onDone(); return; }

    // Cancel anything currently playing, then wait one tick
    synth.cancel();

    setTimeout(() => {
      const u = new SpeechSynthesisUtterance(text);

      // Voice: British male preferred (Jarvis-like), any English as fallback
      const voice = pickVoice();
      if (voice) {
        u.voice = voice;
        u.lang  = voice.lang;
      } else {
        u.lang = "en-GB";
      }

      // Natural-sounding prosody — not too fast, slightly lower pitch
      u.rate   = 0.88;   // deliberate pace
      u.pitch  = 0.9;    // slightly lower = more authoritative
      u.volume = 1;

      u.onstart = () => setMode("speaking");
      u.onend   = () => { onDone(); };
      u.onerror = (e) => {
        console.error("[TTS]", (e as SpeechSynthesisErrorEvent).error);
        onDone();
      };

      synth.speak(u);
    }, 80);
  }

  function stopSpeaking() {
    window.speechSynthesis?.cancel();
  }

  // ── Wake word listener ────────────────────────────────────────────────
  function startWakeListener() {
    clearTimer();
    if (modeRef.current !== "wake") return;
    const API = getSpeechAPI();
    if (!API) return;

    try { wakeRecRef.current?.abort(); } catch { /* ok */ }
    wakeRecRef.current = null;

    const rec = new API();
    rec.lang            = "pt-BR";
    rec.interimResults  = true;
    rec.continuous      = true;
    rec.maxAlternatives = 1;
    wakeRecRef.current  = rec;

    rec.onresult = (ev) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const t = ev.results[i][0].transcript.toLowerCase().trim();
        if (WAKE_WORDS.some((w) => t.includes(w))) {
          try { rec.abort(); } catch { /* ok */ }
          wakeRecRef.current = null;
          clearTimer();
          restartRef.current = setTimeout(() => startActiveListener(), 120);
          return;
        }
      }
    };

    rec.onerror = () => {
      if (modeRef.current === "wake")
        restartRef.current = setTimeout(() => startWakeListener(), 600);
    };

    rec.onend = () => {
      if (modeRef.current === "wake")
        restartRef.current = setTimeout(() => startWakeListener(), 300);
    };

    try { rec.start(); } catch (e) { console.error("[wake] start failed:", e); }
  }

  // ── Active (command) listener ─────────────────────────────────────────
  function startActiveListener() {
    if (modeRef.current === "thinking" || modeRef.current === "speaking") return;
    const API = getSpeechAPI();
    if (!API) return;

    setMode("listening");
    const rec = new API();
    rec.lang            = "pt-BR";
    rec.interimResults  = false;
    rec.continuous      = false;
    rec.maxAlternatives = 1;
    activeRecRef.current = rec;

    rec.onresult = (ev) => {
      const transcript = ev.results[0][0].transcript.trim();
      if (transcript) {
        sendToJarvis(transcript);
      } else {
        setMode("wake");
        startWakeListener();
      }
    };

    rec.onerror = () => { setMode("wake"); startWakeListener(); };

    rec.onend = () => {
      if (modeRef.current === "listening") { setMode("wake"); startWakeListener(); }
    };

    try { rec.start(); }
    catch (e) { console.error("[active] start failed:", e); setMode("wake"); startWakeListener(); }
  }

  // ── Send to Groq ──────────────────────────────────────────────────────
  async function sendToJarvis(text: string) {
    setMode("thinking");

    const history: Message[] = [
      ...messagesRef.current,
      { role: "user", content: text },
    ];
    messagesRef.current = history;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.slice(-20).map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      const reply = data.reply as string;
      messagesRef.current = [...history, { role: "assistant", content: reply }];

      speak(reply, () => { setMode("wake"); startWakeListener(); });
    } catch (err) {
      console.error("[jarvis]", err);
      speak("Desculpe, houve um problema na comunicação.", () => {
        setMode("wake");
        startWakeListener();
      });
    }
  }

  // ── Orb click ─────────────────────────────────────────────────────────
  function handleOrbClick() {
    // ALWAYS unlock TTS on any click — Chrome requires a user gesture.
    unlockTTS();

    if (!micReadyRef.current) {
      micReadyRef.current = true;
      setMode("wake");
      startWakeListener();
      return;
    }

    const m = modeRef.current;

    if (m === "speaking") {
      stopSpeaking();
      setMode("wake");
      startWakeListener();
      return;
    }
    if (m === "thinking") return;
    if (m === "listening") {
      try { activeRecRef.current?.abort(); } catch { /* ok */ }
      setMode("wake");
      startWakeListener();
      return;
    }

    // wake → activate directly without wake word
    clearTimer();
    try { wakeRecRef.current?.abort(); } catch { /* ok */ }
    wakeRecRef.current = null;
    restartRef.current = setTimeout(() => startActiveListener(), 120);
  }

  // ── Mount ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      if (!micReadyRef.current) {
        micReadyRef.current = true;
        setMode("wake");
        startWakeListener();
      }
    }, 500);

    // Chrome TTS keepalive — prevents synthesis from silently dying
    const keepalive = setInterval(() => {
      if (window.speechSynthesis?.speaking) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, 10_000);

    return () => {
      clearTimeout(t);
      clearTimer();
      clearInterval(keepalive);
      try { wakeRecRef.current?.abort(); } catch { /* ok */ }
      try { activeRecRef.current?.abort(); } catch { /* ok */ }
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="fixed inset-0 flex items-center justify-center bg-black">
      <Orb state={orbState} onClick={handleOrbClick} />
    </main>
  );
}
