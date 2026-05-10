"use client";

import { useEffect, useRef } from "react";

export type OrbState = "wake" | "listening" | "thinking" | "speaking";
interface OrbProps { state: OrbState; onClick: () => void; }

const N = 200;

type P = {
  x: number; y: number;
  vx: number; vy: number;
  size: number;
  alpha: number;
  phase: number;
  phaseSpd: number;
  orbitR: number;
  orbitA: number;
  orbitSpd: number;
};

function mkParticles(w: number, h: number): P[] {
  return Array.from({ length: N }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    vx: (Math.random() - 0.5) * 0.6,
    vy: (Math.random() - 0.5) * 0.6,
    size: 0.7 + Math.random() * 2.2,
    alpha: 0.12 + Math.random() * 0.55,
    phase: Math.random() * Math.PI * 2,
    phaseSpd: 0.007 + Math.random() * 0.022,
    orbitR: 30 + Math.random() * 145,
    orbitA: Math.random() * Math.PI * 2,
    orbitSpd: (Math.random() > 0.5 ? 1 : -1) * (0.005 + Math.random() * 0.020),
  }));
}

export default function Orb({ state, onClick }: OrbProps) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const frameRef    = useRef(0);
  const phRef       = useRef(0);
  const tRef        = useRef(0);
  const stateRef    = useRef(state);
  const prevStateRef = useRef<OrbState>(state);
  const ptsRef      = useRef<P[]>([]);
  const dimRef      = useRef({ w: 0, h: 0 });

  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width  = w;
      canvas.height = h;
      dimRef.current = { w, h };
      if (ptsRef.current.length === 0) ptsRef.current = mkParticles(w, h);
    };

    resize();
    window.addEventListener("resize", resize);

    function draw() {
      const s    = stateRef.current;
      const prev = prevStateRef.current;
      const { w, h } = dimRef.current;
      const CX = w / 2, CY = h / 2;
      const pts = ptsRef.current;

      // Scatter particles outward when returning to wake state
      if (prev !== "wake" && s === "wake") {
        for (const p of pts) {
          const dx = p.x - CX;
          const dy = p.y - CY;
          const dist = Math.hypot(dx, dy) || 1;
          const speed = 2.5 + Math.random() * 3.5;
          p.vx += (dx / dist) * speed + (Math.random() - 0.5) * 2;
          p.vy += (dy / dist) * speed + (Math.random() - 0.5) * 2;
        }
      }
      prevStateRef.current = s;

      phRef.current +=
        s === "speaking"  ? 0.070 :
        s === "thinking"  ? 0.038 :
        s === "listening" ? 0.024 : 0.008;
      const ph = phRef.current;

      const vp = s === "speaking"
        ? 0.5 * Math.abs(Math.sin(ph * 3.7))
        + 0.3 * Math.abs(Math.sin(ph * 7.1  + 1.2))
        + 0.2 * Math.abs(Math.sin(ph * 13.3 + 2.4))
        : 0;

      // Smooth gather transition
      const targetT = s !== "wake" ? 1 : 0;
      tRef.current  += (targetT - tRef.current) * 0.028;
      const t = tRef.current;

      const hue =
        s === "thinking"  ? 265 :
        s === "listening" ? 188 :
        s === "speaking"  ? 205 : 215;

      ctx!.clearRect(0, 0, w, h);

      // ── Particles ────────────────────────────────────────────────────────
      for (const p of pts) {
        p.phase += p.phaseSpd;
        const twinkle = 0.45 + 0.55 * Math.sin(p.phase);

        if (t > 0.01) {
          // Spring toward orbit position
          p.orbitA += p.orbitSpd * (0.6 + t * 0.8);
          const tx = CX + Math.cos(p.orbitA) * p.orbitR;
          const ty = CY + Math.sin(p.orbitA) * p.orbitR;
          p.vx += (tx - p.x) * 0.065 * t;
          p.vy += (ty - p.y) * 0.065 * t;
        }

        // Idle drift: very gentle in wake mode so particles glide slowly
        if (t < 0.98) {
          const nudge = s === "wake" ? 0.010 : 0.045;
          p.vx += (Math.random() - 0.5) * nudge * (1 - t);
          p.vy += (Math.random() - 0.5) * nudge * (1 - t);
        }

        // Less damping in wake so scatter momentum fades slowly → smooth drift
        const damp = s === "wake" && t < 0.05 ? 0.972 : 0.91;
        p.vx *= damp;
        p.vy *= damp;
        p.x  += p.vx;
        p.y  += p.vy;

        // Wrap edges when idle
        if (t < 0.4) {
          if (p.x < -20) p.x = w + 20;
          if (p.x > w + 20) p.x = -20;
          if (p.y < -20) p.y = h + 20;
          if (p.y > h + 20) p.y = -20;
        }

        const dist     = Math.hypot(p.x - CX, p.y - CY);
        const proximity = Math.max(0, 1 - dist / 220);
        const bright    = 1 + t * proximity * 1.8;
        const alpha     = Math.min(0.95, p.alpha * twinkle * bright);
        const radius    = p.size * (1 + t * proximity * 0.7);

        ctx!.beginPath();
        ctx!.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx!.fillStyle = t > 0.08 && proximity > 0.15
          ? `hsla(${hue},85%,82%,${alpha})`
          : `rgba(255,255,255,${alpha * (0.4 + t * 0.6)})`;
        ctx!.fill();
      }

      // ── Central glow ─────────────────────────────────────────────────────
      if (t > 0.04) {
        // Outer ambient
        const ambR = (s === "speaking" ? 280 + vp * 100 : s === "listening" ? 240 + 20 * Math.sin(ph) : 200) * t;
        const ambA = t * (s === "speaking" ? 0.09 + vp * 0.07 : 0.055);
        const ga   = ctx!.createRadialGradient(CX, CY, 0, CX, CY, ambR);
        ga.addColorStop(0,    `hsla(${hue},85%,65%,0)`);
        ga.addColorStop(0.35, `hsla(${hue},80%,60%,${ambA * 0.5})`);
        ga.addColorStop(0.65, `hsla(${hue},75%,55%,${ambA})`);
        ga.addColorStop(1,    `hsla(${hue},70%,50%,0)`);
        ctx!.beginPath();
        ctx!.arc(CX, CY, ambR, 0, Math.PI * 2);
        ctx!.fillStyle = ga;
        ctx!.fill();

        // Bright core
        const coreR = (s === "speaking" ? 38 + vp * 28 : 22 + 5 * Math.sin(ph * 0.8)) * t;
        const coreA = t * (s === "speaking" ? 0.85 + vp * 0.15 : 0.55);
        const gc    = ctx!.createRadialGradient(CX, CY, 0, CX, CY, coreR * 3);
        gc.addColorStop(0,    `rgba(255,255,255,${coreA})`);
        gc.addColorStop(0.2,  `hsla(${hue},90%,90%,${coreA * 0.6})`);
        gc.addColorStop(0.55, `hsla(${hue},85%,70%,${coreA * 0.15})`);
        gc.addColorStop(1,    `hsla(${hue},80%,60%,0)`);
        ctx!.beginPath();
        ctx!.arc(CX, CY, coreR * 3, 0, Math.PI * 2);
        ctx!.fillStyle = gc;
        ctx!.fill();
      }

      // ── Speaking: shockwave rings ────────────────────────────────────────
      if (s === "speaking" && t > 0.4) {
        for (let i = 0; i < 4; i++) {
          const wt = (ph * 1.8 + i * 0.25) % 1;
          const wr = (60 + wt * 300) * t;
          const wa = (1 - wt) * (0.16 + vp * 0.14) * t;
          ctx!.beginPath();
          ctx!.arc(CX, CY, wr, 0, Math.PI * 2);
          ctx!.strokeStyle = `hsla(${hue},88%,82%,${wa})`;
          ctx!.lineWidth   = Math.max(0.3, 1.3 * (1 - wt));
          ctx!.stroke();
        }
      }

      // ── Listening: concentric pulses ─────────────────────────────────────
      if (s === "listening" && t > 0.4) {
        for (let i = 0; i < 3; i++) {
          const lt = (ph * 0.26 + i / 3) % 1;
          const lr = (50 + lt * 200) * t;
          const la = (1 - lt) * 0.18 * t;
          ctx!.beginPath();
          ctx!.arc(CX, CY, lr, 0, Math.PI * 2);
          ctx!.strokeStyle = `hsla(${hue},90%,80%,${la})`;
          ctx!.lineWidth   = 1.1 * (1 - lt * 0.4);
          ctx!.stroke();
        }
      }

      // ── Thinking: rotating dashed arcs ──────────────────────────────────
      if (s === "thinking" && t > 0.4) {
        ctx!.save();
        ctx!.translate(CX, CY);
        ([
          { spd:  0.50, r: 130, arc: 0.65, lw: 1.4, a: 0.20, dash: [8,  14] as [number,number] },
          { spd: -0.34, r: 168, arc: 0.42, lw: 1.0, a: 0.12, dash: [5,  18] as [number,number] },
          { spd:  0.20, r: 200, arc: 0.28, lw: 0.7, a: 0.07, dash: [4,  22] as [number,number] },
        ] as const).forEach(({ spd, r, arc, lw, a, dash }) => {
          ctx!.save();
          ctx!.rotate(ph * spd);
          ctx!.beginPath();
          ctx!.arc(0, 0, r * t, 0, Math.PI * arc);
          ctx!.strokeStyle = `hsla(${hue},88%,74%,${a * t})`;
          ctx!.lineWidth   = lw;
          ctx!.setLineDash(dash);
          ctx!.stroke();
          ctx!.setLineDash([]);
          ctx!.restore();
        });
        ctx!.restore();
      }

      // ── Wake: subtle center click hint ───────────────────────────────────
      if (s === "wake" && t < 0.08) {
        const pulse = 0.5 + 0.5 * Math.sin(ph * 0.35);
        ctx!.beginPath();
        ctx!.arc(CX, CY, 6 + pulse * 3, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(255,255,255,${0.07 + pulse * 0.05})`;
        ctx!.fill();
        ctx!.beginPath();
        ctx!.arc(CX, CY, 22 + pulse * 4, 0, Math.PI * 2);
        ctx!.strokeStyle = `rgba(255,255,255,${0.04 + pulse * 0.03})`;
        ctx!.lineWidth = 0.6;
        ctx!.stroke();
      }

      frameRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      onClick={onClick}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        cursor: "pointer",
        display: "block",
      }}
    />
  );
}
