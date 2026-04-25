"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Orb from "@/components/Orb";
import ChatHistory, { Message } from "@/components/ChatHistory";
import VoiceInput from "@/components/VoiceInput";

type OrbState = "idle" | "listening" | "thinking" | "speaking";

// Extend window for speech synthesis
declare global {
  interface Window {
    speechSynthesis: SpeechSynthesis;
  }
}

export default function JarvisPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [isThinking, setIsThinking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Stop any ongoing speech
  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  // Speak a response using the Web Speech API
  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;

      stopSpeaking();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "pt-BR";
      utterance.rate = 0.95;
      utterance.pitch = 0.9;
      utterance.volume = 1;

      // Try to pick a Portuguese voice
      const voices = window.speechSynthesis.getVoices();
      const ptVoice = voices.find(
        (v) =>
          v.lang.startsWith("pt") &&
          (v.name.toLowerCase().includes("male") ||
            !v.name.toLowerCase().includes("female"))
      );
      if (ptVoice) utterance.voice = ptVoice;

      utterance.onstart = () => setOrbState("speaking");
      utterance.onend = () => setOrbState("idle");
      utterance.onerror = () => setOrbState("idle");

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [stopSpeaking]
  );

  // Ensure voices are loaded
  useEffect(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isThinking) return;

      stopSpeaking();

      const userMessage: Message = {
        role: "user",
        content: text.trim(),
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setInputText("");
      setIsThinking(true);
      setOrbState("thinking");

      try {
        // Build history for the API (last 20 messages for context)
        const history = [...messages, userMessage].slice(-20).map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || `HTTP ${res.status}`);
        }

        const assistantMessage: Message = {
          role: "assistant",
          content: data.reply,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
        setIsThinking(false);

        // Speak the response
        speak(data.reply);
      } catch (err: unknown) {
        console.error("[Jarvis] Erro na requisição:", err);
        const errMsg =
          err instanceof Error ? err.message : "Falha na comunicação.";
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Desculpe, encontrei um problema: ${errMsg}`,
            timestamp: new Date(),
          },
        ]);
        setIsThinking(false);
        setOrbState("idle");
      }
    },
    [messages, isThinking, speak, stopSpeaking]
  );

  const handleVoiceTranscript = useCallback(
    (text: string) => {
      sendMessage(text);
    },
    [sendMessage]
  );

  const handleListeningChange = useCallback((listening: boolean) => {
    setOrbState(listening ? "listening" : "idle");
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputText);
    }
  };

  const isDisabled = isThinking || orbState === "speaking";

  return (
    <main className="relative min-h-screen bg-jarvis-dark bg-grid overflow-hidden flex flex-col">
      {/* Ambient background glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(0,212,255,0.07) 0%, transparent 70%)",
        }}
      />

      {/* Scan line overlay */}
      <div className="pointer-events-none absolute inset-0 scanline opacity-30" />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-jarvis-cyan/10">
        <div className="flex items-center gap-3">
          {/* Corner bracket decoration */}
          <div className="relative w-8 h-8">
            <span className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-jarvis-cyan/60" />
            <span className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-jarvis-cyan/60" />
          </div>
          <div>
            <h1
              className="font-tech text-lg sm:text-xl tracking-[0.25em] leading-none"
              style={{
                color: "#00d4ff",
                textShadow:
                  "0 0 10px rgba(0,212,255,0.7), 0 0 30px rgba(0,212,255,0.3)",
              }}
            >
              J.A.R.V.I.S
            </h1>
            <p className="font-mono text-[9px] tracking-widest text-jarvis-cyan/40 mt-0.5">
              JUST A RATHER VERY INTELLIGENT SYSTEM
            </p>
          </div>
        </div>

        {/* Status indicators */}
        <div className="hidden sm:flex items-center gap-4">
          {(["NÚCLEO", "API", "VOZ"] as const).map((label) => (
            <div key={label} className="flex items-center gap-1.5">
              <span
                className="w-1.5 h-1.5 rounded-full bg-jarvis-cyan"
                style={{ boxShadow: "0 0 6px #00d4ff" }}
              />
              <span className="font-mono text-[9px] tracking-widest text-jarvis-cyan/50">
                {label}
              </span>
            </div>
          ))}
        </div>
      </header>

      {/* Main content */}
      <div className="relative z-10 flex flex-col lg:flex-row flex-1 overflow-hidden">
        {/* Left panel — Orb */}
        <div className="flex flex-col items-center justify-center px-6 py-6 lg:py-0 lg:w-[340px] lg:border-r border-jarvis-cyan/10 shrink-0">
          <Orb state={orbState} />

          {/* Quick stats */}
          <div className="mt-6 grid grid-cols-3 gap-4 w-full max-w-[280px]">
            {[
              { label: "MODELO", value: "LLAMA3-70B" },
              { label: "IDIOMA", value: "PT-BR" },
              { label: "MEMÓRIA", value: `${messages.length} MSG` },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="font-mono text-[8px] text-jarvis-cyan/30 tracking-widest mb-1">
                  {stat.label}
                </p>
                <p className="font-tech text-[10px] text-jarvis-cyan/70">
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Right panel — Chat */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Chat history */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
            <ChatHistory messages={messages} isThinking={isThinking} />
          </div>

          {/* Divider */}
          <div className="border-t border-jarvis-cyan/10 mx-4 sm:mx-6" />

          {/* Input area */}
          <div className="px-4 sm:px-6 py-4">
            <div
              className="flex items-center gap-3 rounded-lg border border-jarvis-cyan/20 bg-jarvis-blue/30 px-4 py-3 transition-all duration-300"
              style={{
                boxShadow: isDisabled
                  ? undefined
                  : "0 0 0 0 transparent",
              }}
            >
              {/* Voice input button */}
              <VoiceInput
                onTranscript={handleVoiceTranscript}
                onListeningChange={handleListeningChange}
                disabled={isDisabled}
              />

              {/* Separator */}
              <div className="w-px h-6 bg-jarvis-cyan/20" />

              {/* Text input */}
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isDisabled}
                placeholder={
                  isThinking
                    ? "Processando..."
                    : orbState === "speaking"
                    ? "J.A.R.V.I.S está falando..."
                    : "Digite ou use o microfone..."
                }
                className="input-jarvis flex-1 bg-transparent font-mono text-sm text-jarvis-cyan/90 placeholder:text-jarvis-cyan/25 border-none focus:outline-none disabled:opacity-30 disabled:cursor-not-allowed"
              />

              {/* Send button */}
              <button
                onClick={() => sendMessage(inputText)}
                disabled={isDisabled || !inputText.trim()}
                className="flex items-center justify-center w-9 h-9 rounded border border-jarvis-cyan/30 text-jarvis-cyan/60 hover:text-jarvis-cyan hover:border-jarvis-cyan hover:bg-jarvis-cyan/10 transition-all duration-200 disabled:opacity-20 disabled:cursor-not-allowed focus:outline-none"
                title="Enviar"
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>

            {/* Footer hint */}
            <p className="mt-2 font-mono text-[9px] text-jarvis-cyan/20 text-center tracking-widest">
              ENTER para enviar · MICROFONE para voz · GROQ llama3-70b-8192
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
