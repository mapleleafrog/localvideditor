import type { MotionCtx } from "./types";
import {
  TAU,
  clamp,
  lerp,
  smooth,
  easeOutCubic,
  springy,
  bounceOut,
  elasticOut,
  bez,
  seededRandom,
  quantize,
  stepTime,
} from "./helpers";
import { CATALOG } from "./catalog";

// ---------------------------------------------------------------------------
// SINGLE SOURCE of every motion formula, the depth math, and composeStyles.
//
// Framework-neutral: no React, no Remotion (only a type-only MotionCtx import,
// erased at bundle time). The TS render side consumes this via the family files
// (motions/depth/pixel/retro) and the registry; the no-npm portal consumes the
// SAME functions via the esbuild-generated public/portal/effects.bundle.js
// (window.SoranjiEffects). Edit a formula here once → both sides update.
//
// Formula bodies are RELOCATED VERBATIM from the former motions.ts / depth.ts /
// pixel.ts / retro.ts. Do not alter the math — visually identical output is the
// acceptance bar.
// ---------------------------------------------------------------------------

/** Framework-neutral CSS-property record (structurally compatible with React.CSSProperties). */
export type StyleObject = Record<string, string | number>;

// ===== depth / 2.5D math (moved from depth.ts) =====

/** A drop-shadow string sized by depth (0=far .. 1=near). */
export const depthShadow = (z: number): string => {
  const zz = clamp(z);
  const y = lerp(1, 28, zz);
  const blur = lerp(2, 38, zz);
  const op = lerp(0.18, 0.5, zz);
  return `drop-shadow(0px ${y.toFixed(1)}px ${blur.toFixed(1)}px rgba(0,0,0,${op.toFixed(2)}))`;
};

/** Scale a near layer up, a far layer down — pairs with depthShadow. */
export const depthScale = (z: number): number => lerp(0.82, 1.16, clamp(z));

/** Beveled / embossed edge for panels and cards. `size` is the bevel thickness in px. */
export const bevel = (size = 3): StyleObject => ({
  boxShadow:
    `inset ${size}px ${size}px 0 rgba(255,255,255,0.45), ` +
    `inset ${-size}px ${-size}px 0 rgba(0,0,0,0.35), ` +
    `0 ${size * 2}px ${size * 3}px rgba(0,0,0,0.35)`,
});

// ===== shared formula constants =====
const GRAIN_URI =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

const SCANLINE_GRADIENT =
  "repeating-linear-gradient(0deg, rgba(0,0,0,0.22) 0px, rgba(0,0,0,0.22) 1px, transparent 1px, transparent 3px)";

// ===== composeStyles (moved from compose.ts) =====

/**
 * Merge a stack of motion styles into one: `transform` concatenated, `filter`
 * concatenated, `opacity` multiplied, everything else last-wins.
 */
export const composeStyles = (styles: StyleObject[]): StyleObject => {
  const out: Record<string, unknown> = {};
  const transforms: string[] = [];
  const filters: string[] = [];
  let opacity = 1;
  let hasOpacity = false;

  for (const s of styles) {
    for (const [k, v] of Object.entries(s)) {
      if (v == null) continue;
      if (k === "transform") {
        transforms.push(String(v));
      } else if (k === "filter") {
        if (v !== "none") filters.push(String(v));
      } else if (k === "opacity") {
        opacity *= Number(v);
        hasOpacity = true;
      } else {
        out[k] = v;
      }
    }
  }

  if (transforms.length) out.transform = transforms.join(" ");
  if (filters.length) out.filter = filters.join(" ");
  if (hasOpacity) out.opacity = opacity;
  return out as StyleObject;
};

// ===== every ready motion formula, keyed by id (verbatim relocation) =====
export const MOTION_FORMULAS: Record<string, (ctx: MotionCtx) => StyleObject> = {
  // --- Ken Burns / Zoom ---
  kenBurns: ({ progress: p }) => ({
    transform: `scale(${1.1 + p * 0.25}) translate(${(0.5 - p) * 4}%, ${(0.5 - p) * 3}%)`,
  }),
  slowZoomIn: ({ progress: p }) => ({ transform: `scale(${1 + p * 0.4})` }),
  slowZoomOut: ({ progress: p }) => ({ transform: `scale(${1.4 - p * 0.4})` }),
  pulseZoom: ({ beat }) => ({ transform: `scale(${1.05 + beat * 0.14})` }),
  smashZoom: ({ progress: p }) => ({
    transform: `scale(${1 + smooth(clamp(p * 1.3)) * 0.55})`,
    filter: `blur(${Math.sin(p * Math.PI) * 6}px)`,
  }),
  focusBreath: ({ t }) => ({
    transform: `scale(${1.02 + Math.sin(t * 1.4) * 0.02})`,
    filter: `blur(${(1 + Math.cos(t * 1.4)) * 0.3}px)`,
  }),

  // --- Pan / Move ---
  panLR: ({ progress: p }) => ({ transform: `scale(1.3) translateX(${(0.5 - p) * 18}%)` }),
  panUD: ({ progress: p }) => ({ transform: `scale(1.3) translateY(${(0.5 - p) * 18}%)` }),
  parallaxPan: ({ progress: p, params }) => ({
    transform: `scale(1.4) translateX(${(0.5 - p) * 20 * (params.speed ?? 1)}%)`,
  }),
  driftFloat: ({ t }) => ({
    transform: `translate(${Math.sin(t * 0.5) * 12}px, ${Math.cos(t * 0.4) * 10}px)`,
  }),
  kineticText: ({ progress: p }) => ({
    transform: `translateX(${(1 - smooth(clamp(p * 1.5))) * -40}px)`,
    opacity: clamp(p * 2),
  }),

  // --- Path (set only left/top; Layer supplies translate(-50%,-50%)) ---
  motionPath: ({ progress: p }) => {
    const pt = bez(p, [12, 82], [28, 12], [72, 92], [88, 18]);
    return { left: `${pt[0]}%`, top: `${pt[1]}%` };
  },
  arcMove: ({ progress: p }) => ({
    left: `${lerp(10, 90, p)}%`,
    top: `${80 - Math.sin(p * Math.PI) * 55}%`,
  }),
  orbit: ({ t, params }) => {
    const r = params.radius ?? 30;
    return {
      left: `${50 + Math.cos(t * 1.2) * r}%`,
      top: `${50 + Math.sin(t * 1.2) * r * 0.6}%`,
    };
  },
  drawOn: ({ progress: p }) => ({ clipPath: `inset(0 ${(1 - p) * 100}% 0 0)` }),
  bezierFloat: ({ t }) => {
    const pt = bez((Math.sin(t * 0.5) + 1) / 2, [20, 50], [40, 10], [60, 90], [80, 50]);
    return { left: `${pt[0]}%`, top: `${pt[1]}%` };
  },

  // --- Physics / Spring ---
  springPop: ({ progress: p }) => ({ transform: `scale(${springy(p)})` }),
  bounceIn: ({ progress: p }) => ({
    transform: `translateY(${(1 - bounceOut(p)) * -60}px)`,
    opacity: Math.min(1, p * 3),
  }),
  elasticIn: ({ progress: p }) => ({ transform: `scale(${elasticOut(p)})` }),
  jiggleWobble: ({ progress: p }) => ({
    transform: `rotate(${Math.sin(p * TAU * 3) * (1 - p) * 10}deg)`,
  }),
  inertiaSlide: ({ progress: p }) => ({
    transform: `translateX(${(1 - easeOutCubic(p)) * 140}px)`,
  }),
  squashStretch: ({ t }) => {
    const s = Math.sin(t * 4);
    return { transform: `scale(${1 + s * 0.15}, ${1 - s * 0.12})`, transformOrigin: "bottom center" };
  },
  pendulum: ({ t }) => ({
    transform: `rotate(${Math.sin(t * 2) * 18}deg)`,
    transformOrigin: "top center",
  }),

  // --- 3D / Perspective (CSS perspective only) ---
  tiltPerspective: ({ t }) => ({
    transform: `perspective(800px) rotateY(${Math.sin(t * 1.2) * 10}deg) rotateX(${Math.cos(t * 1.0) * 6}deg)`,
  }),
  flip3DLayer: ({ progress: p }) => ({
    transform: `perspective(800px) rotateY(${p * 360}deg)`,
  }),

  // --- Camera (CSS analogs of cinematic moves) ---
  dollyInOut: ({ progress: p }) => ({ transform: `scale(${1 + Math.sin(p * Math.PI) * 0.4})` }),
  truck: ({ progress: p }) => ({ transform: `scale(1.2) translateX(${(0.5 - p) * 30}%)` }),
  pedestal: ({ progress: p }) => ({ transform: `scale(1.2) translateY(${(0.5 - p) * 22}%)` }),
  panCam: ({ progress: p }) => ({
    transform: `perspective(1200px) rotateY(${(0.5 - p) * 16}deg) scale(1.15)`,
  }),
  tiltCam: ({ progress: p }) => ({
    transform: `perspective(1200px) rotateX(${(p - 0.5) * 14}deg) scale(1.15)`,
  }),
  zoomLens: ({ progress: p }) => ({ transform: `scale(${1 + p * 0.6})` }),
  rackFocus: ({ progress: p }) => ({ filter: `blur(${(1 - smooth(clamp(p * 1.3))) * 10}px)` }),
  dollyZoom: ({ progress: p }) => ({
    transform: `perspective(${lerp(1200, 320, p)}px) scale(${1 + p * 0.25})`,
  }),
  whipPanCam: ({ progress: p }) => ({
    transform: `translateX(${(0.5 - p) * 120}%)`,
    filter: `blur(${Math.sin(p * Math.PI) * 8}px)`,
  }),
  craneJib: ({ progress: p }) => ({
    transform: `scale(${1.1 + p * 0.2}) translateY(${(0.5 - p) * 20}%)`,
  }),
  arcShot: ({ progress: p }) => ({
    transform: `perspective(1000px) rotateY(${(0.5 - p) * 24}deg) scale(1.2)`,
  }),
  handheld: ({ t }) => {
    const nx = (Math.sin(t * 7) + Math.sin(t * 13) * 0.5) * 5;
    const ny = (Math.cos(t * 9) + Math.sin(t * 5) * 0.5) * 4;
    return { transform: `translate(${nx}px, ${ny}px) rotate(${Math.sin(t * 4) * 1.2}deg)` };
  },
  // Gentle living drift so the tilt doesn't read as a frozen frame (audit: was fully static).
  dutchAngle: ({ t, params }) => ({
    transform: `rotate(${((params.angle ?? 8) + Math.sin(t * 0.35) * 0.8).toFixed(2)}deg) scale(1.1)`,
  }),
  steadicamFollow: ({ t }) => ({
    transform: `translate(${Math.sin(t * 0.6) * 20}px, ${Math.cos(t * 0.5) * 10}px) scale(1.1)`,
  }),

  // --- Loop / Idle ---
  breathingLoop: ({ t }) => ({ transform: `scale(${1.04 + Math.sin(t * 1.6) * 0.035})` }),
  floatLoop: ({ t }) => ({ transform: `translateY(${Math.sin(t * 1.6) * 10}px)` }),
  swayLoop: ({ t }) => ({
    transform: `rotate(${Math.sin(t * 1.2) * 5}deg)`,
    transformOrigin: "bottom center",
  }),
  shimmerLoop: ({ t }) => ({
    backgroundImage: "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.5) 50%, transparent 70%)",
    backgroundSize: "220% 100%",
    backgroundPosition: `${((t * 0.4) % 1) * 240 - 60}% 0`,
  }),
  pulseGlow: ({ t }) => ({
    filter: `drop-shadow(0 0 ${8 + Math.sin(t * 2) * 8}px rgba(255,210,150,0.8))`,
  }),
  grainLoop: ({ frame }) => ({
    backgroundImage: GRAIN_URI,
    opacity: 0.07,
    backgroundPosition: `${seededRandom(frame) * 100}% ${seededRandom(frame + 9) * 100}%`,
    mixBlendMode: "overlay",
  }),

  // --- Beat-reactive (frame-derived beat) ---
  beatPulse: ({ beat }) => ({ transform: `scale(${1.05 + beat * 0.22})` }),
  beatFlash: ({ beat }) => ({ backgroundColor: "#fff", opacity: beat * 0.6 }),
  beatShake: ({ beat, t }) => ({
    transform: `translate(${Math.sin(t * 60) * beat * 8}px, ${Math.cos(t * 55) * beat * 6}px)`,
  }),
  beatColorCycle: ({ beat }) => ({ filter: `hue-rotate(${beat * 120}deg) saturate(${1 + beat})` }),
  beatZoomCut: ({ beat }) => ({ transform: `scale(${1 + (beat > 0.6 ? 0.15 : 0)})` }),
  audioBars: ({ beat }) => ({ transform: `scaleY(${0.3 + beat * 0.7})`, transformOrigin: "bottom" }),
  waveform: ({ t, beat }) => ({
    transform: `scaleY(${0.5 + Math.abs(Math.sin(t * 6)) * 0.4 + beat * 0.2})`,
    transformOrigin: "center",
  }),

  // --- Depth / 2.5D ---
  dropShadowLift: ({ progress: p }) => ({
    transform: `translateY(${-p * 14}px) scale(${lerp(1, 1.08, p)})`,
    filter: depthShadow(lerp(0.1, 0.9, p)),
  }),
  bevelEmboss: ({ t }) => ({
    ...bevel(3),
    transform: `translateY(${Math.sin(t * 1.2) * 2}px)`,
  }),
  parallaxDepth: ({ progress: p, params }) => {
    const z = params.z ?? 0.5;
    return {
      transform: `translateX(${(0.5 - p) * 50 * z}px) scale(${depthScale(z)})`,
      filter: depthShadow(z),
    };
  },
  floatShadow: ({ t }) => {
    const bob = Math.sin(t * 1.6);
    const up = Math.max(0, bob);
    return {
      transform: `translateY(${-bob * 10}px)`,
      filter: `drop-shadow(0px ${12 + up * 16}px ${6 + up * 12}px rgba(0,0,0,${(0.45 - up * 0.2).toFixed(2)}))`,
    };
  },
  tiltShadow: ({ t }) => {
    const ry = Math.sin(t * 1.2) * 12;
    const rx = Math.cos(t * 1.0) * 7;
    const sx = Math.sin(t * 1.2) * 18;
    return {
      transform: `perspective(700px) rotateY(${ry}deg) rotateX(${rx}deg)`,
      filter: `drop-shadow(${-sx}px 14px 14px rgba(0,0,0,0.4))`,
    };
  },
  popLayer: ({ beat: k }) => ({
    transform: `scale(${1 + k * 0.18}) translateY(${-k * 10}px)`,
    filter: depthShadow(0.3 + k * 0.6),
  }),

  // --- Pixel-art ---
  pixelBob: ({ t }) => ({
    transform: `translateY(${quantize(Math.sin(t * 2), 6) * -12}px)`,
  }),
  spriteBlink: ({ frame, fps }) => {
    const period = fps * 1.3;
    const phase = (frame % period) / period;
    return { opacity: phase > 0.92 ? 0.15 : 1 };
  },
  paletteCycle: ({ t }) => ({
    filter: `hue-rotate(${quantize((t * 0.15) % 1, 8) * 360}deg) saturate(1.2)`,
  }),
  pixelShake: ({ t }) => {
    const sx = Math.round(Math.sin(t * 30) * 2);
    const sy = Math.round(Math.cos(t * 27) * 2);
    return { transform: `translate(${sx}px, ${sy}px)` };
  },
  crtScanlines: ({ t }) => ({
    backgroundImage: SCANLINE_GRADIENT,
    opacity: 0.5 + Math.sin(t * 40) * 0.06,
    mixBlendMode: "multiply",
  }),
  stepWalk: ({ t }) => {
    const x = stepTime(t, 6) * 30;
    const hop = Math.round(Math.abs(Math.sin(t * 8)));
    return { transform: `translateX(${x % 120}px) translateY(${-hop * 2}px)` };
  },

  // --- Retro / FX ---
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

  // --- Backgrounds (full-frame) ---
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

  // ======================= PACK: Pixel-art (more) =======================
  eightBitHop: ({ t }) => {
    const q = quantize(Math.abs(Math.sin(t * 5)), 3);
    return { transform: `translateY(${-q * 22}px) scaleY(${1 + q * 0.05})`, transformOrigin: "bottom center" };
  },
  spriteFlash: ({ beat }) => ({ filter: `brightness(${1 + beat * 1.8}) saturate(${1 + beat})` }),
  pixelWindSway: ({ t }) => ({
    transform: `rotate(${quantize(Math.sin(t * 1.4), 5) * 6}deg)`,
    transformOrigin: "bottom center",
  }),
  ditherFadeIn: ({ progress: p }) => ({ opacity: quantize(clamp(p * 1.1), 6) }),
  pixelPop: ({ progress: p }) => ({ transform: `scale(${quantize(springy(p), 6)})` }),

  // ======================= PACK: Retro / Cyber (more) =======================
  rgbSplitHeavy: ({ t }) => {
    const o = 5 + Math.abs(Math.sin(t * 3)) * 7;
    return {
      filter:
        `drop-shadow(${o}px 0 0 rgba(255,0,90,0.75)) ` +
        `drop-shadow(${-o}px 0 0 rgba(0,225,255,0.75)) ` +
        `drop-shadow(0 ${o * 0.4}px 0 rgba(70,255,130,0.35))`,
    };
  },
  dataGlitchBlocks: ({ frame }) => {
    const on = seededRandom(Math.floor(frame / 3)) > 0.7;
    const dx = on ? Math.round((seededRandom(frame) - 0.5) * 22) : 0;
    const sk = on ? (seededRandom(frame + 4) - 0.5) * 10 : 0;
    return {
      transform: `translateX(${dx}px) skewX(${sk}deg)`,
      filter: on ? `hue-rotate(${Math.round(seededRandom(frame + 2) * 300)}deg) saturate(1.5) contrast(1.2)` : "none",
    };
  },
  neonBorderPulse: ({ t }) => {
    const g = 6 + Math.sin(t * 3) * 5;
    const hue = (t * 60) % 360;
    return {
      boxShadow: `0 0 ${g}px hsl(${hue} 100% 60%), inset 0 0 ${g}px hsl(${(hue + 40) % 360} 100% 60%)`,
      borderRadius: "6px",
    };
  },
  vaporTint: ({ t }) => ({
    filter: `saturate(1.5) hue-rotate(${280 + Math.sin(t * 0.8) * 20}deg) contrast(1.05) brightness(1.05)`,
  }),
  scanlineFlicker: ({ t }) => ({
    backgroundImage: SCANLINE_GRADIENT,
    filter: `brightness(${1.05 + Math.sin(t * 45) * 0.05}) contrast(1.05)`,
  }),

  // ======================= PACK: Retro backdrops (full-frame) =======================
  synthSunset: ({ t }) => ({
    backgroundColor: "#1a0533",
    backgroundImage: [
      "radial-gradient(circle at 50% 78%, #ffd36e 0, #ff7eb3 12%, #ff2e88 20%, rgba(255,46,136,0) 42%)",
      "linear-gradient(180deg, #2b0a4a 0%, #6a1e6b 45%, #ff5e8a 75%, #ffd36e 100%)",
    ].join(", "),
    backgroundPosition: `0 ${Math.sin(t * 0.4) * 6}px, 0 0`,
  }),
  gridRunner: ({ t }) => ({
    backgroundColor: "#06001a",
    backgroundImage: [
      "linear-gradient(180deg, rgba(6,0,26,0) 40%, #06001a 75%)",
      "repeating-linear-gradient(0deg, rgba(0,240,255,0.55) 0 2px, rgba(0,240,255,0) 2px 44px)",
      "repeating-linear-gradient(90deg, rgba(255,46,136,0.5) 0 2px, rgba(255,46,136,0) 2px 60px)",
    ].join(", "),
    backgroundPosition: `0 0, 0 ${(t * 80) % 44}px, 0 0`,
  }),

  // ======================= PACK: Wedding — element glow/grade (overlay) =======================
  goldenHour: ({ t }) => ({
    filter: `sepia(0.28) saturate(1.3) brightness(${1.05 + Math.sin(t * 1.2) * 0.02}) hue-rotate(-8deg) drop-shadow(0 0 14px rgba(255,196,120,0.55))`,
  }),
  dreamGlow: ({ t }) => ({
    filter: `brightness(1.08) saturate(1.1) drop-shadow(0 0 ${10 + Math.sin(t * 1.6) * 6}px rgba(255,255,255,0.85)) drop-shadow(0 0 26px rgba(255,220,235,0.5))`,
  }),
  romanticGlow: ({ t }) => ({
    filter:
      `drop-shadow(0 0 ${8 + Math.sin(t * 2) * 6}px rgba(255,120,170,0.85)) ` +
      `drop-shadow(0 0 ${18 + Math.sin(t * 2) * 10}px rgba(255,170,140,0.55)) brightness(1.05)`,
  }),
  softFocusBreath: ({ t }) => ({
    transform: `scale(${1.01 + Math.sin(t * 1.1) * 0.015})`,
    filter: `blur(${0.6 + (1 + Math.sin(t * 1.1)) * 0.5}px) brightness(1.05)`,
  }),
  sparkleGlow: ({ t, frame }) => {
    const tw = 0.5 + seededRandom(Math.floor(frame / 4)) * 0.5;
    return {
      filter:
        `drop-shadow(${Math.sin(t * 2) * 6}px ${Math.cos(t * 2.3) * 6}px 0 rgba(255,255,255,${tw.toFixed(2)})) ` +
        `drop-shadow(${Math.cos(t * 1.7) * 8}px ${Math.sin(t * 2.1) * 8}px 1px rgba(255,240,180,${(tw * 0.7).toFixed(2)})) brightness(1.08)`,
    };
  },

  // ======================= PACK: Wedding — full-frame atmospherics (FX overlay) =======================
  weddingPetals: ({ t }) => {
    const petal = (seed: number, xBase: number, size: number, speed: number, drift: number) => {
      const y = ((t * speed + seed * 21) % 122) - 11;
      const x = xBase + Math.sin(t * drift + seed) * 7;
      return `radial-gradient(ellipse ${size}px ${size * 0.62}px at ${x}% ${y}%, rgba(255,${188 + seed * 6},214,0.92), rgba(255,188,214,0) 72%)`;
    };
    return {
      backgroundImage: [
        petal(0, 16, 9, 15, 0.6),
        petal(1, 38, 7, 21, 0.8),
        petal(2, 58, 10, 18, 0.5),
        petal(3, 77, 6, 25, 0.7),
        petal(4, 30, 8, 29, 0.9),
        petal(5, 88, 9, 20, 0.6),
        // audit: 6 petals read as near-empty at 1080p — densified to 10 (same character).
        petal(6, 8, 8, 23, 0.75),
        petal(7, 48, 11, 13, 0.55),
        petal(8, 68, 7, 27, 0.85),
        petal(9, 94, 8, 17, 0.65),
      ].join(", "),
    };
  },
  confettiRain: ({ t }) => {
    const colors = ["#ff5e8a", "#ffd36e", "#5ee1ff", "#9b8cff", "#7cffb0"];
    const bit = (seed: number, xBase: number, speed: number) => {
      const y = ((t * speed + seed * 17) % 122) - 11;
      const x = xBase + Math.sin(t * (0.5 + seed * 0.1)) * 5;
      const c = colors[seed % colors.length];
      return `radial-gradient(circle 4px at ${x}% ${y}%, ${c}, ${c} 55%, rgba(0,0,0,0) 60%)`;
    };
    return { backgroundImage: Array.from({ length: 9 }, (_, i) => bit(i, 8 + i * 10, 24 + (i % 3) * 10)).join(", ") };
  },
  bokehLights: ({ t }) => {
    const orb = (seed: number, xb: number, yb: number, size: number, sp: number) => {
      const x = xb + Math.sin(t * sp + seed) * 10;
      const y = yb + Math.cos(t * sp * 0.8 + seed) * 8;
      return `radial-gradient(circle ${size}px at ${x}% ${y}%, rgba(255,240,210,${(0.18 + (seed % 3) * 0.05).toFixed(2)}), rgba(255,240,210,0) 70%)`;
    };
    return {
      backgroundImage: [orb(0, 20, 30, 70, 0.3), orb(1, 70, 25, 90, 0.25), orb(2, 45, 65, 60, 0.35), orb(3, 82, 70, 80, 0.2), orb(4, 30, 80, 50, 0.4), orb(5, 55, 15, 100, 0.22)].join(", "),
      // audit: blur(2px) read as hard circles, not bokeh — softened.
      filter: "blur(6px)",
    };
  },
  lightLeakWarm: ({ t }) => {
    const p = (Math.sin(t * 0.5) + 1) / 2;
    return {
      backgroundImage: `linear-gradient(${60 + Math.sin(t * 0.3) * 20}deg, rgba(255,120,60,0) ${10 + p * 30}%, rgba(255,170,90,0.55) ${35 + p * 30}%, rgba(255,90,140,0.35) ${55 + p * 30}%, rgba(255,120,60,0) ${85 + p * 10}%)`,
      mixBlendMode: "screen",
    };
  },
  sparkleField: ({ t }) => {
    // audit: 2px stars were sub-visible at 1080p — bumped to 3px + denser field.
    const star = (seed: number, x: number, y: number) => {
      const tw = Math.max(0, Math.sin(t * (2 + (seed % 3)) + seed));
      return `radial-gradient(circle 3px at ${x}% ${y}%, rgba(255,255,245,${(tw * 0.9).toFixed(2)}), rgba(255,255,245,0) 60%)`;
    };
    const pts: [number, number][] = [[12, 18], [28, 62], [44, 30], [60, 78], [76, 22], [88, 55], [20, 85], [52, 12], [68, 48], [36, 40], [84, 82], [8, 45], [58, 58], [92, 12]];
    return { backgroundImage: pts.map(([x, y], i) => star(i, x, y)).join(", ") };
  },

  // --- Ported from reactvideoeditor/remotion-templates (MIT) ---
  spotlightReveal: ({ progress: p }) => ({
    clipPath: `circle(${lerp(0, 75, easeOutCubic(p))}% at 50% 50%)`,
    filter: `brightness(${lerp(1.4, 1, p)})`,
  }),
  letterboxReveal: ({ progress: p }) => ({
    clipPath: `inset(${lerp(50, 0, easeOutCubic(p))}% 0 ${lerp(50, 0, easeOutCubic(p))}% 0)`,
  }),
  liquidWave: ({ t }) => {
    const x1 = 50 + Math.sin(t * 0.3) * 20;
    const y1 = 40 + Math.cos(t * 0.25) * 15;
    const x2 = 50 + Math.sin(t * 0.22 + 2) * 25;
    const y2 = 60 + Math.cos(t * 0.18 + 1) * 18;
    return {
      backgroundImage: `radial-gradient(circle at ${x1}% ${y1}%, rgba(120,180,255,0.25), transparent 55%), radial-gradient(circle at ${x2}% ${y2}%, rgba(255,200,220,0.2), transparent 60%)`,
      filter: "blur(18px)",
    };
  },
  monogramSpinReveal: ({ progress: p }) => ({
    opacity: p,
    transform: `scale(${lerp(0.4, 1, easeOutCubic(p))}) rotate(${lerp(-180, 0, easeOutCubic(p))}deg)`,
  }),
  monogramScaleRotate: ({ progress: p, t }) => ({
    opacity: clamp(p * 3),
    transform: `scale(${lerp(0.85, 1, easeOutCubic(clamp(p * 2)))}) rotate(${Math.sin(t * 0.6) * 4}deg)`,
  }),
  monogramBlurReveal: ({ progress: p }) => ({
    opacity: p,
    filter: `blur(${lerp(20, 0, easeOutCubic(p))}px)`,
    transform: `scale(${lerp(1.15, 1, easeOutCubic(p))})`,
  }),
  chapterTitleReveal: ({ progress: p }) => ({
    opacity: clamp(p * 2),
    transform: `translateY(${lerp(24, 0, easeOutCubic(p))}px)`,
    clipPath: `inset(0 ${lerp(100, 0, easeOutCubic(p))}% 0 0)`,
  }),
  quoteCardReveal: ({ progress: p }) => ({
    opacity: clamp(p * 2),
    transform: `scale(${lerp(1.08, 1, easeOutCubic(p))})`,
    backgroundColor: "rgba(10, 10, 16, 0.35)",
    borderRadius: "10px",
    padding: "18px 28px",
    boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
  }),
  lowerThirdBar: ({ progress: p }) => ({
    opacity: clamp(p * 3),
    transform: `translateX(${lerp(-40, 0, easeOutCubic(p))}px)`,
    backgroundColor: "rgba(124, 92, 255, 0.85)",
    padding: "8px 20px",
    borderRadius: "3px",
    clipPath: `inset(0 ${lerp(100, 0, easeOutCubic(p))}% 0 0)`,
  }),
  polaroidFrame: ({ progress: p, t }) => ({
    opacity: clamp(p * 2),
    transform: `scale(${lerp(0.92, 1, easeOutCubic(p))}) rotate(${-2 + Math.sin(t * 0.4) * 1.5}deg)`,
    border: "10px solid #fdfdfa",
    borderBottom: "38px solid #fdfdfa",
    boxShadow: "0 18px 36px rgba(0,0,0,0.45)",
  }),
  circularProgressReveal: ({ progress: p }) => ({
    backgroundImage: `conic-gradient(from -90deg, #7c5cff ${p * 360}deg, rgba(255,255,255,0.12) ${p * 360}deg)`,
    borderRadius: "50%",
    boxShadow: "inset 0 0 0 6px rgba(0,0,0,0.35)",
  }),

  // ======================= PACK: Japan MV — sakura / flare / komorebi / grade =======================
  sakuraPetals: ({ t }) => {
    // 14 sakura-pink petals: tumbling (the ellipse radii oscillate = petal flutter), drifting
    // slightly left as they fall (wind), each with its own size/speed/sway phase.
    const petal = (seed: number, xBase: number, size: number, fall: number, sway: number) => {
      const y = ((t * fall + seed * 19) % 124) - 12;
      const x = xBase - y * 0.08 + Math.sin(t * sway + seed * 1.7) * 6;
      const tumble = Math.abs(Math.sin(t * (1.2 + (seed % 4) * 0.3) + seed));
      const rx = size * (0.72 + 0.28 * tumble);
      const ry = size * (0.42 + 0.22 * (1 - tumble));
      const g = 183 + (seed % 4) * 8; // 255,183..207,197.. — sakura pinks
      return `radial-gradient(ellipse ${rx.toFixed(1)}px ${ry.toFixed(1)}px at ${x.toFixed(1)}% ${y.toFixed(1)}%, rgba(255,${g},${g + 14},0.95), rgba(255,${g},${g + 14},0) 70%)`;
    };
    const P: [number, number, number][] = [
      [16, 11, 10], [30, 8, 14], [44, 12, 8], [58, 7, 16], [72, 10, 12], [86, 9, 15], [8, 8, 13],
      [24, 12, 9], [38, 7, 17], [52, 11, 11], [66, 8, 15], [80, 13, 7], [94, 9, 12], [12, 10, 18],
    ];
    return { backgroundImage: P.map(([xb, sz, fall], i) => petal(i, xb, sz, fall, 0.5 + (i % 5) * 0.1)).join(", ") };
  },
  lensFlare: ({ t }) => {
    // Anamorphic flare: warm core + thin horizontal cyan streak through it + ghost orbs mirrored
    // through frame center (classic lens-ghost axis). Screen blend → drop it on any footage.
    const cx = 50 + Math.sin(t * 0.21) * 26;
    const cy = 32 + Math.cos(t * 0.17) * 12;
    const pulse = 0.75 + 0.25 * Math.sin(t * 0.9);
    const ghost = (k: number, size: number, a: number) => {
      const gx = 50 + (50 - cx) * k;
      const gy = 50 + (50 - cy) * k;
      return `radial-gradient(circle ${size}px at ${gx.toFixed(1)}% ${gy.toFixed(1)}%, rgba(140,200,255,${a}), rgba(140,200,255,0) 70%)`;
    };
    return {
      backgroundImage: [
        `radial-gradient(circle 90px at ${cx.toFixed(1)}% ${cy.toFixed(1)}%, rgba(255,250,235,${(0.85 * pulse).toFixed(2)}), rgba(255,240,200,0) 70%)`,
        `linear-gradient(0deg, rgba(90,170,255,0) ${(cy - 1.4).toFixed(1)}%, rgba(120,190,255,${(0.5 * pulse).toFixed(2)}) ${cy.toFixed(1)}%, rgba(90,170,255,0) ${(cy + 1.4).toFixed(1)}%)`,
        ghost(0.5, 26, 0.2),
        ghost(0.95, 40, 0.14),
        ghost(1.4, 18, 0.18),
      ].join(", "),
      mixBlendMode: "screen",
    };
  },
  godRays: ({ t }) => {
    // Komorebi: broad diagonal light shafts sliding slowly, breathing in intensity, with the
    // source glow pinned to the top-left. Screen blend + blur = soft volumetric feel.
    const breathe = 0.6 + 0.4 * Math.sin(t * 0.45);
    const shift = (t * 6) % 140;
    return {
      backgroundImage: [
        `radial-gradient(circle 60% at 12% -8%, rgba(255,248,222,${(0.32 * breathe).toFixed(3)}), rgba(255,248,222,0) 70%)`,
        `repeating-linear-gradient(63deg, rgba(255,246,214,0) 0px, rgba(255,246,214,${(0.14 * breathe).toFixed(3)}) 60px, rgba(255,246,214,0) 140px)`,
      ].join(", "),
      backgroundPosition: `0 0, ${shift.toFixed(1)}px 0`,
      mixBlendMode: "screen",
      filter: "blur(6px)",
    };
  },
  japanMvGrade: ({ t }) => ({
    // Pastel J-MV grade: lowered contrast (lifted blacks), desaturated, warm-pink cast, with a
    // barely-there exposure breath so it feels filmic rather than frozen.
    filter: `contrast(0.94) saturate(0.82) brightness(${(1.05 + Math.sin(t * 0.5) * 0.015).toFixed(3)}) sepia(0.10) hue-rotate(-6deg)`,
  }),
};

// ===== CSS transition formulas (moved verbatim from presentations.tsx) =====
//
// A transition at progress p (0..1) is up to three styled full-frame layers:
//   a = the EXITING scene (below), b = the ENTERING scene (on top), o = an overlay drawn above b
//   (dip colour, light-leak sweep). A missing part means "unstyled".
// presentations.tsx wraps these in Remotion TransitionPresentations; the no-npm portal applies the
// SAME functions to its two scene divs + overlay — one formula, no hand-mirrored copy.

export interface TransitionParts {
  a?: StyleObject;
  b?: StyleObject;
  o?: StyleObject;
}
/** Per-transition props: frame size (starWipe sizes its star to the diagonal) and an optional
 *  dip colour override. */
export interface TransitionProps {
  width?: number;
  height?: number;
  color?: string;
}
export type TransitionFormula = (p: number, props: TransitionProps) => TransitionParts;

const fullMask = (uri: string, size: string): StyleObject => ({
  maskImage: uri,
  WebkitMaskImage: uri,
  maskSize: size,
  WebkitMaskSize: size,
  maskRepeat: "no-repeat",
  WebkitMaskRepeat: "no-repeat",
  maskPosition: "center",
  WebkitMaskPosition: "center",
});

const tiledMask = (uri: string, tile: string): StyleObject => ({
  maskImage: uri,
  WebkitMaskImage: uri,
  maskSize: tile,
  WebkitMaskSize: tile,
  maskRepeat: "repeat",
  WebkitMaskRepeat: "repeat",
});

const HEART_URI =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M50,32 C50,12 18,12 18,38 C18,60 50,74 50,90 C50,74 82,60 82,38 C82,12 50,12 50,32 Z' fill='black'/%3E%3C/svg%3E\")";

// A tile with a centered black square sized by progress -> blocky grid reveal.
const squaresURI = (p: number) => {
  const s = Math.round(p * 100);
  const o = Math.round((1 - p) * 50);
  return `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Crect x='${o}' y='${o}' width='${s}' height='${s}' fill='black'/%3E%3C/svg%3E")`;
};

// Doom melt: the entering screen fills in column-by-column from the top, each
// column at a seeded-random rate (mask black = revealed entering scene).
const doomMaskURI = (p: number) => {
  const cols = 16;
  const w = 100 / cols;
  let rects = "";
  for (let i = 0; i < cols; i++) {
    const fill = clamp(p * 155 - seededRandom(i) * 55, 0, 100);
    rects += `%3Crect x='${(i * w).toFixed(2)}' y='0' width='${(w + 0.4).toFixed(2)}' height='${fill.toFixed(2)}' fill='black'/%3E`;
  }
  return `url("data:image/svg+xml,%3Csvg viewBox='0 0 100 100' preserveAspectRatio='none' xmlns='http://www.w3.org/2000/svg'%3E${rects}%3C/svg%3E")`;
};

// 4x4 Bayer-ordered dither: an 8px tile where cells whose threshold < p are
// black (revealed). Grows from none (p=0) to full (p=1) for a true 8-bit dissolve.
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const ditherURI = (p: number) => {
  let rects = "";
  for (let i = 0; i < 16; i++) {
    if ((BAYER4[i] + 0.5) / 16 < p) {
      rects += `%3Crect x='${(i % 4) * 2}' y='${Math.floor(i / 4) * 2}' width='2' height='2' fill='black'/%3E`;
    }
  }
  return `url("data:image/svg+xml,%3Csvg width='8' height='8' xmlns='http://www.w3.org/2000/svg'%3E${rects}%3C/svg%3E")`;
};

// Ordered mosaic: a full-frame NxN grid whose cells reveal in a pseudo-scrambled
// order as p:0->1 — a blocky "pixelate" fill distinct from randomSquares (random
// growing tiles), pixelDither (8px Bayer) and doomScreen (columns). The fill-order
// idea is ported from remocn's dither-dissolve; the block look is our own CSS mask.
const gridPixelURI = (p: number) => {
  const N = 14;
  const c = 100 / N;
  let rects = "";
  for (let row = 0; row < N; row++) {
    for (let col = 0; col < N; col++) {
      if (((col * 7 + row * 13) % 197) / 197 < p) {
        rects += `%3Crect x='${(col * c).toFixed(2)}' y='${(row * c).toFixed(2)}' width='${(c + 0.3).toFixed(2)}' height='${(c + 0.3).toFixed(2)}' fill='black'/%3E`;
      }
    }
  }
  return `url("data:image/svg+xml,%3Csvg viewBox='0 0 100 100' preserveAspectRatio='none' xmlns='http://www.w3.org/2000/svg'%3E${rects}%3C/svg%3E")`;
};

/** A 5-point star as an SVG path, centred on its bounding box at (cx, cy). The same vertices as
 *  @remotion/shapes' makeStar (point i at angle i·π/5 − π/2, alternating outer/inner radius),
 *  re-centred the way the old presentation did (translate by the bbox centre) — written here so
 *  the portal bundle does not have to carry @remotion/shapes + React. */
const starPath = (outer: number, inner: number, cx: number, cy: number) => {
  const pts: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  const xs = pts.map((q) => q[0]);
  const ys = pts.map((q) => q[1]);
  const dx = cx - (Math.min(...xs) + Math.max(...xs)) / 2;
  const dy = cy - (Math.min(...ys) + Math.max(...ys)) / 2;
  return "M " + pts.map(([x, y]) => `${x + dx} ${y + dy}`).join(" L ") + " Z";
};

// Dip-to-color / flash: scenes hard-cut at the midpoint while a full-frame
// color overlay peaks at p=0.5.
const dipParts =
  (color: string, sharpness: number): TransitionFormula =>
  (p, props) => ({
    a: { opacity: clamp(1 - p * 2) },
    b: { opacity: clamp(p * 2 - 1) },
    o: { backgroundColor: props.color ?? color, opacity: Math.pow(1 - Math.abs(2 * p - 1), sharpness) },
  });

/** Style the entering (top) layer only; the exiting scene stays opaque behind it. */
const reveal =
  (fn: (p: number) => StyleObject): TransitionFormula =>
  (p) => ({ b: fn(p) });

export const TRANSITION_FORMULAS: Record<string, TransitionFormula> = {
  // Light / color
  dipToColor: dipParts("#000000", 1),
  flashWhite: dipParts("#ffffff", 1.6),
  // Warm light-leak sweep over a crossfade.
  lightLeak: (p) => ({
    b: { opacity: p },
    o: {
      backgroundImage:
        "linear-gradient(115deg, transparent 20%, rgba(255,190,120,0.85) 45%, rgba(255,120,160,0.65) 55%, transparent 80%)",
      backgroundSize: "260% 100%",
      backgroundPosition: `${lerp(-80, 180, p)}% 0`,
      mixBlendMode: "screen",
      opacity: Math.sin(p * Math.PI) * 0.95,
    },
  }),

  // Zoom / blur — CSS look-alikes of the shader versions. Exiting layer stays
  // opaque behind; entering fades/scales in on top (clean crossfade, no bleed).
  whipPan: (p) => ({
    a: { transform: `translateX(${-p * 120}%)`, filter: `blur(${Math.sin(p * Math.PI) * 12}px)` },
    b: { transform: `translateX(${(1 - p) * 120}%)`, filter: `blur(${Math.sin(p * Math.PI) * 12}px)` },
  }),
  zoomBlur: (p) => ({
    a: { transform: `scale(${lerp(1, 0.85, p)})`, filter: `blur(${p * 14}px)` },
    b: { opacity: p, transform: `scale(${lerp(1.3, 1, p)})`, filter: `blur(${(1 - p) * 14}px)` },
  }),
  zoomInOut: (p) => ({
    a: { transform: `scale(${lerp(1, 1.4, p)})` },
    b: { opacity: clamp(p * 1.5), transform: `scale(${lerp(0.7, 1, p)})` },
  }),
  dreamyZoom: (p) => ({
    a: { transform: `scale(${lerp(1, 1.15, p)})`, filter: `blur(${p * 8}px) brightness(${lerp(1, 1.6, p)})` },
    b: {
      opacity: p,
      transform: `scale(${lerp(1.25, 1, p)}) rotate(${(1 - p) * 3}deg)`,
      filter: `blur(${(1 - p) * 10}px) brightness(${lerp(1.6, 1, p)})`,
    },
  }),
  simpleZoom: (p) => ({ a: {}, b: { opacity: clamp(p * 1.5), transform: `scale(${lerp(0.8, 1, p)})` } }),
  rgbSplit: (p) => {
    const off = Math.sin(p * Math.PI) * 12;
    const filter = `drop-shadow(${off}px 0 0 rgba(255,0,0,0.6)) drop-shadow(${-off}px 0 0 rgba(0,255,255,0.6))`;
    return { a: { filter }, b: { opacity: p, filter } };
  },
  // Directional glitch wipe with RGB channel fringing at the moving edge — distinct
  // from rgbSplit's static crossfade. Per-channel offset (remocn rgb-glitch-text
  // idea) swells at mid-progress while the entering scene wipes in left->right.
  chromaticAberration: (p) => {
    const off = Math.sin(p * Math.PI) * 26;
    const fringe = `drop-shadow(${off}px 0 0 rgba(255,0,64,0.75)) drop-shadow(${-off}px 0 0 rgba(0,220,255,0.75))`;
    return {
      a: { transform: `translateX(${-p * 22}%) skewX(${-p * 5}deg)`, filter: fringe },
      b: {
        clipPath: `inset(0 ${(1 - p) * 100}% 0 0)`,
        transform: `translateX(${(1 - p) * 22}%) skewX(${(1 - p) * 5}deg)`,
        filter: fringe,
      },
    };
  },

  // Slide / shape / mask — entering-only reveals over the held exiting scene.
  coverUncover: reveal((p) => ({ transform: `translateX(${(1 - p) * 100}%)` })),
  barnDoor: reveal((p) => ({ clipPath: `inset(0 ${(1 - p) * 50}% 0 ${(1 - p) * 50}%)` })),
  doorway: (p) => ({
    a: { filter: `brightness(${1 - p * 0.7})`, transform: `scale(${1 + p * 0.1})` },
    b: { clipPath: `inset(0 ${(1 - p) * 50}% 0 ${(1 - p) * 50}%)` },
  }),
  circleCrop: reveal((p) => ({ clipPath: `circle(${p * 75}% at 50% 50%)` })),
  rectangleCrop: reveal((p) => ({ clipPath: `inset(${(1 - p) * 50}% ${(1 - p) * 50}%)` })),
  svgMaskReveal: reveal((p) => ({
    clipPath: `polygon(0 0, ${p * 150}% 0, ${p * 150 - 50}% 100%, 0% 100%)`,
  })),
  windowBlinds: reveal((p) => {
    const g = `repeating-linear-gradient(180deg, #000 0, #000 ${p * 40}px, transparent ${p * 40}px, transparent 40px)`;
    return { maskImage: g, WebkitMaskImage: g };
  }),
  heart: reveal((p) => fullMask(HEART_URI, `${p * 200}%`)),
  // Star wipe: entering scene revealed through a growing, frame-centered star.
  starWipe: (p, props) => {
    const w = props.width ?? 1920;
    const h = props.height ?? 1080;
    const outer = Math.max(1, (Math.sqrt(w * w + h * h) / 2) * p);
    const clip = `path('${starPath(outer, outer * 0.5, w / 2, h / 2)}')`;
    return { b: { clipPath: clip, WebkitClipPath: clip } };
  },

  // Pixel / retro
  pixelize: (p) => ({
    a: { filter: `blur(${p * 9}px) contrast(1.1)` },
    b: { opacity: clamp(p * 1.4), filter: `blur(${(1 - p) * 9}px) contrast(1.1)`, imageRendering: "pixelated" },
  }),
  randomSquares: reveal((p) => tiledMask(squaresURI(clamp(p)), "64px 64px")),
  mosaicShatter: (p) => ({
    a: { transform: `scale(${lerp(1, 0.9, p)}) rotate(${-p * 4}deg)`, filter: `blur(${p * 4}px)` },
    b: { opacity: clamp(p * 1.5), transform: `scale(${lerp(1.15, 1, p)}) rotate(${(1 - p) * 4}deg)` },
  }),
  doomScreen: reveal((p) => fullMask(doomMaskURI(clamp(p)), "100% 100%")),
  gridPixelate: reveal((p) => fullMask(gridPixelURI(clamp(p)), "100% 100%")),

  // Advanced retro
  crtOn: reveal((p) => {
    const a = clamp(p / 0.4);
    const b = clamp((p - 0.4) / 0.6);
    return {
      transform: `scaleX(${0.2 + a * 0.8}) scaleY(${0.02 + b * 0.98})`,
      filter: `brightness(${1 + (1 - b) * 2})`,
      transformOrigin: "center",
    };
  }),
  glitchCut: reveal((p) => {
    const j = 1 - clamp(p * 1.4);
    return {
      opacity: clamp(p * 1.6),
      transform: `translateX(${Math.sin(p * 80) * 22 * j}px) skewX(${Math.sin(p * 50) * 6 * j}deg)`,
      filter: `hue-rotate(${Math.sin(p * 60) * 160 * j}deg) saturate(${1 + 2 * j}) contrast(${1 + j})`,
    };
  }),
  pixelDither: reveal((p) => tiledMask(ditherURI(clamp(p)), "8px 8px")),
  scanlineWipe: reveal((p) => {
    const e = p * 102;
    const g = `linear-gradient(180deg, #000 ${Math.max(0, e - 2)}%, transparent ${e}%)`;
    return { maskImage: g, WebkitMaskImage: g };
  }),
  vhsRewind: reveal((p) => ({
    opacity: clamp(p * 1.5),
    filter: `blur(${(1 - p) * 2.5}px) saturate(1.6) contrast(1.1)`,
    transform: `translateX(${(1 - p) * -34}px) skewX(${(1 - p) * 8}deg)`,
  })),
};

// ===== transition display metadata for the portal (derived from the catalog) =====
export const TRANSITION_META: Record<string, { name: string; category: string; tier: string; engine: string }> =
  Object.fromEntries(
    CATALOG.filter((e) => e.kind === "transition").map((e) => [e.id, { name: e.name, category: e.category, tier: e.tier, engine: e.engine }]),
  );

// ===== motion display metadata for the portal (derived from the catalog) =====
export const MOTION_META: Record<string, { name: string; category: string; tier: string }> =
  Object.fromEntries(
    CATALOG.filter((e) => e.kind === "motion").map((e) => [e.id, { name: e.name, category: e.category, tier: e.tier }]),
  );

// ===== re-export pure-math helpers so the bundle carries them (window.SoranjiEffects.*) =====
export {
  TAU,
  clamp,
  lerp,
  smooth,
  easeInOutCubic,
  easeOutCubic,
  springy,
  bounceOut,
  elasticOut,
  beatKick,
  beatIndex,
  bez,
  quantize,
  stepTime,
  seededRandom,
} from "./helpers";
