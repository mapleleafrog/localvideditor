import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { getMotion, depthShadow } from "../effects";
import { beatKick, clamp } from "../effects/helpers";

interface LayerProps {
  motionId: string;
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
  params?: Record<string, number>;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

/**
 * The single frame->ctx boundary. Reads the frame, computes progress/t/beat/z,
 * mount-gates the window, and applies the motion's CSS. `t` is ABSOLUTE
 * composition seconds so loops + beat stay locked to the song grid — do NOT
 * wrap beat-reactive layers in a frame-rebasing <Sequence>.
 */
export const Layer: React.FC<LayerProps> = ({
  motionId,
  from = 0,
  durationInFrames,
  windowInFrames,
  bpm = 120,
  z,
  centered = false,
  params = {},
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

  const { transform: motionTransform, ...motionRest } = getMotion(motionId)({
    progress,
    frame,
    fps,
    t,
    beat,
    z: zz,
    params,
  });

  const transform = centered
    ? `translate(-50%, -50%) ${motionTransform ?? ""}`.trim()
    : motionTransform;

  return (
    <div
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
