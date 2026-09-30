// Element-scoped enter / exit transitions (fade / slide / zoom / pop / rotate / spin / blur /
// flash / wipe / iris / typewriter), shared by overlays (components/Layer.tsx) and wall items
// (timeline/WallClip.tsx) — extracted verbatim from Layer.tsx so the two hosts provably compose
// the same ramp instead of drifting apart (the same reason effects/stack.ts exists). Pure: no
// React, no frame reads; the host owns the clock and the element the terms land on.
import { ease, type EasingName } from "./easing";
import { backOutStrong, clamp, easeOutCubic, lerp } from "./helpers";

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

export const SLIDE_FRAC = 0.2; // kept for importers; the retuned slides below use the reel's distances
// ease-out-back: overshoots slightly past 1 then settles (the classic c1 = 1.70158 curve).
export const backOut = (p: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
};

// Reel-tuned entrances (promo-reel reel_template.html, Sep 2026). The reel runs each entrance over
// 0.45 s on a linear clock; the shapes below are its curves on the ramp's own 0..1, so the ramp
// length (enter/exit frames) still sets the duration:
//   pop   — opacity in over the first 18 %, scale 0.3 → 1 on the strong back-overshoot (c1 = 2.2)
//   fade  — ease-out cubic
//   slide — opacity in over the first 22–27 %, travel on the strong back-overshoot: 83 % of the
//           reference WIDTH sideways (the reel's 900 of 1080 px — it arrives from off-frame) or
//           4.7 % of the reference HEIGHT vertically (90 of 1920 px — a lift, not a fly-in)
//   zoom  — from 1.8× down to 1 on ease-out cubic, fading in on the same curve
//   typewriter — reveals whole characters (ceil(p · n)) when the host passes the text length
// Directions keep their meaning here: slideLeft / slideUp arrive FROM the left / above.
/** The kinds that carry the reel's own curve. An UNSET easing on these means linear (the curve
 *  already is the easing); on every other kind the host's default easing still applies. */
export const REEL_TUNED_KINDS: ReadonlySet<TransitionKind> = new Set(["fade", "slideLeft", "slideRight", "slideUp", "slideDown", "zoom", "pop", "typewriter"]);
const SIDE_FRAC = 0.833;
const LIFT_FRAC = 0.047;

export type IoPart = { opacity?: number; tx?: number; ty?: number; scale?: number; rotate?: number; blur?: number; brightness?: number; clip?: string };

/** Element-scoped transition contribution at progress p (1 = fully present, 0 = hidden).
 *  `w`/`h` are the reference size for slides: the FRAME for an overlay, the ITEM BOX for a wall item.
 *  `chars` = the text's character count, when the host has one (typewriter steps per character). */
export const ioPart = (k: TransitionKind, p: number, w: number, h: number, chars?: number): IoPart => {
  const inv = 1 - p;
  const back = 1 - backOutStrong(p); // 1 → 0 with a dip below 0 = the overshoot
  switch (k) {
    case "fade": return { opacity: easeOutCubic(p) };
    case "slideLeft": return { opacity: clamp(p / 0.222), tx: -back * w * SIDE_FRAC };
    case "slideRight": return { opacity: clamp(p / 0.222), tx: back * w * SIDE_FRAC };
    case "slideUp": return { opacity: clamp(p / 0.267), ty: -back * h * LIFT_FRAC };
    case "slideDown": return { opacity: clamp(p / 0.267), ty: back * h * LIFT_FRAC };
    case "zoom": return { opacity: easeOutCubic(p), scale: 1.8 - 0.8 * easeOutCubic(p) };
    case "pop": return { opacity: clamp(p / 0.178), scale: 0.3 + 0.7 * backOutStrong(p) };
    case "rotateIn": return { opacity: p, rotate: inv * -90, scale: lerp(0.6, 1, p) };
    case "spin": return { opacity: p, rotate: inv * 360, scale: lerp(0.3, 1, p) };
    case "blurIn": return { opacity: p, blur: inv * 16 };
    case "flash": return { opacity: p, brightness: lerp(3, 1, p) };
    case "wipe": return { clip: `inset(0 ${inv * 100}% 0 0)` };
    case "iris": return { clip: `circle(${lerp(0, 150, p)}% at 50% 50%)` };
    case "typewriter": {
      const n = chars && chars > 0 ? chars : 14;
      return { clip: `inset(0 ${(1 - Math.ceil(clamp(p) * n) / n) * 100}% 0 0)` };
    }
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
  /** Text length for a per-character typewriter (text overlays / wall text items). */
  chars?: number;
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
  const eP = i.enter !== "none" ? ioPart(i.enter, ease(i.enterEasing, clamp(i.f / Math.max(1, i.enterFrames))), i.w, i.h, i.chars) : {};
  const xP = hasExit
    ? ioPart(i.exit, ease(i.exitEasing, clamp(((i.durationInFrames as number) - i.f) / Math.max(1, i.exitFrames))), i.w, i.h, i.chars)
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
