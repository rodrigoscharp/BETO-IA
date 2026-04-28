"use client";

import { useEffect, useRef } from "react";

export type OrbState = "wake" | "listening" | "thinking" | "speaking";

interface OrbProps {
  state: OrbState;
  onClick: () => void;
}

const NUM_PARTICLES  = 620;
const NUM_DUST       = 180; // floating dust outside sphere

type Particle = {
  ux: number; uy: number; uz: number;
  baseR: number;
  size: number;
  twinklePhase: number;
  twinkleSpeed: number;
};

type Dust = {
  angle: number;
  radius: number;
  speed: number;
  size: number;
  alpha: number;
  drift: number;
};

function mkParticles(): Particle[] {
  return Array.from({ length: NUM_PARTICLES }, () => {
    const theta = 2 * Math.PI * Math.random();
    const phi   = Math.acos(2 * Math.random() - 1);
    return {
      ux: Math.sin(phi) * Math.cos(theta),
      uy: Math.sin(phi) * Math.sin(theta),
      uz: Math.cos(phi),
      baseR: 118 + Math.random() * 38,
      size:  0.7 + Math.random() * 2.8,
      twinklePhase: Math.random() * Math.PI * 2,
      twinkleSpeed: 0.007 + Math.random() * 0.025,
    };
  });
}

function mkDust(): Dust[] {
  return Array.from({ length: NUM_DUST }, () => ({
    angle:  Math.random() * Math.PI * 2,
    radius: 190 + Math.random() * 140,
    speed:  (Math.random() - 0.5) * 0.004,
    size:   0.4 + Math.random() * 1.4,
    alpha:  0.05 + Math.random() * 0.18,
    drift:  (Math.random() - 0.5) * 0.6,
  }));
}

export default function Orb({ state, onClick }: OrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef  = useRef<number>(0);
  const phaseRef  = useRef(0);
  const stateRef  = useRef(state);
  const particles = useRef<Particle[]>(mkParticles());
  const dust      = useRef<Dust[]>(mkDust());
  const twinkles  = useRef<number[]>(particles.current.map(p => p.twinklePhase));

  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const S = canvas.width;
    const CX = S / 2, CY = S / 2;
    const pts = particles.current;
    const tw  = twinkles.current;
    const ds  = dust.current;

    function draw() {
      ctx!.clearRect(0, 0, S, S);
      const s = stateRef.current;

      phaseRef.current +=
        s === "speaking"  ? 0.10 :
        s === "listening" ? 0.038 :
        s === "thinking"  ? 0.058 : 0.020;
      const ph = phaseRef.current;

      const rotY = ph * (s === "thinking" ? 0.52 : 0.13);
      const rotX = ph * 0.044;
      const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
      const cosX = Math.cos(rotX), sinX = Math.sin(rotX);

      // voice pulse
      const vp =
        0.5 * Math.abs(Math.sin(ph * 3.7)) +
        0.3 * Math.abs(Math.sin(ph * 7.1 + 1.2)) +
        0.2 * Math.abs(Math.sin(ph * 13.3 + 2.4));

      // ── Glow layer 1: vast outer haze ────────────────────────────────────
      const hazeR = s === "speaking" ? 310 + vp * 60
        : s === "listening" ? 290 + 18 * Math.sin(ph * 0.9)
        : s === "thinking"  ? 280 + 14 * Math.sin(ph * 1.1)
        : 260 + 8 * Math.sin(ph * 0.6);

      const hazeA = s === "speaking" ? 0.055 + vp * 0.045
        : s === "listening" ? 0.042 + 0.012 * Math.sin(ph)
        : s === "thinking"  ? 0.038
        : 0.030;

      const g1 = ctx!.createRadialGradient(CX, CY, 0, CX, CY, hazeR);
      g1.addColorStop(0,    `rgba(255,255,255,0)`);
      g1.addColorStop(0.30, `rgba(255,255,255,${hazeA * 0.5})`);
      g1.addColorStop(0.55, `rgba(255,255,255,${hazeA})`);
      g1.addColorStop(0.78, `rgba(255,255,255,${hazeA * 0.4})`);
      g1.addColorStop(1,    `rgba(255,255,255,0)`);
      ctx!.beginPath();
      ctx!.arc(CX, CY, hazeR, 0, Math.PI * 2);
      ctx!.fillStyle = g1;
      ctx!.fill();

      // ── Glow layer 2: mid corona ──────────────────────────────────────────
      const coronaR = s === "speaking" ? 175 + vp * 55
        : s === "listening" ? 160 + 18 * Math.sin(ph * 1.6)
        : s === "thinking"  ? 155 + 12 * Math.sin(ph * 2.0)
        : 145 + 8 * Math.sin(ph * 0.8);

      const coronaA = s === "speaking" ? 0.20 + vp * 0.22
        : s === "listening" ? 0.15 + 0.06 * Math.sin(ph)
        : s === "thinking"  ? 0.13 + 0.04 * Math.sin(ph * 1.5)
        : 0.10;

      const g2 = ctx!.createRadialGradient(CX, CY, 0, CX, CY, coronaR * 1.9);
      g2.addColorStop(0,    `rgba(255,255,255,0)`);
      g2.addColorStop(0.28, `rgba(255,255,255,${coronaA * 0.6})`);
      g2.addColorStop(0.52, `rgba(255,255,255,${coronaA})`);
      g2.addColorStop(0.75, `rgba(255,255,255,${coronaA * 0.3})`);
      g2.addColorStop(1,    `rgba(255,255,255,0)`);
      ctx!.beginPath();
      ctx!.arc(CX, CY, coronaR * 1.9, 0, Math.PI * 2);
      ctx!.fillStyle = g2;
      ctx!.fill();

      // ── Glow layer 3: bright inner core ───────────────────────────────────
      const coreR = s === "speaking" ? 72 + vp * 32
        : s === "listening" ? 58 + 10 * Math.sin(ph * 2)
        : s === "thinking"  ? 55 + 8  * Math.sin(ph * 1.8)
        : 48 + 5 * Math.sin(ph * 1.0);

      const coreA = s === "speaking" ? 0.55 + vp * 0.35
        : s === "listening" ? 0.38 + 0.10 * Math.sin(ph * 2)
        : s === "thinking"  ? 0.34 + 0.08 * Math.sin(ph * 1.8)
        : 0.28;

      const g3 = ctx!.createRadialGradient(CX, CY, 0, CX, CY, coreR * 2.2);
      g3.addColorStop(0,    `rgba(255,255,255,${coreA})`);
      g3.addColorStop(0.25, `rgba(255,255,255,${coreA * 0.75})`);
      g3.addColorStop(0.55, `rgba(255,255,255,${coreA * 0.25})`);
      g3.addColorStop(1,    `rgba(255,255,255,0)`);
      ctx!.beginPath();
      ctx!.arc(CX, CY, coreR * 2.2, 0, Math.PI * 2);
      ctx!.fillStyle = g3;
      ctx!.fill();

      // ── Floating dust ─────────────────────────────────────────────────────
      const dustActivity = s === "speaking" ? 1 + vp * 0.8
        : s === "listening" ? 0.7
        : s === "thinking"  ? 0.5
        : 0.3;

      for (const d of ds) {
        d.angle += d.speed * dustActivity;
        const dx = CX + Math.cos(d.angle) * d.radius;
        const dy = CY + Math.sin(d.angle) * d.radius + Math.sin(ph * 0.3 + d.drift) * 12;
        ctx!.beginPath();
        ctx!.arc(dx, dy, d.size, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(255,255,255,${d.alpha * dustActivity})`;
        ctx!.fill();
      }

      // ── Sphere particles ──────────────────────────────────────────────────
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        let x = p.ux, y = p.uy, z = p.uz;

        const x1 = x * cosY + z * sinY;
        const z1 = -x * sinY + z * cosY;
        const y2 = y * cosX - z1 * sinX;
        const z2 = y * sinX + z1 * cosX;
        x = x1; y = y2; z = z2;

        let r = p.baseR;
        if (s === "speaking") {
          r += Math.abs(Math.sin(ph * 4.5 + i * 0.27)) * vp * 30;
        } else if (s === "listening") {
          r += 6 * Math.sin(ph * 1.8 + i * 0.3);
        } else if (s === "thinking") {
          r += 8 * Math.sin(ph * 2 + i * 0.5) * (1 - Math.abs(z));
        }

        const fov   = 380;
        const depth = fov / (fov + z * r * 0.55);
        const sx = CX + x * r * depth;
        const sy = CY + y * r * depth;

        const depthB = 0.28 + 0.72 * ((z + 1) / 2);
        tw[i] += p.twinkleSpeed;
        const twv = 0.50 + 0.50 * Math.sin(tw[i]);

        const stB =
          s === "speaking"  ? 0.88 + vp * 0.12 :
          s === "listening" ? 0.80 + 0.14 * Math.sin(ph + i * 0.2) :
          s === "thinking"  ? 0.70 + 0.18 * Math.sin(ph * 1.5 + i * 0.3) :
                              0.65 + 0.18 * Math.sin(ph * 0.5 + i * 0.4);

        const alpha   = Math.min(1, twv * depthB * stB);
        const dotSize = Math.max(0.3, p.size * depth * (s === "speaking" ? 1 + vp * 0.5 : 1));

        ctx!.beginPath();
        ctx!.arc(sx, sy, dotSize, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx!.fill();
      }

      // ── Thinking: multi-arc orbital rings ────────────────────────────────
      if (s === "thinking") {
        ctx!.save();
        ctx!.translate(CX, CY);
        [
          { speed:  1.00, rad: 138, arc: 0.80, lw: 1.8, alpha: 0.42, dash: [6,  14] },
          { speed: -0.68, rad: 170, arc: 0.55, lw: 1.4, alpha: 0.28, dash: [5,  18] },
          { speed:  0.42, rad: 198, arc: 0.38, lw: 1.0, alpha: 0.16, dash: [4,  22] },
          { speed: -0.28, rad: 222, arc: 0.28, lw: 0.8, alpha: 0.09, dash: [3,  28] },
        ].forEach(({ speed, rad, arc, lw, alpha, dash }) => {
          ctx!.rotate(speed * ph);
          ctx!.beginPath();
          ctx!.arc(0, 0, rad, 0, Math.PI * arc);
          ctx!.strokeStyle = `rgba(255,255,255,${alpha})`;
          ctx!.lineWidth   = lw;
          ctx!.setLineDash(dash);
          ctx!.stroke();
          ctx!.setLineDash([]);
          ctx!.rotate(-(speed * ph));
        });
        ctx!.restore();
      }

      // ── Listening: concentric pulse rings ────────────────────────────────
      if (s === "listening") {
        [
          { base: 172, amp: 16, freq: 2.0, lw: 1.4, a: 0.28 },
          { base: 205, amp: 10, freq: 1.5, lw: 1.0, a: 0.16 },
          { base: 232, amp:  6, freq: 1.1, lw: 0.7, a: 0.08 },
        ].forEach(({ base, amp, freq, lw, a }) => {
          const rr = base + amp * Math.sin(ph * freq);
          ctx!.beginPath();
          ctx!.arc(CX, CY, rr, 0, Math.PI * 2);
          ctx!.strokeStyle = `rgba(255,255,255,${a + 0.08 * Math.sin(ph * freq)})`;
          ctx!.lineWidth   = lw;
          ctx!.stroke();
        });
      }

      // ── Speaking: shockwave rings ─────────────────────────────────────────
      if (s === "speaking") {
        for (let w = 0; w < 3; w++) {
          const wave  = ((ph * 55) + w * 70) % 240;
          const wAlpha = Math.max(0, (0.38 - w * 0.07) * (1 - wave / 240) * (0.65 + 0.35 * vp));
          ctx!.beginPath();
          ctx!.arc(CX, CY, 135 + wave, 0, Math.PI * 2);
          ctx!.strokeStyle = `rgba(255,255,255,${wAlpha})`;
          ctx!.lineWidth   = 1.5 - w * 0.3;
          ctx!.stroke();
        }

        // extra inner pulse ring
        const ir = 145 + 20 * vp;
        ctx!.beginPath();
        ctx!.arc(CX, CY, ir, 0, Math.PI * 2);
        ctx!.strokeStyle = `rgba(255,255,255,${0.30 * vp})`;
        ctx!.lineWidth   = 2;
        ctx!.stroke();
      }

      // ── Wake: subtle slow equatorial ring ────────────────────────────────
      if (s === "wake") {
        const rr = 168 + 4 * Math.sin(ph * 0.7);
        ctx!.beginPath();
        ctx!.arc(CX, CY, rr, 0, Math.PI * 2);
        ctx!.strokeStyle = `rgba(255,255,255,${0.07 + 0.03 * Math.sin(ph * 0.7)})`;
        ctx!.lineWidth   = 0.8;
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
      width={800}
      height={800}
      onClick={onClick}
      style={{
        cursor:  "pointer",
        display: "block",
        width:   "min(800px, 92vw)",
        height:  "min(800px, 92vh)",
      }}
    />
  );
}
