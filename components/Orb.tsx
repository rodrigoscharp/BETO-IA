"use client";

import { useEffect, useRef } from "react";

export type OrbState = "wake" | "listening" | "thinking" | "speaking";

interface OrbProps {
  state: OrbState;
  onClick: () => void;
}

const SIZE = 700;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R  = 128;

const BLOBS = [
  { fx: 0.43, fy: 0.57, ax: 0.42, ay: 0.34, ph0: 0.00, r: 40,  g: 145, b: 255, sz: R * 0.90 },
  { fx: 0.31, fy: 0.72, ax: 0.37, ay: 0.46, ph0: 2.09, r: 0,   g: 215, b: 255, sz: R * 0.72 },
  { fx: 0.67, fy: 0.28, ax: 0.51, ay: 0.31, ph0: 4.19, r: 130, g: 160, b: 255, sz: R * 0.58 },
];

export default function Orb({ state, onClick }: OrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef  = useRef(0);
  const phRef     = useRef(0);
  const stateRef  = useRef(state);

  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function draw() {
      const s = stateRef.current;

      phRef.current +=
        s === "speaking"  ? 0.075 :
        s === "thinking"  ? 0.040 :
        s === "listening" ? 0.026 : 0.008;
      const ph = phRef.current;

      // Composite voice pulse for speaking
      const vp = s === "speaking"
        ? 0.5 * Math.abs(Math.sin(ph * 3.7))
        + 0.3 * Math.abs(Math.sin(ph * 7.1  + 1.2))
        + 0.2 * Math.abs(Math.sin(ph * 13.3 + 2.4))
        : 0;

      const breath = 0.5 + 0.5 * Math.sin(ph * 0.7);

      const hue =
        s === "thinking"  ? 265 :
        s === "listening" ? 188 :
        s === "speaking"  ? 205 : 215;

      ctx!.clearRect(0, 0, SIZE, SIZE);

      // ── Distant ambient glow ─────────────────────────────────────────────
      {
        const gr = R * (s === "speaking" ? 3.8 + vp * 0.6 : s === "listening" ? 3.2 : 2.6 + breath * 0.2);
        const ga = s === "speaking" ? 0.07 + vp * 0.05 : s === "listening" ? 0.06 : 0.040;
        const g  = ctx!.createRadialGradient(CX, CY, R * 0.4, CX, CY, gr);
        g.addColorStop(0,    `hsla(${hue},85%,65%,0)`);
        g.addColorStop(0.35, `hsla(${hue},80%,60%,${ga * 0.5})`);
        g.addColorStop(0.65, `hsla(${hue},75%,55%,${ga})`);
        g.addColorStop(1,    `hsla(${hue},70%,50%,0)`);
        ctx!.beginPath();
        ctx!.arc(CX, CY, gr, 0, Math.PI * 2);
        ctx!.fillStyle = g;
        ctx!.fill();
      }

      // ── Sphere (clipped) ─────────────────────────────────────────────────
      ctx!.save();
      ctx!.beginPath();
      ctx!.arc(CX, CY, R, 0, Math.PI * 2);
      ctx!.clip();

      // Dark body
      {
        const g = ctx!.createRadialGradient(CX - R * 0.15, CY - R * 0.2, 0, CX, CY, R);
        g.addColorStop(0,   `hsl(${hue},35%,12%)`);
        g.addColorStop(0.6, `hsl(${hue},45%,7%)`);
        g.addColorStop(1,   `hsl(${hue},55%,4%)`);
        ctx!.fillStyle = g;
        ctx!.fillRect(CX - R, CY - R, R * 2, R * 2);
      }

      // Animated plasma blobs
      const blobSpeed = s === "speaking" ? 2.0 : s === "thinking" ? 1.7 : s === "listening" ? 1.3 : 1.0;
      const blobAlpha = s === "speaking" ? 0.40 + vp * 0.30 : s === "listening" ? 0.32 : s === "thinking" ? 0.24 : 0.18;

      for (const b of BLOBS) {
        const bx = CX + Math.sin(ph * b.fx * blobSpeed + b.ph0) * b.ax * R;
        const by = CY + Math.cos(ph * b.fy * blobSpeed + b.ph0 * 1.37) * b.ay * R;
        const g  = ctx!.createRadialGradient(bx, by, 0, bx, by, b.sz);
        g.addColorStop(0,    `rgba(${b.r},${b.g},${b.b},${blobAlpha})`);
        g.addColorStop(0.45, `rgba(${b.r},${b.g},${b.b},${blobAlpha * 0.35})`);
        g.addColorStop(1,    `rgba(${b.r},${b.g},${b.b},0)`);
        ctx!.fillStyle = g;
        ctx!.fillRect(CX - R, CY - R, R * 2, R * 2);
      }

      // Inner core highlight
      {
        const cA = s === "speaking"
          ? 0.50 + vp * 0.35
          : s === "listening" ? 0.32 + breath * 0.10
          : 0.20 + breath * 0.06;
        const g = ctx!.createRadialGradient(CX, CY, 0, CX, CY, R * 0.55);
        g.addColorStop(0,   `hsla(${hue + 20},95%,95%,${cA})`);
        g.addColorStop(0.5, `hsla(${hue + 10},85%,75%,${cA * 0.25})`);
        g.addColorStop(1,   `hsla(${hue},80%,60%,0)`);
        ctx!.fillStyle = g;
        ctx!.fillRect(CX - R, CY - R, R * 2, R * 2);
      }

      // Fresnel rim glow
      {
        const rA = s === "speaking" ? 0.75 + vp * 0.20 : s === "listening" ? 0.55 : 0.38;
        const g  = ctx!.createRadialGradient(CX, CY, R * 0.62, CX, CY, R);
        g.addColorStop(0,    `hsla(${hue + 15},90%,88%,0)`);
        g.addColorStop(0.65, `hsla(${hue + 10},90%,85%,${rA * 0.12})`);
        g.addColorStop(0.85, `hsla(${hue + 15},95%,92%,${rA * 0.50})`);
        g.addColorStop(1,    `hsla(${hue + 20},100%,98%,${rA * 0.88})`);
        ctx!.fillStyle = g;
        ctx!.fillRect(CX - R, CY - R, R * 2, R * 2);
      }

      // Top specular gloss
      {
        const g = ctx!.createRadialGradient(CX - R * 0.28, CY - R * 0.35, 0, CX - R * 0.15, CY - R * 0.2, R * 0.55);
        g.addColorStop(0,   `rgba(255,255,255,0.18)`);
        g.addColorStop(0.4, `rgba(255,255,255,0.06)`);
        g.addColorStop(1,   `rgba(255,255,255,0)`);
        ctx!.fillStyle = g;
        ctx!.fillRect(CX - R, CY - R, R * 2, R * 2);
      }

      ctx!.restore();

      // ── Corona ───────────────────────────────────────────────────────────
      {
        const cr = R * (s === "speaking"
          ? 1.55 + vp * 0.25
          : s === "listening" ? 1.42 + 0.08 * Math.sin(ph * 1.5)
          : 1.28 + breath * 0.04);
        const ca = s === "speaking" ? 0.32 + vp * 0.18 : s === "listening" ? 0.22 : s === "thinking" ? 0.18 : 0.12;
        const g  = ctx!.createRadialGradient(CX, CY, R * 0.88, CX, CY, cr);
        g.addColorStop(0,   `hsla(${hue},88%,72%,${ca})`);
        g.addColorStop(0.5, `hsla(${hue},82%,65%,${ca * 0.4})`);
        g.addColorStop(1,   `hsla(${hue},76%,55%,0)`);
        ctx!.beginPath();
        ctx!.arc(CX, CY, cr, 0, Math.PI * 2);
        ctx!.fillStyle = g;
        ctx!.fill();
      }

      // ── Listening: expanding rings ───────────────────────────────────────
      if (s === "listening") {
        for (let i = 0; i < 3; i++) {
          const t  = (ph * 0.27 + i / 3) % 1;
          const rr = R * (1.05 + t * 1.9);
          const ra = (1 - t) * 0.20 * (0.7 + 0.3 * Math.sin(ph));
          ctx!.beginPath();
          ctx!.arc(CX, CY, rr, 0, Math.PI * 2);
          ctx!.strokeStyle = `hsla(${hue},90%,78%,${ra})`;
          ctx!.lineWidth   = 1.2 * (1 - t * 0.5);
          ctx!.stroke();
        }
      }

      // ── Thinking: rotating dashed arcs ──────────────────────────────────
      if (s === "thinking") {
        ctx!.save();
        ctx!.translate(CX, CY);
        [
          { spd:  0.55, r: R * 1.38, arc: 0.65, lw: 1.5, a: 0.22, dash: [8,  14] },
          { spd: -0.38, r: R * 1.62, arc: 0.45, lw: 1.1, a: 0.14, dash: [6,  18] },
          { spd:  0.22, r: R * 1.84, arc: 0.30, lw: 0.8, a: 0.08, dash: [4,  22] },
        ].forEach(({ spd, r, arc, lw, a, dash }) => {
          ctx!.save();
          ctx!.rotate(ph * spd);
          ctx!.beginPath();
          ctx!.arc(0, 0, r, 0, Math.PI * arc);
          ctx!.strokeStyle = `hsla(${hue},88%,74%,${a})`;
          ctx!.lineWidth   = lw;
          ctx!.setLineDash(dash);
          ctx!.stroke();
          ctx!.setLineDash([]);
          ctx!.restore();
        });
        ctx!.restore();
      }

      // ── Speaking: shockwave rings ────────────────────────────────────────
      if (s === "speaking") {
        for (let w = 0; w < 4; w++) {
          const t  = (ph * 2.0 + w * 0.25) % 1;
          const rr = R * (1.05 + t * 2.2);
          const wa = (1 - t) * (0.22 + vp * 0.18) * Math.max(0, 1 - w * 0.18);
          ctx!.beginPath();
          ctx!.arc(CX, CY, rr, 0, Math.PI * 2);
          ctx!.strokeStyle = `hsla(${hue},88%,80%,${wa})`;
          ctx!.lineWidth   = Math.max(0.4, 1.4 * (1 - t * 0.8));
          ctx!.stroke();
        }
      }

      // ── Wake: slow breathing ring ────────────────────────────────────────
      if (s === "wake") {
        const wr = R * (1.18 + 0.06 * Math.sin(ph * 0.45));
        ctx!.beginPath();
        ctx!.arc(CX, CY, wr, 0, Math.PI * 2);
        ctx!.strokeStyle = `hsla(${hue},78%,65%,${0.07 + 0.03 * Math.sin(ph * 0.45)})`;
        ctx!.lineWidth   = 0.7;
        ctx!.stroke();
      }

      frameRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(frameRef.current);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={SIZE}
      height={SIZE}
      onClick={onClick}
      style={{
        cursor:  "pointer",
        display: "block",
        width:   "min(700px, 92vw)",
        height:  "min(700px, 92vh)",
      }}
    />
  );
}
