import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { getMotion, depthShadow, composeStyles } from "../effects";
import { beatKick, clamp } from "../effects/helpers";

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
  const { fps } = useVideoConfig();

  // Mount only within [from, from + durationInFrames).
  if (frame < from) return null;
  if (durationInFrames != null && frame >= from + durationInFrames) return null;

  const f = frame - from;
  const t = frame / fps;
  const progress = windowInFrames ? clamp(f / windowInFrames) : clamp(f / fps);
  const beat = beatKick(t, bpm, 6);
  const zz = z ?? 0;

  const ids = motionIds && motionIds.length ? motionIds : motionId ? [motionId] : [];
  const ctx = { progress, frame, fps, t, beat, z: zz, params };
  const { transform: motionTransform, ...motionRest } = composeStyles(ids.map((id) => getMotion(id)(ctx)));

  const baseParts: string[] = [];
  if (centered) baseParts.push("translate(-50%, -50%)");
  if (scale != null && scale !== 1) baseParts.push(`scale(${scale})`);
  if (rotation) baseParts.push(`rotate(${rotation}deg)`);
  if (motionTransform) baseParts.push(String(motionTransform));
  const transform = baseParts.length ? baseParts.join(" ") : undefined;

  return (
    <div
      {...(dataIndex != null ? { "data-ovl-index": dataIndex } : {})}
      style={{
        position: "absolute",
        willChange: "transform, opacity",
        ...(z != null ? { filter: depthShadow(zz) } : {}),
        ...style,
        ...motionRest,
        ...(transform ? { transform } : {}),
      }}
    >
      {children}
    </div>
  );
};
