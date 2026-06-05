import type { CSSProperties } from "react";
import type { MotionCtx } from "./types";
import { quantize, stepTime } from "./helpers";

// ---------------------------------------------------------------------------
// Pixel-art family.
//
// The featured aesthetic: MapleStory-style sprites. The trick that sells
// "pixel art in motion" is QUANTIZATION — snapping smooth values to a few
// discrete steps / a low animation fps so movement reads as chunky sprite
// frames rather than buttery CSS easing. Sprites also render with
// `imageRendering: pixelated` (applied via the `.pixelated` class in the
// Mushroom wrapper) so upscaling stays crisp.
// ---------------------------------------------------------------------------

const SCANLINE_GRADIENT =
  "repeating-linear-gradient(0deg, rgba(0,0,0,0.22) 0px, rgba(0,0,0,0.22) 1px, transparent 1px, transparent 3px)";

export const pixelStyles: Record<string, (ctx: MotionCtx) => CSSProperties> = {
  // Stepped vertical bob — 6 discrete levels instead of a smooth sine.
  pixelBob: ({ t }) => ({
    transform: `translateY(${quantize(Math.sin(t * 2), 6) * -12}px)`,
  }),

  // Periodic blink (eyes/idle). Frame-derived for determinism.
  spriteBlink: ({ frame, fps }) => {
    const period = fps * 1.3;
    const phase = (frame % period) / period;
    return { opacity: phase > 0.92 ? 0.15 : 1 };
  },

  // Stepped hue rotation — 8-step palette swap rather than a continuous sweep.
  paletteCycle: ({ t }) => ({
    filter: `hue-rotate(${quantize((t * 0.15) % 1, 8) * 360}deg) saturate(1.2)`,
  }),

  // Integer-pixel jitter — every offset snapped to whole pixels.
  pixelShake: ({ t }) => {
    const sx = Math.round(Math.sin(t * 30) * 2);
    const sy = Math.round(Math.cos(t * 27) * 2);
    return { transform: `translate(${sx}px, ${sy}px)` };
  },

  // CRT scanline overlay (full-frame Layer) with a faint mains-hum flicker.
  crtScanlines: ({ t }) => ({
    backgroundImage: SCANLINE_GRADIENT,
    opacity: 0.5 + Math.sin(t * 40) * 0.06,
    mixBlendMode: "multiply",
  }),

  // Stepped "walk" — chunky horizontal travel with a 2px hop on alternate steps.
  stepWalk: ({ t }) => {
    const x = stepTime(t, 6) * 30;
    const hop = Math.round(Math.abs(Math.sin(t * 8)));
    return { transform: `translateX(${x % 120}px) translateY(${-hop * 2}px)` };
  },
};
