"use client";

import { useEffect, useRef } from "react";

export type OrbState = "wake" | "listening" | "thinking" | "speaking";

interface OrbProps {
  state: OrbState;
  onClick: () => void;
}

const NUM_PARTICLES = 280;

type Particle = {
  // unit-sphere position
  ux: number; uy: number; uz: number;
  baseR: number;       // distance from center
  size: number;        // dot radius
  twinklePhase: number;
  twinkleSpeed: number;
};

function mkParticles(): Particle[] {
  return Array.from({ length: NUM_PARTICLES }, () => {
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    return {
      ux: Math.sin(phi) * Math.cos(theta),
      uy: Math.sin(phi) * Math.sin(theta),
      uz: Math.cos(phi),
      baseR: 90 + Math.random() * 110,   // bigger spread
      size: 0.7 + Math.random() * 2.8,
      twinklePhase: Math.random() * Math.PI * 2,
      twinkleSpeed: 0.015 + Math.random() * 0.04,
    };
  });
}

export default function Orb({ state, onClick }: OrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);
  const phaseRef = useRef(0);
  const stateRef = useRef(state);
  const particlesRef = useRef<Particle[]>(mkParticles());

  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const S = canvas.width;
    const CX = S / 2, CY = S / 2;
    const particles = particlesRef.current;

    // twinkle phases live outside draw so they accumulate
    const twinkles = particles.map((p) => p.twinklePhase);

    function draw() {
      ctx!.clearRect(0, 0, S, S);
      const s = stateRef.current;
      phaseRef.current += s === "speaking" ? 0.10 : s === "listening" ? 0.04 : s === "thinking" ? 0.06 : 0.018;
      const ph = phaseRef.current;

      // ── rotation angles ───────────────────────────────────────────
      const rotY = ph * (s === "thinking" ? 0.55 : 0.12);
      const rotX = ph * 0.04;
      const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
      const cosX = Math.cos(rotX), sinX = Math.sin(rotX);

      // ── speaking pulse envelope ───────────────────────────────────
      // layered sines → feels like a real voice waveform
      const voicePulse =
        0.5 * Math.abs(Math.sin(ph * 3.7)) +
        0.3 * Math.abs(Math.sin(ph * 7.1 + 1.2)) +
        0.2 * Math.abs(Math.sin(ph * 13.3 + 2.4));

      // ── central nebula glow ───────────────────────────────────────
      const glowR = s === "speaking"
        ? 90 + voicePulse * 80
        : s === "listening" ? 85 + 14 * Math.sin(ph * 1.5)
        : s === "thinking"  ? 75 + 10 * Math.sin(ph * 2.2)
        : 65 + 8 * Math.sin(ph);
      const glowAlpha = s === "speaking" ? 0.18 + voicePulse * 0.22
        : s === "listening" ? 0.12 + 0.06 * Math.sin(ph)
        : 0.07 + 0.03 * Math.sin(ph * 0.7);

      const glow = ctx!.createRadialGradient(CX, CY, 0, CX, CY, glowR * 2.8);
      glow.addColorStop(0,   `rgba(255,255,255,${glowAlpha})`);
      glow.addColorStop(0.4, `rgba(200,210,255,${glowAlpha * 0.4})`);
      glow.addColorStop(1,   "transparent");
      ctx!.beginPath();
      ctx!.arc(CX, CY, glowR * 2.8, 0, Math.PI * 2);
      ctx!.fillStyle = glow;
      ctx!.fill();

      // ── draw particles ────────────────────────────────────────────
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // rotate unit-sphere coords
        let x = p.ux, y = p.uy, z = p.uz;
        // rotate Y
        const x1 = x * cosY + z * sinY;
        const z1 = -x * sinY + z * cosY;
        // rotate X
        const y2 = y * cosX - z1 * sinX;
        const z2 = y * sinX + z1 * cosX;
        x = x1; y = y2; z = z2;

        // speaking: expand radius with voice pulse
        let r = p.baseR;
        if (s === "speaking") {
          const burst = Math.abs(Math.sin(ph * 4.5 + i * 0.27)) * voicePulse;
          r += burst * 30;
        } else if (s === "listening") {
          r += 5 * Math.sin(ph * 1.8 + i * 0.3);
        } else if (s === "thinking") {
          // orbit: pull toward equatorial plane
          r += 8 * Math.sin(ph * 2 + i * 0.5) * (1 - Math.abs(z));
        }

        // project (simple perspective)
        const fov = 320;
        const depth = fov / (fov + z * r * 0.6);
        const sx = CX + x * r * depth;
        const sy = CY + y * r * depth;

        // brightness by depth
        const depthBright = 0.4 + 0.6 * ((z + 1) / 2);

        // twinkle
        twinkles[i] += p.twinkleSpeed;
        const tw = 0.55 + 0.45 * Math.sin(twinkles[i]);

        // state brightness
        const stBright = s === "speaking" ? 0.85 + voicePulse * 0.15
          : s === "listening" ? 0.75 + 0.15 * Math.sin(ph + i * 0.2)
          : s === "thinking"  ? 0.65 + 0.15 * Math.sin(ph * 1.5 + i * 0.3)
          : 0.5 + 0.1 * Math.sin(ph * 0.5 + i * 0.4);

        const alpha = tw * depthBright * stBright;
        const starSize = p.size * depth * depthBright * (s === "speaking" ? 1 + voicePulse * 0.6 : 1);

        // draw star dot (with tiny cross flare for bright ones)
        ctx!.beginPath();
        ctx!.arc(sx, sy, Math.max(0.3, starSize), 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(255,255,255,${Math.min(1, alpha)})`;
        ctx!.fill();

        // cross flare on brightest stars
        if (starSize > 1.8 && alpha > 0.7) {
          const fl = starSize * 2.5;
          ctx!.strokeStyle = `rgba(255,255,255,${alpha * 0.35})`;
          ctx!.lineWidth = 0.5;
          ctx!.beginPath();
          ctx!.moveTo(sx - fl, sy); ctx!.lineTo(sx + fl, sy);
          ctx!.moveTo(sx, sy - fl); ctx!.lineTo(sx, sy + fl);
          ctx!.stroke();
        }
      }

      // ── thinking: rotating arc rings ─────────────────────────────
      if (s === "thinking") {
        ctx!.save();
        ctx!.translate(CX, CY);
        for (let ring = 0; ring < 2; ring++) {
          ctx!.rotate(ring === 0 ? ph * 1.1 : -ph * 0.7);
          ctx!.beginPath();
          ctx!.arc(0, 0, 110 + ring * 36, 0, Math.PI * (0.9 + ring * 0.4));
          ctx!.strokeStyle = `rgba(255,255,255,${0.22 - ring * 0.06})`;
          ctx!.lineWidth = 1.5;
          ctx!.setLineDash([6, 14]);
          ctx!.stroke();
          ctx!.setLineDash([]);
          ctx!.rotate(ring === 0 ? -(ph * 1.1) : ph * 0.7);
        }
        ctx!.restore();
      }

      // ── listening: radial pulse ring ─────────────────────────────
      if (s === "listening") {
        const ringR = 160 + 16 * Math.sin(ph * 2);
        ctx!.beginPath();
        ctx!.arc(CX, CY, ringR, 0, Math.PI * 2);
        ctx!.strokeStyle = `rgba(255,255,255,${0.12 + 0.1 * Math.sin(ph * 2)})`;
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
      width={800}
      height={800}
      onClick={onClick}
      style={{
        cursor: "pointer",
        display: "block",
        width:  "min(800px, 95vw)",
        height: "min(800px, 95vh)",
      }}
    />
  );
}
