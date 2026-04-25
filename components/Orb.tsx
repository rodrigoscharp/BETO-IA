"use client";

import { useEffect, useRef } from "react";

type OrbState = "idle" | "listening" | "thinking" | "speaking";

interface OrbProps {
  state: OrbState;
}

const STATE_LABELS: Record<OrbState, string> = {
  idle: "AGUARDANDO",
  listening: "OUVINDO",
  thinking: "PROCESSANDO",
  speaking: "RESPONDENDO",
};

export default function Orb({ state }: OrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const phaseRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const SIZE = canvas.width;
    const CX = SIZE / 2;
    const CY = SIZE / 2;

    function getStateParams() {
      switch (state) {
        case "speaking":
          return { speed: 0.12, amplitude: 18, ringCount: 5, alpha: 0.9 };
        case "listening":
          return { speed: 0.04, amplitude: 8, ringCount: 4, alpha: 0.7 };
        case "thinking":
          return { speed: 0.08, amplitude: 12, ringCount: 4, alpha: 0.8 };
        default:
          return { speed: 0.02, amplitude: 5, ringCount: 3, alpha: 0.6 };
      }
    }

    function draw() {
      ctx!.clearRect(0, 0, SIZE, SIZE);
      const { speed, amplitude, ringCount, alpha } = getStateParams();
      phaseRef.current += speed;
      const phase = phaseRef.current;

      // Outer expanding rings
      for (let i = 0; i < ringCount; i++) {
        const offset = (i / ringCount) * Math.PI * 2;
        const pulse = Math.sin(phase + offset);
        const radius = 90 + i * 22 + pulse * amplitude;
        const ringAlpha = alpha * (1 - i / ringCount) * (0.5 + 0.5 * pulse);

        ctx!.beginPath();
        ctx!.arc(CX, CY, radius, 0, Math.PI * 2);
        ctx!.strokeStyle =
          state === "speaking"
            ? `rgba(0, 212, 255, ${ringAlpha})`
            : `rgba(0, 180, 220, ${ringAlpha * 0.7})`;
        ctx!.lineWidth = state === "speaking" ? 2 : 1;
        ctx!.stroke();
      }

      // Gold accent ring (rotates)
      const goldRadius = 75 + Math.sin(phase * 1.3) * 6;
      ctx!.beginPath();
      ctx!.arc(CX, CY, goldRadius, 0, Math.PI * 2);
      ctx!.strokeStyle = `rgba(255, 215, 0, ${0.2 + 0.15 * Math.sin(phase)})`;
      ctx!.lineWidth = 1;
      ctx!.stroke();

      // Core orb gradient
      const coreRadius = 60 + Math.sin(phase * 2) * (state === "speaking" ? 8 : 3);
      const grad = ctx!.createRadialGradient(
        CX - coreRadius * 0.2,
        CY - coreRadius * 0.2,
        0,
        CX,
        CY,
        coreRadius
      );
      grad.addColorStop(0, "rgba(255,255,255,0.95)");
      grad.addColorStop(0.2, "rgba(100, 230, 255, 0.9)");
      grad.addColorStop(0.5, "rgba(0, 180, 255, 0.85)");
      grad.addColorStop(0.8, "rgba(0, 80, 180, 0.7)");
      grad.addColorStop(1, "rgba(0, 20, 80, 0)");

      ctx!.beginPath();
      ctx!.arc(CX, CY, coreRadius, 0, Math.PI * 2);
      ctx!.fillStyle = grad;
      ctx!.fill();

      // Core glow
      const glowGrad = ctx!.createRadialGradient(CX, CY, 0, CX, CY, coreRadius * 1.8);
      const glowAlpha = state === "speaking" ? 0.5 : 0.25;
      glowGrad.addColorStop(0, `rgba(0, 212, 255, ${glowAlpha})`);
      glowGrad.addColorStop(1, "transparent");
      ctx!.beginPath();
      ctx!.arc(CX, CY, coreRadius * 1.8, 0, Math.PI * 2);
      ctx!.fillStyle = glowGrad;
      ctx!.fill();

      // Specular highlight
      const hlGrad = ctx!.createRadialGradient(
        CX - coreRadius * 0.3,
        CY - coreRadius * 0.35,
        0,
        CX - coreRadius * 0.2,
        CY - coreRadius * 0.2,
        coreRadius * 0.45
      );
      hlGrad.addColorStop(0, "rgba(255,255,255,0.6)");
      hlGrad.addColorStop(1, "transparent");
      ctx!.beginPath();
      ctx!.arc(
        CX - coreRadius * 0.2,
        CY - coreRadius * 0.25,
        coreRadius * 0.45,
        0,
        Math.PI * 2
      );
      ctx!.fillStyle = hlGrad;
      ctx!.fill();

      // Waveform arcs when speaking
      if (state === "speaking" || state === "listening") {
        const bars = 24;
        for (let i = 0; i < bars; i++) {
          const angle = (i / bars) * Math.PI * 2 - Math.PI / 2;
          const barHeight =
            8 + Math.abs(Math.sin(phase * 3 + i * 0.5)) * (state === "speaking" ? 22 : 10);
          const innerR = coreRadius + 4;
          const outerR = innerR + barHeight;
          const barAlpha = state === "speaking" ? 0.8 : 0.5;

          ctx!.beginPath();
          ctx!.moveTo(
            CX + Math.cos(angle) * innerR,
            CY + Math.sin(angle) * innerR
          );
          ctx!.lineTo(
            CX + Math.cos(angle) * outerR,
            CY + Math.sin(angle) * outerR
          );
          ctx!.strokeStyle =
            state === "speaking"
              ? `rgba(0, 212, 255, ${barAlpha})`
              : `rgba(0, 180, 220, ${barAlpha})`;
          ctx!.lineWidth = 2;
          ctx!.stroke();
        }
      }

      animFrameRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [state]);

  return (
    <div className="flex flex-col items-center gap-4 select-none">
      {/* Canvas orb */}
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={300}
          height={300}
          className="block"
          style={{ filter: state === "speaking" ? "drop-shadow(0 0 24px #00d4ff)" : "drop-shadow(0 0 12px #00d4ff88)" }}
        />
      </div>

      {/* State label */}
      <div className="flex items-center gap-2">
        <span
          className="block w-2 h-2 rounded-full"
          style={{
            background: state === "speaking" ? "#00d4ff" : state === "listening" ? "#ffd700" : "#00d4ff44",
            boxShadow:
              state === "idle"
                ? "none"
                : `0 0 8px ${state === "listening" ? "#ffd700" : "#00d4ff"}`,
          }}
        />
        <span
          className="font-tech text-xs tracking-[0.3em]"
          style={{
            color: state === "listening" ? "#ffd700" : "#00d4ff",
            textShadow: `0 0 10px ${state === "listening" ? "rgba(255,215,0,0.6)" : "rgba(0,212,255,0.6)"}`,
          }}
        >
          {STATE_LABELS[state]}
        </span>
        {(state === "thinking") && (
          <span className="font-tech text-xs text-jarvis-cyan blink">_</span>
        )}
      </div>
    </div>
  );
}
