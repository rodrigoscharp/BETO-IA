import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        jarvis: {
          cyan: "#00d4ff",
          gold: "#ffd700",
          blue: "#0a1628",
          dark: "#050d1a",
          glow: "#00a8cc",
        },
      },
      fontFamily: {
        tech: ["Orbitron", "monospace"],
        mono: ["Share Tech Mono", "monospace"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "pulse-fast": "pulse 0.8s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "spin-slow": "spin 8s linear infinite",
        "orb-idle": "orbIdle 4s ease-in-out infinite",
        "orb-speaking": "orbSpeaking 0.6s ease-in-out infinite",
        "orb-listening": "orbListening 1.5s ease-in-out infinite",
        "fade-in": "fadeIn 0.5s ease-in-out",
        "slide-up": "slideUp 0.4s ease-out",
        "glow-pulse": "glowPulse 2s ease-in-out infinite",
        "ring-expand": "ringExpand 2s ease-out infinite",
      },
      keyframes: {
        orbIdle: {
          "0%, 100%": { transform: "scale(1)", opacity: "0.7" },
          "50%": { transform: "scale(1.05)", opacity: "1" },
        },
        orbSpeaking: {
          "0%, 100%": { transform: "scale(1)", opacity: "0.9" },
          "25%": { transform: "scale(1.15)", opacity: "1" },
          "75%": { transform: "scale(0.95)", opacity: "0.8" },
        },
        orbListening: {
          "0%, 100%": { transform: "scale(1.02)", opacity: "0.85" },
          "50%": { transform: "scale(0.98)", opacity: "0.95" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        glowPulse: {
          "0%, 100%": { boxShadow: "0 0 20px rgba(0, 212, 255, 0.3)" },
          "50%": { boxShadow: "0 0 40px rgba(0, 212, 255, 0.8)" },
        },
        ringExpand: {
          "0%": { transform: "scale(1)", opacity: "0.8" },
          "100%": { transform: "scale(2)", opacity: "0" },
        },
      },
      backgroundImage: {
        "grid-pattern":
          "linear-gradient(rgba(0,212,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.05) 1px, transparent 1px)",
        "radial-glow":
          "radial-gradient(ellipse at center, rgba(0,212,255,0.15) 0%, transparent 70%)",
      },
      backgroundSize: {
        grid: "50px 50px",
      },
    },
  },
  plugins: [],
};
export default config;
