"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  onListeningChange: (listening: boolean) => void;
  disabled: boolean;
}

// Minimal type shim for the Web Speech API (not in all TS lib targets)
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
  onstart: ((this: ISpeechRecognition, ev: Event) => void) | null;
  onresult: ((this: ISpeechRecognition, ev: ISpeechRecognitionEvent) => void) | null;
  onerror: ((this: ISpeechRecognition, ev: Event) => void) | null;
  onend: ((this: ISpeechRecognition, ev: Event) => void) | null;
}

interface ISpeechRecognitionConstructor {
  new (): ISpeechRecognition;
}

declare global {
  interface Window {
    SpeechRecognition: ISpeechRecognitionConstructor;
    webkitSpeechRecognition: ISpeechRecognitionConstructor;
  }
}

export default function VoiceInput({
  onTranscript,
  onListeningChange,
  disabled,
}: VoiceInputProps) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [interimText, setInterimText] = useState("");
  const recognitionRef = useRef<ISpeechRecognition | null>(null);

  useEffect(() => {
    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setIsSupported(false);
    }
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
    setInterimText("");
    onListeningChange(false);
  }, [onListeningChange]);

  const startListening = useCallback(() => {
    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = "pt-BR";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      onListeningChange(true);
    };

    recognition.onresult = (event) => {
      let interim = "";
      let final = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }

      setInterimText(interim);

      if (final.trim()) {
        setInterimText("");
        setIsListening(false);
        onListeningChange(false);
        onTranscript(final.trim());
      }
    };

    recognition.onerror = (event) => {
      const errEvent = event as ErrorEvent;
      console.error("[VoiceInput] Erro:", errEvent.message);
      setIsListening(false);
      setInterimText("");
      onListeningChange(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimText("");
      onListeningChange(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [onTranscript, onListeningChange]);

  const toggle = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  if (!isSupported) {
    return (
      <div
        className="flex items-center gap-2 px-3 py-2 rounded border border-jarvis-cyan/20 opacity-40"
        title="Reconhecimento de voz não suportado neste navegador"
      >
        <svg
          className="w-4 h-4 text-jarvis-cyan/40"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
          />
        </svg>
        <span className="font-mono text-xs text-jarvis-cyan/40">
          Voz indisponível
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {/* Interim transcript preview */}
      {interimText && (
        <span className="font-mono text-xs text-jarvis-gold/70 italic max-w-[200px] truncate">
          {interimText}
          <span className="blink">_</span>
        </span>
      )}

      {/* Mic button */}
      <button
        onClick={toggle}
        disabled={disabled}
        title={isListening ? "Parar escuta" : "Ativar microfone"}
        className={`relative flex items-center justify-center w-12 h-12 rounded-full border transition-all duration-300 focus:outline-none
          ${
            isListening
              ? "border-jarvis-gold bg-jarvis-gold/10"
              : "border-jarvis-cyan/40 bg-transparent hover:border-jarvis-cyan hover:bg-jarvis-cyan/10"
          }
          ${disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}
        `}
        style={{
          boxShadow: isListening
            ? "0 0 20px rgba(255,215,0,0.4), 0 0 40px rgba(255,215,0,0.2)"
            : undefined,
        }}
      >
        {/* Pulse ring when listening */}
        {isListening && (
          <span
            className="absolute inset-0 rounded-full border border-jarvis-gold animate-ping"
            style={{ animationDuration: "1s" }}
          />
        )}

        {isListening ? (
          /* Waveform icon while listening */
          <svg
            className="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#ffd700"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <line x1="4" y1="12" x2="4" y2="12" />
            <line x1="7" y1="8" x2="7" y2="16" />
            <line x1="10" y1="5" x2="10" y2="19" />
            <line x1="13" y1="9" x2="13" y2="15" />
            <line x1="16" y1="7" x2="16" y2="17" />
            <line x1="19" y1="11" x2="19" y2="13" />
          </svg>
        ) : (
          /* Mic icon */
          <svg
            className="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: "#00d4ff" }}
          >
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 10a7 7 0 0014 0" />
            <line x1="12" y1="20" x2="12" y2="22" />
            <line x1="8" y1="22" x2="16" y2="22" />
          </svg>
        )}
      </button>
    </div>
  );
}
