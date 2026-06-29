import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { getMotion, depthShadow, composeStyles } from "../effects";
import { beatKick, clamp, smooth, lerp } from "../effects/helpers";

export type TransitionKind = "none" | "fade" | "slideLeft" | "slideRight" | "slideUp" | "slideDown" | "zoom";
const SLIDE_FRAC = 0.2; // slide distance as a fraction of the frame
const dirSign = (k: TransitionKind): { sx: number; sy: number } => ({
  sx: k === "slideLeft" ? -1 : k === "slideRight" ? 1 : 0,
  sy: k === "slideUp" ? -1 : k === "slideDown" ? 1 : 0,
});

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
  const progress = windowInFrames ? clamp(f / windowInFrames) : clamp(f / fps);
  const beat = beatKick(t, bpm, 6, beatOffsetInFrames / fps);
  const zz = z ?? 0;

  const ids = motionIds && motionIds.length ? motionIds : motionId ? [motionId] : [];
  const ctx = { progress, frame, fps, t, beat, z: zz, params };
  const { transform: motionTransform, opacity: motionOpacity, ...motionRest } = composeStyles(ids.map((id) => getMotion(id)(ctx)));

  // --- enter / exit transition (fade / slide / zoom in & out) ---
  let ioOpacity = 1;
  let ioTx = 0;
  let ioTy = 0;
  let ioScale = 1;
  if (enter !== "none") {
    const a = smooth(clamp(f / Math.max(1, enterDurationInFrames)));
    ioOpacity *= a;
    const d = dirSign(enter);
    ioTx += d.sx * (1 - a) * width * SLIDE_FRAC;
    ioTy += d.sy * (1 - a) * height * SLIDE_FRAC;
    if (enter === "zoom") ioScale *= lerp(0.7, 1, a);
  }
  if (exit !== "none" && durationInFrames != null) {
    const b = smooth(clamp((durationInFrames - f) / Math.max(1, exitDurationInFrames)));
    ioOpacity *= b;
    const d = dirSign(exit);
    ioTx += d.sx * (1 - b) * width * SLIDE_FRAC;
    ioTy += d.sy * (1 - b) * height * SLIDE_FRAC;
    if (exit === "zoom") ioScale *= lerp(0.7, 1, b);
  }

  const baseParts: string[] = [];
  if (centered) baseParts.push("translate(-50%, -50%)");
  if (ioTx || ioTy) baseParts.push(`translate(${ioTx}px, ${ioTy}px)`);
  if (ioScale !== 1) baseParts.push(`scale(${ioScale})`);
  if (scale != null && scale !== 1) baseParts.push(`scale(${scale})`);
  if (rotation) baseParts.push(`rotate(${rotation}deg)`);
  if (motionTransform) baseParts.push(String(motionTransform));
  const transform = baseParts.length ? baseParts.join(" ") : undefined;

  // Combine every opacity source (base style · motions · enter/exit) into one value.
  const { opacity: styleOpacity, ...styleRest } = style ?? {};
  const finalOpacity = Number(styleOpacity ?? 1) * Number(motionOpacity ?? 1) * ioOpacity;

  return (
    <div
      {...(dataIndex != null ? { "data-ovl-index": dataIndex } : {})}
      style={{
        position: "absolute",
        willChange: "transform, opacity",
        ...(z != null ? { filter: depthShadow(zz) } : {}),
        ...styleRest,
        ...motionRest,
        opacity: finalOpacity,
        ...(transform ? { transform } : {}),
      }}
    >
      {children}
    </div>
  );
};
