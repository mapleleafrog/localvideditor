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
  dutchAngle: ({ params }) => ({ transform: `rotate(${params.angle ?? 8}deg) scale(1.1)` }),
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
};

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
