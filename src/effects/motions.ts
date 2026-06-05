import type { MotionDef } from "./types";
import { CATALOG } from "./catalog";
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
} from "./helpers";
import { depthStyles } from "./depth";
import { pixelStyles } from "./pixel";

// Moving film-grain via an inline SVG turbulence texture (repositioned per frame).
const GRAIN_URI =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

// 1. Stub every motion row from the catalog (status stays 'todo').
const motions: Record<string, MotionDef> = {};
for (const e of CATALOG) if (e.kind === "motion") motions[e.id] = { ...e };

// 2. Override the implemented ids with status:'ready' + a CSS style(ctx).
const ready = (
  id: string,
  style: NonNullable<MotionDef["style"]>,
  defaults?: Record<string, number>,
) => {
  if (!motions[id]) throw new Error(`Motion "${id}" is implemented but missing from CATALOG`);
  motions[id] = { ...motions[id], status: "ready", style, defaults };
};

// --- Ken Burns / Zoom ---
ready("kenBurns", ({ progress: p }) => ({
  transform: `scale(${1.1 + p * 0.25}) translate(${(0.5 - p) * 4}%, ${(0.5 - p) * 3}%)`,
}));
ready("slowZoomIn", ({ progress: p }) => ({ transform: `scale(${1 + p * 0.4})` }));
ready("slowZoomOut", ({ progress: p }) => ({ transform: `scale(${1.4 - p * 0.4})` }));
ready("pulseZoom", ({ beat }) => ({ transform: `scale(${1.05 + beat * 0.14})` }));
ready("smashZoom", ({ progress: p }) => ({
  transform: `scale(${1 + smooth(clamp(p * 1.3)) * 0.55})`,
  filter: `blur(${Math.sin(p * Math.PI) * 6}px)`,
}));
ready("focusBreath", ({ t }) => ({
  transform: `scale(${1.02 + Math.sin(t * 1.4) * 0.02})`,
  filter: `blur(${(1 + Math.cos(t * 1.4)) * 0.3}px)`,
}));

// --- Pan / Move ---
ready("panLR", ({ progress: p }) => ({ transform: `scale(1.3) translateX(${(0.5 - p) * 18}%)` }));
ready("panUD", ({ progress: p }) => ({ transform: `scale(1.3) translateY(${(0.5 - p) * 18}%)` }));
ready(
  "parallaxPan",
  ({ progress: p, params }) => ({
    transform: `scale(1.4) translateX(${(0.5 - p) * 20 * (params.speed ?? 1)}%)`,
  }),
  { speed: 1 },
);
ready("driftFloat", ({ t }) => ({
  transform: `translate(${Math.sin(t * 0.5) * 12}px, ${Math.cos(t * 0.4) * 10}px)`,
}));
ready("kineticText", ({ progress: p }) => ({
  transform: `translateX(${(1 - smooth(clamp(p * 1.5))) * -40}px)`,
  opacity: clamp(p * 2),
}));

// --- Path ---
// Path motions set only left/top; `Layer` (centered) supplies translate(-50%,-50%).
ready("motionPath", ({ progress: p }) => {
  const pt = bez(p, [12, 82], [28, 12], [72, 92], [88, 18]);
  return { left: `${pt[0]}%`, top: `${pt[1]}%` };
});
ready("arcMove", ({ progress: p }) => ({
  left: `${lerp(10, 90, p)}%`,
  top: `${80 - Math.sin(p * Math.PI) * 55}%`,
}));
ready(
  "orbit",
  ({ t, params }) => {
    const r = params.radius ?? 30;
    return {
      left: `${50 + Math.cos(t * 1.2) * r}%`,
      top: `${50 + Math.sin(t * 1.2) * r * 0.6}%`,
    };
  },
  { radius: 30 },
);
ready("drawOn", ({ progress: p }) => ({ clipPath: `inset(0 ${(1 - p) * 100}% 0 0)` }));
ready("bezierFloat", ({ t }) => {
  const pt = bez((Math.sin(t * 0.5) + 1) / 2, [20, 50], [40, 10], [60, 90], [80, 50]);
  return { left: `${pt[0]}%`, top: `${pt[1]}%` };
});

// --- Physics / Spring ---
ready("springPop", ({ progress: p }) => ({ transform: `scale(${springy(p)})` }));
ready("bounceIn", ({ progress: p }) => ({
  transform: `translateY(${(1 - bounceOut(p)) * -60}px)`,
  opacity: Math.min(1, p * 3),
}));
ready("elasticIn", ({ progress: p }) => ({ transform: `scale(${elasticOut(p)})` }));
ready("jiggleWobble", ({ progress: p }) => ({
  transform: `rotate(${Math.sin(p * TAU * 3) * (1 - p) * 10}deg)`,
}));
ready("inertiaSlide", ({ progress: p }) => ({
  transform: `translateX(${(1 - easeOutCubic(p)) * 140}px)`,
}));
ready("squashStretch", ({ t }) => {
  const s = Math.sin(t * 4);
  return { transform: `scale(${1 + s * 0.15}, ${1 - s * 0.12})`, transformOrigin: "bottom center" };
});
ready("pendulum", ({ t }) => ({
  transform: `rotate(${Math.sin(t * 2) * 18}deg)`,
  transformOrigin: "top center",
}));

// --- 3D / Perspective (CSS perspective only) ---
ready("tiltPerspective", ({ t }) => ({
  transform: `perspective(800px) rotateY(${Math.sin(t * 1.2) * 10}deg) rotateX(${Math.cos(t * 1.0) * 6}deg)`,
}));
ready("flip3DLayer", ({ progress: p }) => ({
  transform: `perspective(800px) rotateY(${p * 360}deg)`,
}));

// --- Camera (CSS analogs of cinematic moves) ---
ready("dollyInOut", ({ progress: p }) => ({ transform: `scale(${1 + Math.sin(p * Math.PI) * 0.4})` }));
ready("truck", ({ progress: p }) => ({ transform: `scale(1.2) translateX(${(0.5 - p) * 30}%)` }));
ready("pedestal", ({ progress: p }) => ({ transform: `scale(1.2) translateY(${(0.5 - p) * 22}%)` }));
ready("panCam", ({ progress: p }) => ({
  transform: `perspective(1200px) rotateY(${(0.5 - p) * 16}deg) scale(1.15)`,
}));
ready("tiltCam", ({ progress: p }) => ({
  transform: `perspective(1200px) rotateX(${(p - 0.5) * 14}deg) scale(1.15)`,
}));
ready("zoomLens", ({ progress: p }) => ({ transform: `scale(${1 + p * 0.6})` }));
ready("rackFocus", ({ progress: p }) => ({ filter: `blur(${(1 - smooth(clamp(p * 1.3))) * 10}px)` }));
ready("dollyZoom", ({ progress: p }) => ({
  transform: `perspective(${lerp(1200, 320, p)}px) scale(${1 + p * 0.25})`,
}));
ready("whipPanCam", ({ progress: p }) => ({
  transform: `translateX(${(0.5 - p) * 120}%)`,
  filter: `blur(${Math.sin(p * Math.PI) * 8}px)`,
}));
ready("craneJib", ({ progress: p }) => ({
  transform: `scale(${1.1 + p * 0.2}) translateY(${(0.5 - p) * 20}%)`,
}));
ready("arcShot", ({ progress: p }) => ({
  transform: `perspective(1000px) rotateY(${(0.5 - p) * 24}deg) scale(1.2)`,
}));
ready("handheld", ({ t }) => {
  const nx = (Math.sin(t * 7) + Math.sin(t * 13) * 0.5) * 5;
  const ny = (Math.cos(t * 9) + Math.sin(t * 5) * 0.5) * 4;
  return { transform: `translate(${nx}px, ${ny}px) rotate(${Math.sin(t * 4) * 1.2}deg)` };
});
ready(
  "dutchAngle",
  ({ params }) => ({ transform: `rotate(${params.angle ?? 8}deg) scale(1.1)` }),
  { angle: 8 },
);
ready("steadicamFollow", ({ t }) => ({
  transform: `translate(${Math.sin(t * 0.6) * 20}px, ${Math.cos(t * 0.5) * 10}px) scale(1.1)`,
}));

// --- Loop / Idle ---
ready("breathingLoop", ({ t }) => ({ transform: `scale(${1.04 + Math.sin(t * 1.6) * 0.035})` }));
ready("floatLoop", ({ t }) => ({ transform: `translateY(${Math.sin(t * 1.6) * 10}px)` }));
ready("swayLoop", ({ t }) => ({
  transform: `rotate(${Math.sin(t * 1.2) * 5}deg)`,
  transformOrigin: "bottom center",
}));
ready("shimmerLoop", ({ t }) => ({
  backgroundImage: "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.5) 50%, transparent 70%)",
  backgroundSize: "220% 100%",
  backgroundPosition: `${((t * 0.4) % 1) * 240 - 60}% 0`,
}));
ready("pulseGlow", ({ t }) => ({
  filter: `drop-shadow(0 0 ${8 + Math.sin(t * 2) * 8}px rgba(255,210,150,0.8))`,
}));
ready("grainLoop", ({ frame }) => ({
  backgroundImage: GRAIN_URI,
  opacity: 0.07,
  backgroundPosition: `${seededRandom(frame) * 100}% ${seededRandom(frame + 9) * 100}%`,
  mixBlendMode: "overlay",
}));

// --- Beat-reactive (frame-derived beat; no audio analysis this stage) ---
ready("beatPulse", ({ beat }) => ({ transform: `scale(${1.05 + beat * 0.22})` }));
ready("beatFlash", ({ beat }) => ({ backgroundColor: "#fff", opacity: beat * 0.6 }));
ready("beatShake", ({ beat, t }) => ({
  transform: `translate(${Math.sin(t * 60) * beat * 8}px, ${Math.cos(t * 55) * beat * 6}px)`,
}));
ready("beatColorCycle", ({ beat }) => ({ filter: `hue-rotate(${beat * 120}deg) saturate(${1 + beat})` }));
ready("beatZoomCut", ({ beat }) => ({ transform: `scale(${1 + (beat > 0.6 ? 0.15 : 0)})` }));
// audioBars / waveform are visual-meter stand-ins driven by the BPM clock until
// real @remotion/media-utils audio analysis is wired (Stage 3).
ready("audioBars", ({ beat }) => ({ transform: `scaleY(${0.3 + beat * 0.7})`, transformOrigin: "bottom" }));
ready("waveform", ({ t, beat }) => ({
  transform: `scaleY(${0.5 + Math.abs(Math.sin(t * 6)) * 0.4 + beat * 0.2})`,
  transformOrigin: "center",
}));

// --- Merge the Depth/2.5D and Pixel-art families (all 'ready') ---
for (const [id, style] of Object.entries(depthStyles)) ready(id, style);
for (const [id, style] of Object.entries(pixelStyles)) ready(id, style);

export { motions };
