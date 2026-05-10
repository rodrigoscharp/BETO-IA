"use client";

import { useEffect, useRef } from "react";

export type OrbState = "wake" | "listening" | "thinking" | "speaking";
interface OrbProps { state: OrbState; onClick: () => void; }

const N = 120; // was 200 — fewer particles = smoother frame rate

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
    vx: (Math.random() - 0.5) * 0.4,
    vy: (Math.random() - 0.5) * 0.4,
    size: 0.8 + Math.random() * 1.8,
    alpha: 0.15 + Math.random() * 0.5,
    phase: Math.random() * Math.PI * 2,
    phaseSpd: 0.008 + Math.random() * 0.018,
    orbitR: 30 + Math.random() * 140,
    orbitA: Math.random() * Math.PI * 2,
    orbitSpd: (Math.random() > 0.5 ? 1 : -1) * (0.005 + Math.random() * 0.018),
  }));
}

export default function Orb({ state, onClick }: OrbProps) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const frameRef     = useRef(0);
  const phRef        = useRef(0);
  const tRef         = useRef(0);
  const stateRef     = useRef(state);
  const prevStateRef = useRef<OrbState>(state);
  const ptsRef       = useRef<P[]>([]);
  const dimRef       = useRef({ w: 0, h: 0 });

  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true })!;
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

      // One-shot scatter when returning to wake — gentle velocity, not a jolt
      if (prev !== "wake" && s === "wake") {
        for (const p of pts) {
          const dx = p.x - CX;
          const dy = p.y - CY;
          const dist = Math.hypot(dx, dy) || 1;
          const spd  = 1 + Math.random() * 1.8;
          p.vx += (dx / dist) * spd + (Math.random() - 0.5) * 0.8;
          p.vy += (dy / dist) * spd + (Math.random() - 0.5) * 0.8;
        }
      }
      prevStateRef.current = s;

      phRef.current +=
        s === "speaking"  ? 0.068 :
        s === "thinking"  ? 0.036 :
        s === "listening" ? 0.022 : 0.007;
      const ph = phRef.current;

      const vp = s === "speaking"
        ? 0.5 * Math.abs(Math.sin(ph * 3.7))
        + 0.3 * Math.abs(Math.sin(ph * 7.1  + 1.2))
        + 0.2 * Math.abs(Math.sin(ph * 13.3 + 2.4))
        : 0;

      const targetT = s !== "wake" ? 1 : 0;
      tRef.current += (targetT - tRef.current) * 0.025;
      const t = tRef.current;

      const hue =
        s === "thinking"  ? 265 :
        s === "listening" ? 188 :
        s === "speaking"  ? 205 : 215;

      ctx.clearRect(0, 0, w, h);

      // ── Particles ────────────────────────────────────────────────────────
      for (const p of pts) {
        p.phase += p.phaseSpd;
        const twinkle = 0.5 + 0.5 * Math.sin(p.phase);

        // Spring pull toward orbit when active
        if (t > 0.01) {
          p.orbitA += p.orbitSpd * (0.5 + t * 0.8);
          const ox = CX + Math.cos(p.orbitA) * p.orbitR;
          const oy = CY + Math.sin(p.orbitA) * p.orbitR;
          p.vx += (ox - p.x) * 0.055 * t;
          p.vy += (oy - p.y) * 0.055 * t;
        }

        // Gentle random drift — slightly more in wake so stars float naturally
        if (t < 0.99) {
          const nudge = s === "wake" ? 0.03 : 0.04;
          p.vx += (Math.random() - 0.5) * nudge * (1 - t);
          p.vy += (Math.random() - 0.5) * nudge * (1 - t);
        }

        // Consistent damping — 0.93 keeps motion smooth without lingering too long
        p.vx *= 0.93;
        p.vy *= 0.93;

        // Hard velocity cap so no particle ever jolts across the screen
        const spd = Math.hypot(p.vx, p.vy);
        if (spd > 4) { p.vx = p.vx / spd * 4; p.vy = p.vy / spd * 4; }

        p.x += p.vx;
        p.y += p.vy;

        // Wrap edges when idle
        if (t < 0.5) {
          if (p.x < -20) p.x = w + 20;
          if (p.x > w + 20) p.x = -20;
          if (p.y < -20) p.y = h + 20;
          if (p.y > h + 20) p.y = -20;
        }

        const dist      = Math.hypot(p.x - CX, p.y - CY);
        const proximity  = t > 0.05 ? Math.max(0, 1 - dist / 210) : 0;
        const bright     = 1 + t * proximity * 1.6;
        const alpha      = Math.min(0.92, p.alpha * twinkle * bright);
        const radius     = p.size * (1 + t * proximity * 0.6);

        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = proximity > 0.15
          ? `hsla(${hue},82%,82%,${alpha})`
          : `rgba(255,255,255,${alpha * (0.35 + t * 0.65)})`;
        ctx.fill();
      }

      // ── Central glow ─────────────────────────────────────────────────────
      if (t > 0.04) {
        const ambR = (s === "speaking" ? 270 + vp * 90 : s === "listening" ? 230 + 18 * Math.sin(ph) : 195) * t;
        const ambA = t * (s === "speaking" ? 0.08 + vp * 0.06 : 0.05);
        const ga   = ctx.createRadialGradient(CX, CY, 0, CX, CY, ambR);
        ga.addColorStop(0,   `hsla(${hue},80%,65%,0)`);
        ga.addColorStop(0.5, `hsla(${hue},75%,58%,${ambA})`);
        ga.addColorStop(1,   `hsla(${hue},70%,50%,0)`);
        ctx.beginPath();
        ctx.arc(CX, CY, ambR, 0, Math.PI * 2);
        ctx.fillStyle = ga;
        ctx.fill();

        const coreR = (s === "speaking" ? 36 + vp * 24 : 20 + 4 * Math.sin(ph * 0.8)) * t;
        const coreA = t * (s === "speaking" ? 0.82 + vp * 0.15 : 0.52);
        const gc    = ctx.createRadialGradient(CX, CY, 0, CX, CY, coreR * 3);
        gc.addColorStop(0,   `rgba(255,255,255,${coreA})`);
        gc.addColorStop(0.3, `hsla(${hue},88%,88%,${coreA * 0.5})`);
        gc.addColorStop(1,   `hsla(${hue},80%,60%,0)`);
        ctx.beginPath();
        ctx.arc(CX, CY, coreR * 3, 0, Math.PI * 2);
        ctx.fillStyle = gc;
        ctx.fill();
      }

      // ── Speaking: shockwave rings ────────────────────────────────────────
      if (s === "speaking" && t > 0.4) {
        for (let i = 0; i < 3; i++) {
          const wt = (ph * 1.6 + i * 0.33) % 1;
          const wr = (55 + wt * 280) * t;
          const wa = (1 - wt) * (0.14 + vp * 0.12) * t;
          ctx.beginPath();
          ctx.arc(CX, CY, wr, 0, Math.PI * 2);
          ctx.strokeStyle = `hsla(${hue},85%,82%,${wa})`;
          ctx.lineWidth   = Math.max(0.3, 1.2 * (1 - wt));
          ctx.stroke();
        }
      }

      // ── Listening: concentric pulses ─────────────────────────────────────
      if (s === "listening" && t > 0.4) {
        for (let i = 0; i < 3; i++) {
          const lt = (ph * 0.24 + i / 3) % 1;
          const lr = (45 + lt * 190) * t;
          const la = (1 - lt) * 0.16 * t;
          ctx.beginPath();
          ctx.arc(CX, CY, lr, 0, Math.PI * 2);
          ctx.strokeStyle = `hsla(${hue},88%,80%,${la})`;
          ctx.lineWidth   = 1.0 * (1 - lt * 0.4);
          ctx.stroke();
        }
      }

      // ── Thinking: rotating dashed arcs ──────────────────────────────────
      if (s === "thinking" && t > 0.4) {
        ctx.save();
        ctx.translate(CX, CY);
        ([
          { spd:  0.48, r: 125, arc: 0.62, lw: 1.3, a: 0.18, dash: [8,  14] as [number,number] },
          { spd: -0.32, r: 162, arc: 0.40, lw: 0.9, a: 0.11, dash: [5,  18] as [number,number] },
          { spd:  0.18, r: 194, arc: 0.26, lw: 0.6, a: 0.06, dash: [4,  22] as [number,number] },
        ] as const).forEach(({ spd, r, arc, lw, a, dash }) => {
          ctx.save();
          ctx.rotate(ph * spd);
          ctx.beginPath();
          ctx.arc(0, 0, r * t, 0, Math.PI * arc);
          ctx.strokeStyle = `hsla(${hue},86%,74%,${a * t})`;
          ctx.lineWidth   = lw;
          ctx.setLineDash(dash);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        });
        ctx.restore();
      }

      // ── Wake: subtle dot hint ────────────────────────────────────────────
      if (s === "wake" && t < 0.06) {
        const pulse = 0.5 + 0.5 * Math.sin(ph * 0.3);
        ctx.beginPath();
        ctx.arc(CX, CY, 5 + pulse * 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${0.06 + pulse * 0.04})`;
        ctx.fill();
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
        willChange: "transform",
      }}
    />
  );
}
