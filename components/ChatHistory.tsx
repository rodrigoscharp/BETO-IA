"use client";

import { useEffect, useRef } from "react";

export interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
}

interface ChatHistoryProps {
  messages: Message[];
  isThinking: boolean;
}

function formatTime(date?: Date) {
  if (!date) return "";
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function ChatHistory({ messages, isThinking }: ChatHistoryProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  if (messages.length === 0 && !isThinking) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 opacity-40 select-none">
        <div className="font-tech text-xs tracking-widest text-jarvis-cyan">
          SISTEMA PRONTO
        </div>
        <div className="font-mono text-xs text-jarvis-cyan/60 text-center max-w-xs">
          Clique no microfone ou digite uma mensagem para iniciar a conversa com J.A.R.V.I.S
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 py-2">
      {messages.map((msg, idx) => (
        <div
          key={idx}
          className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-slide-up`}
        >
          {msg.role === "assistant" && (
            <div className="flex flex-col items-start gap-1 max-w-[85%] sm:max-w-[75%]">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="font-tech text-[10px] tracking-widest"
                  style={{ color: "#00d4ff", textShadow: "0 0 8px rgba(0,212,255,0.5)" }}
                >
                  J.A.R.V.I.S
                </span>
                <span className="text-[10px] text-jarvis-cyan/30 font-mono">
                  {formatTime(msg.timestamp)}
                </span>
              </div>
              <div className="msg-jarvis rounded-r-lg rounded-bl-lg px-4 py-3">
                <p className="font-mono text-sm text-jarvis-cyan/90 leading-relaxed whitespace-pre-wrap">
                  {msg.content}
                </p>
              </div>
            </div>
          )}

          {msg.role === "user" && (
            <div className="flex flex-col items-end gap-1 max-w-[85%] sm:max-w-[75%]">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] text-jarvis-gold/30 font-mono">
                  {formatTime(msg.timestamp)}
                </span>
                <span
                  className="font-tech text-[10px] tracking-widest"
                  style={{ color: "#ffd700", textShadow: "0 0 8px rgba(255,215,0,0.4)" }}
                >
                  VOCÊ
                </span>
              </div>
              <div className="msg-user rounded-l-lg rounded-br-lg px-4 py-3">
                <p className="font-mono text-sm text-jarvis-gold/90 leading-relaxed whitespace-pre-wrap">
                  {msg.content}
                </p>
              </div>
            </div>
          )}
        </div>
      ))}

      {isThinking && (
        <div className="flex justify-start animate-fade-in">
          <div className="flex flex-col items-start gap-1 max-w-[75%]">
            <span
              className="font-tech text-[10px] tracking-widest mb-1"
              style={{ color: "#00d4ff", textShadow: "0 0 8px rgba(0,212,255,0.5)" }}
            >
              J.A.R.V.I.S
            </span>
            <div className="msg-jarvis rounded-r-lg rounded-bl-lg px-4 py-3">
              <div className="flex items-end gap-1 h-5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    className="wave-bar inline-block w-1 rounded-full bg-jarvis-cyan"
                    style={{ animationDelay: `${i * 0.1}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
