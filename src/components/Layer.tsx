import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { getMotion, depthShadow, composeStyles, scaleStrength } from "../effects";
import { beatKick, clamp, smooth, lerp, quantize } from "../effects/helpers";

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

const SLIDE_FRAC = 0.2; // slide distance as a fraction of the frame
// ease-out-back: overshoots slightly past 1 then settles — the "pop".
const backOut = (p: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
};

type IoPart = { opacity?: number; tx?: number; ty?: number; scale?: number; rotate?: number; blur?: number; brightness?: number; clip?: string };
/** Element-scoped transition contribution at progress p (1 = fully present, 0 = hidden). */
const ioPart = (k: TransitionKind, p: number, w: number, h: number): IoPart => {
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

interface LayerProps {
  /** Single motion id (back-compat). Ignored if `motionIds` is given. */
  motionId?: string;
  /** Stack of motion ids — composed (transforms/filters concatenated, opacity multiplied). */
  motionIds?: string[];
  /** Mount frame (inclusive). */
  from?: number;
  /** Frames the layer stays on screen; unmounts after. Prevents duplicate overlap. */
  durationInFrames?: number;
  /** Progress normalization window for entrance-style motions (defaults to 1s). */
  windowInFrames?: number;
  bpm?: number;
  /** Shift the beat grid (in frames) so the kick aligns to a real song's downbeat. */
  beatOffsetInFrames?: number;
  /** Enter / exit transition (fade / slide / zoom) + their ramp lengths in frames. */
  enter?: TransitionKind;
  exit?: TransitionKind;
  enterDurationInFrames?: number;
  exitDurationInFrames?: number;
  /** Loop the motion's progress over the window instead of running once. */
  loop?: boolean;
  /** Effect strength multiplier (1 = normal; 0 = off; >1 = exaggerated). */
  strength?: number;
  /** Depth 0=far .. 1=near. Adds a base drop-shadow; read by depth motions via ctx.z. */
  z?: number;
  /** When true, prepend translate(-50%,-50%) so the layer centers on its left/top anchor. */
  centered?: boolean;
  /** Base scale folded into the transform (before motion transforms). */
  scale?: number;
  /** Base rotation in degrees folded into the transform. */
  rotation?: number;
  params?: Record<string, number>;
  /** Editor-only: stamps `data-ovl-index` so the canvas editor can find/measure this node. Ignored by render. */
  dataIndex?: number;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

/**
 * The single frame->ctx boundary. Reads the frame, computes progress/t/beat/z,
 * mount-gates the window, composes one or many motions, and applies the CSS.
 * `t` is ABSOLUTE composition seconds so loops + beat stay locked to the song
 * grid — do NOT wrap beat-reactive layers in a frame-rebasing <Sequence>.
 */
export const Layer: React.FC<LayerProps> = ({
  motionId,
  motionIds,
  from = 0,
  durationInFrames,
  windowInFrames,
  bpm = 120,
  beatOffsetInFrames = 0,
  enter = "none",
  exit = "none",
  enterDurationInFrames = 15,
  exitDurationInFrames = 15,
  loop = false,
  strength = 1,
  z,
  centered = false,
  scale,
  rotation,
  params = {},
  dataIndex,
  style,
  children,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // Mount only within [from, from + durationInFrames).
  if (frame < from) return null;
  if (durationInFrames != null && frame >= from + durationInFrames) return null;

  const f = frame - from;
  const t = frame / fps;
  const win = windowInFrames || fps;
  const progress = loop ? f / win - Math.floor(f / win) : clamp(f / win);
  const beat = beatKick(t, bpm, 6, beatOffsetInFrames / fps);
  const zz = z ?? 0;

  const ids = motionIds && motionIds.length ? motionIds : motionId ? [motionId] : [];
  const ctx = { progress, frame, fps, t, beat, z: zz, params };
  const { transform: motionTransform, opacity: motionOpacity, filter: motionFilter, ...motionRest } = scaleStrength(
    composeStyles(ids.map((id) => getMotion(id)(ctx))),
    strength,
  );

  // --- enter / exit transitions (element-scoped: fade / slide / zoom / pop / rotate / spin / blur / flash / wipe / iris / typewriter) ---
  const eP = enter !== "none" ? ioPart(enter, smooth(clamp(f / Math.max(1, enterDurationInFrames))), width, height) : {};
  const xP =
    exit !== "none" && durationInFrames != null
      ? ioPart(exit, smooth(clamp((durationInFrames - f) / Math.max(1, exitDurationInFrames))), width, height)
      : {};
  const ioOpacity = (eP.opacity ?? 1) * (xP.opacity ?? 1);
  const ioTx = (eP.tx ?? 0) + (xP.tx ?? 0);
  const ioTy = (eP.ty ?? 0) + (xP.ty ?? 0);
  const ioScale = (eP.scale ?? 1) * (xP.scale ?? 1);
  const ioRotate = (eP.rotate ?? 0) + (xP.rotate ?? 0);
  const ioBlur = (eP.blur ?? 0) + (xP.blur ?? 0);
  const ioBrightness = (eP.brightness ?? 1) * (xP.brightness ?? 1);
  // Only one clip-path can apply — use the exit's while it's mid-flight, else the enter's.
  const exitActive = exit !== "none" && durationInFrames != null && durationInFrames - f < exitDurationInFrames;
  const ioClip = exitActive ? xP.clip : eP.clip ?? xP.clip;

  const baseParts: string[] = [];
  if (centered) baseParts.push("translate(-50%, -50%)");
  if (ioTx || ioTy) baseParts.push(`translate(${ioTx}px, ${ioTy}px)`);
  if (ioScale !== 1) baseParts.push(`scale(${ioScale})`);
  if (ioRotate) baseParts.push(`rotate(${ioRotate}deg)`);
  if (scale != null && scale !== 1) baseParts.push(`scale(${scale})`);
  if (rotation) baseParts.push(`rotate(${rotation}deg)`);
  if (motionTransform) baseParts.push(String(motionTransform));
  const transform = baseParts.length ? baseParts.join(" ") : undefined;

  // Combine every opacity source (base style · motions · enter/exit) into one value.
  const { opacity: styleOpacity, ...styleRest } = style ?? {};
  const finalOpacity = Number(styleOpacity ?? 1) * Number(motionOpacity ?? 1) * ioOpacity;

  // Combine filters (depth shadow · motion filter · enter/exit blur/brightness) — CSS allows only one.
  const filters: string[] = [];
  if (z != null) filters.push(depthShadow(zz));
  if (motionFilter) filters.push(String(motionFilter));
  if (ioBlur) filters.push(`blur(${ioBlur}px)`);
  if (ioBrightness !== 1) filters.push(`brightness(${ioBrightness})`);
  const filter = filters.length ? filters.join(" ") : undefined;

  return (
    <div
      {...(dataIndex != null ? { "data-ovl-index": dataIndex } : {})}
      style={{
        position: "absolute",
        willChange: "transform, opacity",
        ...styleRest,
        ...motionRest,
        opacity: finalOpacity,
        ...(filter ? { filter } : {}),
        ...(ioClip ? { clipPath: ioClip } : {}),
        ...(transform ? { transform } : {}),
      }}
    >
      {children}
    </div>
  );
};
