import type { CSSProperties } from "react";
import type { MotionCtx } from "./types";
import { clamp, quantize, seededRandom } from "./helpers";

// ---------------------------------------------------------------------------
// Advanced-retro / "impressive" FX family.
//
// Sprite-layer effects (neon, glitch, hologram, CRT, flame…), full-frame
// Backgrounds (synthwave grid, starfield, CRT room), and an overlay vignette.
// All pure CSS + frame-derived so they render in Remotion and port verbatim to
// the no-npm portal. Background/overlay entries are tagged via their catalog
// category; the portal routes them to the bg/overlay layer.
// ---------------------------------------------------------------------------

export const retroStyles: Record<string, (ctx: MotionCtx) => CSSProperties> = {
  // --- sprite-layer ---
  neonGlow: ({ t }) => ({
    filter:
      `drop-shadow(0 0 ${6 + Math.sin(t * 4) * 4}px hsl(${(t * 80) % 360} 100% 60%)) ` +
      `drop-shadow(0 0 ${14 + Math.sin(t * 4) * 8}px hsl(${(t * 80 + 50) % 360} 100% 55%)) brightness(1.12)`,
  }),

  chromaPulse: ({ t }) => {
    const o = 3 + Math.sin(t * 5) * 3;
    return {
      filter: `drop-shadow(${o}px 0 0 rgba(255,0,80,0.7)) drop-shadow(${-o}px 0 0 rgba(0,255,255,0.7))`,
    };
  },

  vhsJitter: ({ frame }) => {
    const j = Math.round((seededRandom(Math.floor(frame / 2)) - 0.5) * 6);
    const big = seededRandom(Math.floor(frame / 10)) > 0.9 ? Math.round((seededRandom(frame) - 0.5) * 16) : 0;
    return { transform: `translateX(${j + big}px)`, filter: "saturate(1.4) contrast(1.08)" };
  },

  glitchSlice: ({ frame }) => {
    const trig = seededRandom(Math.floor(frame / 4)) > 0.72;
    const dx = trig ? (seededRandom(frame) - 0.5) * 28 : 0;
    const sk = trig ? (seededRandom(frame + 3) - 0.5) * 8 : 0;
    return {
      transform: `translateX(${dx}px) skewX(${sk}deg)`,
      filter: trig ? `hue-rotate(${Math.round(seededRandom(frame + 7) * 360)}deg)` : "none",
    };
  },

  hologram: ({ t }) => ({
    opacity: 0.72 + Math.sin(t * 30) * 0.07,
    filter: "hue-rotate(150deg) saturate(2) brightness(1.2) drop-shadow(0 0 8px rgba(0,255,255,0.8))",
    transform: `skewX(${Math.sin(t * 2) * 2}deg)`,
  }),

  echoTrail: ({ t }) => {
    const dx = Math.sin(t * 2) * 30;
    return {
      transform: `translateX(${dx}px)`,
      filter:
        `drop-shadow(${-dx * 0.3}px 0 0 rgba(255,0,255,0.45)) ` +
        `drop-shadow(${-dx * 0.6}px 0 0 rgba(0,255,255,0.35)) ` +
        `drop-shadow(${-dx * 0.9}px 0 0 rgba(255,255,0,0.22))`,
    };
  },

  crtTurnOn: ({ progress: p }) => {
    const a = clamp(p / 0.4);
    const b = clamp((p - 0.4) / 0.6);
    return {
      transform: `scaleX(${0.2 + a * 0.8}) scaleY(${0.02 + b * 0.98})`,
      filter: `brightness(${1 + (1 - b) * 2.5})`,
    };
  },

  flameFlicker: ({ t, frame }) => ({
    transform: `translateY(${Math.sin(t * 8) * 2}px) scaleY(${1 + Math.sin(t * 12) * 0.04})`,
    filter: `hue-rotate(${-12 + seededRandom(frame) * 22}deg) brightness(${1.1 + seededRandom(frame) * 0.3}) saturate(1.6)`,
  }),

  rainbowCycle: ({ t }) => ({ filter: `hue-rotate(${(t * 120) % 360}deg) saturate(1.4)` }),

  powerUp: ({ beat }) => ({
    transform: `scale(${1 + beat * 0.3})`,
    filter: `brightness(${1 + beat}) drop-shadow(0 0 ${beat * 22}px gold)`,
  }),

  arcadeHop: ({ t }) => {
    const q = quantize(Math.abs(Math.sin(t * 6)), 4);
    return { transform: `translateY(${-q * 26}px) scaleY(${1 + q * 0.06}) scaleX(${1 - q * 0.04})` };
  },

  wobbleVHS: ({ t }) => ({
    transform: `perspective(600px) rotateY(${Math.sin(t * 1.5) * 6}deg) skewX(${Math.sin(t * 3) * 2}deg)`,
    filter: `blur(${(1 + Math.sin(t * 9)) * 0.4}px)`,
  }),

  // --- backgrounds (full-frame) ---
  synthGrid: ({ t }) => ({
    backgroundColor: "#120025",
    backgroundImage: [
      "radial-gradient(circle at 50% 32%, #ff2e88 0, #ff6ec7 7%, rgba(255,110,199,0) 22%)",
      "repeating-linear-gradient(0deg, rgba(0,240,255,0) 0 38px, rgba(0,240,255,0.55) 38px 40px)",
      "repeating-linear-gradient(90deg, rgba(255,46,136,0) 0 38px, rgba(255,46,136,0.4) 38px 40px)",
    ].join(", "),
    backgroundPosition: `0 0, 0 ${(t * 60) % 40}px, 0 0`,
  }),

  starfield: ({ t }) => ({
    backgroundColor: "#03030f",
    backgroundImage: [
      "radial-gradient(1px 1px at 15% 20%, #fff, transparent 2px), radial-gradient(1px 1px at 80% 60%, #cde, transparent 2px), radial-gradient(1px 1px at 45% 85%, #fff, transparent 2px)",
      "radial-gradient(2px 2px at 60% 30%, #9cf, transparent 3px), radial-gradient(2px 2px at 30% 72%, #fff, transparent 3px)",
    ].join(", "),
    backgroundSize: "300px 300px, 520px 520px",
    backgroundPosition: `0 ${(t * 40) % 300}px, 0 ${(t * 80) % 520}px`,
  }),

  crtRoom: ({ frame }) => ({
    backgroundColor: "#0a0a0f",
    backgroundImage:
      "repeating-linear-gradient(0deg, rgba(0,0,0,0.35) 0 1px, transparent 1px 3px), " +
      "radial-gradient(circle at 50% 50%, transparent 55%, rgba(0,0,0,0.85) 100%)",
    filter: `brightness(${0.97 + seededRandom(frame) * 0.06})`,
  }),

  // --- overlay (full-frame, on top) ---
  vignette: ({ t }) => ({
    backgroundImage: `radial-gradient(circle at 50% 50%, transparent ${48 + Math.sin(t * 1.5) * 4}%, rgba(0,0,0,0.72) 100%)`,
  }),
};
