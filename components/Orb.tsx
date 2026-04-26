"use client";

import { useEffect, useRef } from "react";

export type OrbState = "wake" | "listening" | "thinking" | "speaking";

interface OrbProps {
  state: OrbState;
  onClick: () => void;
}

const NUM_PARTICLES = 380;

type Particle = {
  ux: number; uy: number; uz: number;
  baseR: number;
  size: number;
  twinklePhase: number;
  twinkleSpeed: number;
};

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
      baseR: 105 + Math.random() * 30,   // tight shell — matches reference
      size:  0.9 + Math.random() * 2.2,
      twinklePhase: Math.random() * Math.PI * 2,
      twinkleSpeed: 0.01 + Math.random() * 0.03,
    };
  });
}

export default function Orb({ state, onClick }: OrbProps) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const frameRef    = useRef<number>(0);
  const phaseRef    = useRef(0);
  const stateRef    = useRef(state);
  const particles   = useRef<Particle[]>(mkParticles());
  const twinkles    = useRef<number[]>(particles.current.map(p => p.twinklePhase));

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

      // phase speed per state
      phaseRef.current +=
        s === "speaking"  ? 0.09 :
        s === "listening" ? 0.035 :
        s === "thinking"  ? 0.055 : 0.018;
      const ph = phaseRef.current;

      // rotation
      const rotY = ph * (s === "thinking" ? 0.6 : 0.14);
      const rotX = ph * 0.05;
      const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
      const cosX = Math.cos(rotX), sinX = Math.sin(rotX);

      // voice pulse envelope (speaking)
      const vp =
        0.5 * Math.abs(Math.sin(ph * 3.7)) +
        0.3 * Math.abs(Math.sin(ph * 7.1 + 1.2)) +
        0.2 * Math.abs(Math.sin(ph * 13.3 + 2.4));

      // very subtle central glow — matches reference (barely visible)
      const glowR = s === "speaking" ? 80 + vp * 55
        : s === "listening" ? 70 + 10 * Math.sin(ph * 1.5)
        : s === "thinking"  ? 65 +  8 * Math.sin(ph * 2.0)
        : 55 + 5 * Math.sin(ph * 0.8);

      const glowAlpha = s === "speaking" ? 0.09 + vp * 0.10
        : s === "listening" ? 0.06
        : s === "thinking"  ? 0.05
        : 0.04;

      const grd = ctx!.createRadialGradient(CX, CY, 0, CX, CY, glowR * 2.2);
      grd.addColorStop(0,   `rgba(180,210,255,${glowAlpha})`);
      grd.addColorStop(0.5, `rgba(140,180,255,${glowAlpha * 0.3})`);
      grd.addColorStop(1,   "transparent");
      ctx!.beginPath();
      ctx!.arc(CX, CY, glowR * 2.2, 0, Math.PI * 2);
      ctx!.fillStyle = grd;
      ctx!.fill();

      // particles
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        let x = p.ux, y = p.uy, z = p.uz;

        // rotate Y
        const x1 = x * cosY + z * sinY;
        const z1 = -x * sinY + z * cosY;
        // rotate X
        const y2 = y * cosX - z1 * sinX;
        const z2 = y * sinX + z1 * cosX;
        x = x1; y = y2; z = z2;

        // radius modulation per state
        let r = p.baseR;
        if (s === "speaking") {
          r += Math.abs(Math.sin(ph * 4.5 + i * 0.27)) * vp * 22;
        } else if (s === "listening") {
          r += 4 * Math.sin(ph * 1.8 + i * 0.3);
        } else if (s === "thinking") {
          r += 6 * Math.sin(ph * 2 + i * 0.5) * (1 - Math.abs(z));
        }

        // perspective projection
        const fov   = 340;
        const depth = fov / (fov + z * r * 0.55);
        const sx = CX + x * r * depth;
        const sy = CY + y * r * depth;

        // depth-based brightness (front = bright, back = dim)
        const depthB = 0.35 + 0.65 * ((z + 1) / 2);

        // twinkle
        tw[i] += p.twinkleSpeed;
        const twv = 0.5 + 0.5 * Math.sin(tw[i]);

        // state brightness
        const stB =
          s === "speaking"  ? 0.80 + vp * 0.20 :
          s === "listening" ? 0.75 + 0.15 * Math.sin(ph + i * 0.2) :
          s === "thinking"  ? 0.65 + 0.15 * Math.sin(ph * 1.5 + i * 0.3) :
                              0.60 + 0.15 * Math.sin(ph * 0.5 + i * 0.4);

        const alpha    = Math.min(1, twv * depthB * stB);
        const dotSize  = Math.max(0.3, p.size * depth * (s === "speaking" ? 1 + vp * 0.4 : 1));

        // pure white dot — matches reference exactly
        ctx!.beginPath();
        ctx!.arc(sx, sy, dotSize, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx!.fill();
      }

      // thinking: two clean dashed arcs
      if (s === "thinking") {
        ctx!.save();
        ctx!.translate(CX, CY);
        [[1.1, 118, 0.85], [-0.75, 152, 0.6]].forEach(([speed, rad, arc], idx) => {
          ctx!.rotate(speed * ph);
          ctx!.beginPath();
          ctx!.arc(0, 0, rad, 0, Math.PI * arc);
          ctx!.strokeStyle = `rgba(200,220,255,${0.28 - idx * 0.08})`;
          ctx!.lineWidth   = 1.4;
          ctx!.setLineDash([7, 13]);
          ctx!.stroke();
          ctx!.setLineDash([]);
          ctx!.rotate(-(speed * ph));
        });
        ctx!.restore();
      }

      // listening: single clean pulse ring
      if (s === "listening") {
        const rr = 158 + 12 * Math.sin(ph * 2);
        ctx!.beginPath();
        ctx!.arc(CX, CY, rr, 0, Math.PI * 2);
        ctx!.strokeStyle = `rgba(200,230,255,${0.18 + 0.10 * Math.sin(ph * 2)})`;
        ctx!.lineWidth   = 1;
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
