"use client";

import { useEffect, useRef } from "react";

export type OrbState = "wake" | "listening" | "thinking" | "speaking";

interface OrbProps {
  state: OrbState;
  onClick: () => void;
}

const NUM_PARTICLES = 480;

type Particle = {
  ux: number; uy: number; uz: number;
  baseR: number;
  size: number;
  twinklePhase: number;
  twinkleSpeed: number;
};

// RGB color per state
const STATE_COLORS: Record<OrbState, [number, number, number]> = {
  wake:      [80,  110, 255],
  listening: [0,   210, 255],
  thinking:  [255, 170,  20],
  speaking:  [180, 220, 255],
};

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

function mkParticles(): Particle[] {
  return Array.from({ length: NUM_PARTICLES }, () => {
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi   = Math.acos(2 * v - 1);
    return {
      ux: Math.sin(phi) * Math.cos(theta),
      uy: Math.sin(phi) * Math.sin(theta),
      uz: Math.cos(phi),
      baseR: 100 + Math.random() * 32,
      size:  0.8 + Math.random() * 2.4,
      twinklePhase: Math.random() * Math.PI * 2,
      twinkleSpeed: 0.008 + Math.random() * 0.028,
    };
  });
}

export default function Orb({ state, onClick }: OrbProps) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const frameRef   = useRef<number>(0);
  const phaseRef   = useRef(0);
  const stateRef   = useRef(state);
  const colorRef   = useRef<[number, number, number]>([...STATE_COLORS.wake]);
  const particles  = useRef<Particle[]>(mkParticles());
  const twinkles   = useRef<number[]>(particles.current.map(p => p.twinklePhase));

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

    function draw() {
      ctx!.clearRect(0, 0, S, S);
      const s = stateRef.current;
      const target = STATE_COLORS[s];

      // Smooth color lerp toward current state
      const c = colorRef.current;
      c[0] = lerp(c[0], target[0], 0.03);
      c[1] = lerp(c[1], target[1], 0.03);
      c[2] = lerp(c[2], target[2], 0.03);
      const [cr, cg, cb] = c;

      // Phase advance
      phaseRef.current +=
        s === "speaking"  ? 0.10 :
        s === "listening" ? 0.038 :
        s === "thinking"  ? 0.060 : 0.020;
      const ph = phaseRef.current;

      // Rotation
      const rotY = ph * (s === "thinking" ? 0.55 : 0.13);
      const rotX = ph * 0.045;
      const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
      const cosX = Math.cos(rotX), sinX = Math.sin(rotX);

      // Voice pulse envelope
      const vp =
        0.5 * Math.abs(Math.sin(ph * 3.7)) +
        0.3 * Math.abs(Math.sin(ph * 7.1 + 1.2)) +
        0.2 * Math.abs(Math.sin(ph * 13.3 + 2.4));

      // ── Layer 1: outer nebula / haze ──────────────────────────────────────
      const nebulaR = s === "speaking" ? 260 + vp * 40 : 240 + 10 * Math.sin(ph * 0.7);
      const nebulaAlpha = s === "speaking" ? 0.13 + vp * 0.08
        : s === "listening" ? 0.10 + 0.03 * Math.sin(ph)
        : s === "thinking"  ? 0.09 + 0.03 * Math.sin(ph * 1.2)
        : 0.07;

      const ng = ctx!.createRadialGradient(CX, CY, 0, CX, CY, nebulaR);
      ng.addColorStop(0,    `rgba(${cr},${cg},${cb},${nebulaAlpha * 0.4})`);
      ng.addColorStop(0.35, `rgba(${cr},${cg},${cb},${nebulaAlpha})`);
      ng.addColorStop(0.65, `rgba(${cr},${cg},${cb},${nebulaAlpha * 0.5})`);
      ng.addColorStop(1,    "transparent");
      ctx!.beginPath();
      ctx!.arc(CX, CY, nebulaR, 0, Math.PI * 2);
      ctx!.fillStyle = ng;
      ctx!.fill();

      // ── Layer 2: mid corona ───────────────────────────────────────────────
      const coronaR = s === "speaking" ? 145 + vp * 50
        : s === "listening" ? 130 + 14 * Math.sin(ph * 1.5)
        : s === "thinking"  ? 125 + 10 * Math.sin(ph * 2.0)
        : 115 + 6 * Math.sin(ph * 0.8);

      const coronaAlpha = s === "speaking" ? 0.22 + vp * 0.18
        : s === "listening" ? 0.16 + 0.06 * Math.sin(ph)
        : s === "thinking"  ? 0.14 + 0.04 * Math.sin(ph * 1.5)
        : 0.11;

      const cg2 = ctx!.createRadialGradient(CX, CY, 0, CX, CY, coronaR * 1.8);
      cg2.addColorStop(0,   `rgba(${cr},${cg},${cb},${coronaAlpha * 0.5})`);
      cg2.addColorStop(0.4, `rgba(${cr},${cg},${cb},${coronaAlpha})`);
      cg2.addColorStop(0.7, `rgba(${cr},${cg},${cb},${coronaAlpha * 0.3})`);
      cg2.addColorStop(1,   "transparent");
      ctx!.beginPath();
      ctx!.arc(CX, CY, coronaR * 1.8, 0, Math.PI * 2);
      ctx!.fillStyle = cg2;
      ctx!.fill();

      // ── Layer 3: bright inner core ────────────────────────────────────────
      const coreR = s === "speaking" ? 55 + vp * 25 : 42 + 4 * Math.sin(ph * 1.2);
      const coreAlpha = s === "speaking" ? 0.45 + vp * 0.30
        : s === "listening" ? 0.30 + 0.08 * Math.sin(ph * 2)
        : s === "thinking"  ? 0.28 + 0.06 * Math.sin(ph * 1.8)
        : 0.22;

      const cg3 = ctx!.createRadialGradient(CX, CY, 0, CX, CY, coreR * 2);
      cg3.addColorStop(0,   `rgba(255,255,255,${coreAlpha})`);
      cg3.addColorStop(0.3, `rgba(${cr},${cg},${cb},${coreAlpha * 0.8})`);
      cg3.addColorStop(0.7, `rgba(${cr},${cg},${cb},${coreAlpha * 0.2})`);
      cg3.addColorStop(1,   "transparent");
      ctx!.beginPath();
      ctx!.arc(CX, CY, coreR * 2, 0, Math.PI * 2);
      ctx!.fillStyle = cg3;
      ctx!.fill();

      // ── Particles ─────────────────────────────────────────────────────────
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
          r += Math.abs(Math.sin(ph * 4.5 + i * 0.27)) * vp * 26;
        } else if (s === "listening") {
          r += 5 * Math.sin(ph * 1.8 + i * 0.3);
        } else if (s === "thinking") {
          r += 7 * Math.sin(ph * 2 + i * 0.5) * (1 - Math.abs(z));
        }

        const fov   = 340;
        const depth = fov / (fov + z * r * 0.55);
        const sx = CX + x * r * depth;
        const sy = CY + y * r * depth;

        const depthB = 0.30 + 0.70 * ((z + 1) / 2);

        tw[i] += p.twinkleSpeed;
        const twv = 0.55 + 0.45 * Math.sin(tw[i]);

        const stB =
          s === "speaking"  ? 0.85 + vp * 0.15 :
          s === "listening" ? 0.78 + 0.14 * Math.sin(ph + i * 0.2) :
          s === "thinking"  ? 0.68 + 0.16 * Math.sin(ph * 1.5 + i * 0.3) :
                              0.62 + 0.16 * Math.sin(ph * 0.5 + i * 0.4);

        const alpha   = Math.min(1, twv * depthB * stB);
        const dotSize = Math.max(0.3, p.size * depth * (s === "speaking" ? 1 + vp * 0.45 : 1));

        // Blend particle color: white core tinted with state color
        const blend = depthB * 0.6;
        const pr = Math.round(lerp(255, cr, blend));
        const pg = Math.round(lerp(255, cg, blend));
        const pb = Math.round(lerp(255, cb, blend));

        ctx!.beginPath();
        ctx!.arc(sx, sy, dotSize, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(${pr},${pg},${pb},${alpha})`;
        ctx!.fill();
      }

      // ── Thinking: orbiting arcs ───────────────────────────────────────────
      if (s === "thinking") {
        ctx!.save();
        ctx!.translate(CX, CY);
        [
          { speed: 1.0,  rad: 122, arc: 0.80, alpha: 0.40 },
          { speed: -0.7, rad: 158, arc: 0.55, alpha: 0.28 },
          { speed: 0.5,  rad: 180, arc: 0.40, alpha: 0.18 },
        ].forEach(({ speed, rad, arc, alpha }) => {
          ctx!.rotate(speed * ph);
          ctx!.beginPath();
          ctx!.arc(0, 0, rad, 0, Math.PI * arc);
          ctx!.strokeStyle = `rgba(${cr},${cg},${cb},${alpha})`;
          ctx!.lineWidth   = 1.6;
          ctx!.setLineDash([6, 14]);
          ctx!.stroke();
          ctx!.setLineDash([]);
          ctx!.rotate(-(speed * ph));
        });
        ctx!.restore();
      }

      // ── Listening: concentric pulse rings ────────────────────────────────
      if (s === "listening") {
        [
          { base: 158, amp: 14, freq: 2.0, a: 0.22 },
          { base: 185, amp:  8, freq: 1.5, a: 0.12 },
        ].forEach(({ base, amp, freq, a }) => {
          const rr = base + amp * Math.sin(ph * freq);
          ctx!.beginPath();
          ctx!.arc(CX, CY, rr, 0, Math.PI * 2);
          ctx!.strokeStyle = `rgba(${cr},${cg},${cb},${a + 0.08 * Math.sin(ph * freq)})`;
          ctx!.lineWidth   = 1.2;
          ctx!.stroke();
        });
      }

      // ── Speaking: expanding shockwave rings ───────────────────────────────
      if (s === "speaking") {
        const wave = (ph * 60) % 200;
        const wAlpha = Math.max(0, 0.35 * (1 - wave / 200)) * (0.7 + 0.3 * vp);
        ctx!.beginPath();
        ctx!.arc(CX, CY, 120 + wave, 0, Math.PI * 2);
        ctx!.strokeStyle = `rgba(${cr},${cg},${cb},${wAlpha})`;
        ctx!.lineWidth = 1.5;
        ctx!.stroke();

        const wave2 = ((ph * 60) + 100) % 200;
        const wAlpha2 = Math.max(0, 0.22 * (1 - wave2 / 200)) * (0.7 + 0.3 * vp);
        ctx!.beginPath();
        ctx!.arc(CX, CY, 120 + wave2, 0, Math.PI * 2);
        ctx!.strokeStyle = `rgba(${cr},${cg},${cb},${wAlpha2})`;
        ctx!.lineWidth = 1;
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
      width={700}
      height={700}
      onClick={onClick}
      style={{
        cursor:  "pointer",
        display: "block",
        width:   "min(700px, 90vw)",
        height:  "min(700px, 90vh)",
      }}
    />
  );
}
