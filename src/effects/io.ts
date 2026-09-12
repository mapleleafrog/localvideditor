// Element-scoped enter / exit transitions (fade / slide / zoom / pop / rotate / spin / blur /
// flash / wipe / iris / typewriter), shared by overlays (components/Layer.tsx) and wall items
// (timeline/WallClip.tsx) — extracted verbatim from Layer.tsx so the two hosts provably compose
// the same ramp instead of drifting apart (the same reason effects/stack.ts exists). Pure: no
// React, no frame reads; the host owns the clock and the element the terms land on.
import { ease, type EasingName } from "./easing";
import { clamp, lerp, quantize } from "./helpers";

export type TransitionKind =
  | "none"
  | "fade"
  | "slideLeft"
  | "slideRight"
  | "slideUp"
  | "slideDown"
  | "zoom"
  | "pop"
  | "rotateIn"
  | "spin"
  | "blurIn"
  | "flash"
  | "wipe"
  | "iris"
  | "typewriter";

export const TRANSITION_KINDS: readonly TransitionKind[] = [
  "none", "fade", "slideLeft", "slideRight", "slideUp", "slideDown", "zoom", "pop", "rotateIn", "spin", "blurIn", "flash", "wipe", "iris", "typewriter",
];

export const SLIDE_FRAC = 0.2; // slide distance as a fraction of the host's reference size
// ease-out-back: overshoots slightly past 1 then settles — the "pop".
export const backOut = (p: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
};

export type IoPart = { opacity?: number; tx?: number; ty?: number; scale?: number; rotate?: number; blur?: number; brightness?: number; clip?: string };

/** Element-scoped transition contribution at progress p (1 = fully present, 0 = hidden).
 *  `w`/`h` are the reference size for slides: the FRAME for an overlay, the ITEM BOX for a wall item. */
export const ioPart = (k: TransitionKind, p: number, w: number, h: number): IoPart => {
  const inv = 1 - p;
  switch (k) {
    case "fade": return { opacity: p };
    case "slideLeft": return { opacity: p, tx: -inv * w * SLIDE_FRAC };
    case "slideRight": return { opacity: p, tx: inv * w * SLIDE_FRAC };
    case "slideUp": return { opacity: p, ty: -inv * h * SLIDE_FRAC };
    case "slideDown": return { opacity: p, ty: inv * h * SLIDE_FRAC };
    case "zoom": return { opacity: p, scale: lerp(0.7, 1, p) };
    case "pop": return { opacity: clamp(p * 1.5), scale: backOut(p) };
    case "rotateIn": return { opacity: p, rotate: inv * -90, scale: lerp(0.6, 1, p) };
    case "spin": return { opacity: p, rotate: inv * 360, scale: lerp(0.3, 1, p) };
    case "blurIn": return { opacity: p, blur: inv * 16 };
    case "flash": return { opacity: p, brightness: lerp(3, 1, p) };
    case "wipe": return { clip: `inset(0 ${inv * 100}% 0 0)` };
    case "iris": return { clip: `circle(${lerp(0, 150, p)}% at 50% 50%)` };
    case "typewriter": return { clip: `inset(0 ${(1 - quantize(p, 14)) * 100}% 0 0)` };
    default: return {};
  }
};

export interface IoInput {
  enter: TransitionKind;
  exit: TransitionKind;
  /** Local frame (0 = the element's first visible frame). */
  f: number;
  /** Visible length in frames; undefined / non-finite = never exits (no exit ramp). */
  durationInFrames: number | undefined;
  enterFrames: number;
  exitFrames: number;
  enterEasing?: EasingName;
  exitEasing?: EasingName;
  w: number;
  h: number;
}

export interface Io {
  opacity: number;
  tx: number;
  ty: number;
  scale: number;
  rotate: number;
  blur: number;
  brightness: number;
  clip: string | undefined;
}

export const IO_IDENTITY: Io = { opacity: 1, tx: 0, ty: 0, scale: 1, rotate: 0, blur: 0, brightness: 1, clip: undefined };

/** The enter and exit ramps, combined the way Layer.tsx always has: opacity / scale / brightness
 *  multiply, tx / ty / rotate / blur add, and only ONE clip-path applies (the exit's while it is
 *  mid-flight, else the enter's). */
export const combineIo = (i: IoInput): Io => {
  const hasExit = i.exit !== "none" && i.durationInFrames != null && Number.isFinite(i.durationInFrames);
  const eP = i.enter !== "none" ? ioPart(i.enter, ease(i.enterEasing, clamp(i.f / Math.max(1, i.enterFrames))), i.w, i.h) : {};
  const xP = hasExit
    ? ioPart(i.exit, ease(i.exitEasing, clamp(((i.durationInFrames as number) - i.f) / Math.max(1, i.exitFrames))), i.w, i.h)
    : {};
  const exitActive = hasExit && (i.durationInFrames as number) - i.f < i.exitFrames;
  return {
    opacity: (eP.opacity ?? 1) * (xP.opacity ?? 1),
    tx: (eP.tx ?? 0) + (xP.tx ?? 0),
    ty: (eP.ty ?? 0) + (xP.ty ?? 0),
    scale: (eP.scale ?? 1) * (xP.scale ?? 1),
    rotate: (eP.rotate ?? 0) + (xP.rotate ?? 0),
    blur: (eP.blur ?? 0) + (xP.blur ?? 0),
    brightness: (eP.brightness ?? 1) * (xP.brightness ?? 1),
    clip: exitActive ? xP.clip : eP.clip ?? xP.clip,
  };
};
