"use client";

import { useEffect, useRef, useState } from "react";

interface NowPlaying {
  playing:    boolean;
  track:      string;
  artist:     string;
  albumArt:   string | null;
  albumName:  string;
  progressMs: number;
  durationMs: number;
}

interface Props {
  onCommand: (action: string) => void;
}

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function MiniPlayer({ onCommand }: Props) {
  const [info,    setInfo]    = useState<NowPlaying | null>(null);
  const [visible, setVisible] = useState(false);
  const [localMs, setLocalMs] = useState(0); // local progress ticker
  const tickRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── poll Spotify every 3 s ──────────────────────────────────────────── */
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("/api/spotify/now-playing");
        if (!res.ok) return;
        const d: NowPlaying = await res.json();
        if (d.playing) {
          setInfo(d);
          setLocalMs(d.progressMs);
          setVisible(true);
        } else {
          setVisible(false);
        }
      } catch { /* ignore */ }
    };

    poll();
    pollRef.current = setInterval(poll, 3000);
    return () => { clearInterval(pollRef.current!); };
  }, []);

  /* ── local progress tick (every second) ─────────────────────────────── */
  useEffect(() => {
    clearInterval(tickRef.current!);
    if (info?.playing) {
      tickRef.current = setInterval(() => {
        setLocalMs(prev => Math.min(prev + 1000, info.durationMs));
      }, 1000);
    }
    return () => clearInterval(tickRef.current!);
  }, [info]);

  if (!visible || !info) return null;

  const pct = info.durationMs > 0
    ? Math.min(100, (localMs / info.durationMs) * 100)
    : 0;

  return (
    <div style={{
      position: "fixed",
      bottom: 24,
      right: 24,
      width: 290,
      background: "rgba(8, 14, 28, 0.92)",
      backdropFilter: "blur(20px)",
      border: "1px solid rgba(255,255,255,0.10)",
      borderRadius: 14,
      padding: "12px 14px",
      boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
      animation: "slideIn 0.3s cubic-bezier(.22,.68,0,1.2)",
      zIndex: 100,
      userSelect: "none",
    }}>

      {/* close */}
      <button
        onClick={() => setVisible(false)}
        style={{
          position: "absolute", top: 8, right: 10,
          background: "none", border: "none",
          color: "rgba(255,255,255,0.35)", fontSize: 16,
          cursor: "pointer", lineHeight: 1, padding: 2,
        }}
      >×</button>

      {/* top row: art + track info */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
        {info.albumArt
          ? <img src={info.albumArt} alt="capa"
              style={{ width: 52, height: 52, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
          : <div style={{
              width: 52, height: 52, borderRadius: 8, flexShrink: 0,
              background: "rgba(255,255,255,0.08)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22,
            }}>♪</div>
        }
        <div style={{ overflow: "hidden" }}>
          <div style={{
            color: "#fff", fontSize: 13, fontWeight: 600,
            fontFamily: "'Segoe UI', system-ui, sans-serif",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>{info.track}</div>
          <div style={{
            color: "rgba(255,255,255,0.50)", fontSize: 11,
            fontFamily: "'Segoe UI', system-ui, sans-serif",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            marginTop: 2,
          }}>{info.artist}</div>
        </div>
      </div>

      {/* progress bar */}
      <div style={{ marginBottom: 10 }}>
        <div style={{
          height: 3, borderRadius: 3,
          background: "rgba(255,255,255,0.12)",
          position: "relative", overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", left: 0, top: 0, height: "100%",
            width: `${pct}%`,
            background: "linear-gradient(90deg, #1ed760, #1db954)",
            borderRadius: 3,
            transition: "width 0.9s linear",
          }} />
        </div>
        <div style={{
          display: "flex", justifyContent: "space-between",
          marginTop: 4,
          color: "rgba(255,255,255,0.30)", fontSize: 10,
          fontFamily: "monospace",
        }}>
          <span>{fmt(localMs)}</span>
          <span>{fmt(info.durationMs)}</span>
        </div>
      </div>

      {/* controls */}
      <div style={{ display: "flex", justifyContent: "center", gap: 20, alignItems: "center" }}>
        {[
          { icon: "⏮", action: "previous", size: 18 },
          { icon: info.playing ? "⏸" : "▶", action: info.playing ? "pause" : "resume", size: 22 },
          { icon: "⏭", action: "next", size: 18 },
        ].map(({ icon, action, size }) => (
          <button
            key={action}
            onClick={() => onCommand(action)}
            style={{
              background: "none", border: "none",
              color: "rgba(255,255,255,0.80)", fontSize: size,
              cursor: "pointer", padding: "4px 8px",
              borderRadius: 6, lineHeight: 1,
              transition: "color 0.15s, transform 0.1s",
            }}
            onMouseEnter={e => (e.currentTarget.style.color = "#fff")}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.80)")}
            onMouseDown={e => (e.currentTarget.style.transform = "scale(0.88)")}
            onMouseUp={e => (e.currentTarget.style.transform = "scale(1)")}
          >{icon}</button>
        ))}
      </div>

      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
      `}</style>
    </div>
  );
}
