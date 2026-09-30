import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { depthShadow, stackMotions, type EasingName, type MotionParam } from "../effects";
import { REEL_TUNED_KINDS, combineIo, type TransitionKind } from "../effects/io";
import { beatKick } from "../effects/helpers";

/** Per-effect settings (index-aligned with the motion ids). Declared in `effects/stack.ts`
 *  alongside the stacker that reads it; re-exported here so existing importers are unchanged. */
export type { MotionParam };

/** Enter/exit kinds + the ramp maths live in effects/io.ts (shared with wall items); the type is
 *  re-exported so existing importers are unchanged. */
export type { TransitionKind };

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
  /** Text length, so a typewriter enter/exit steps per character (text overlays). */
  ioChars?: number;
  /** Easing curves for the enter / exit ramps (default linear). */
  enterEasing?: EasingName;
  exitEasing?: EasingName;
  /** Per-layer fallback loop/strength (applied to every effect lacking a per-effect override). */
  loop?: boolean;
  /** Effect strength multiplier (1 = normal; 0 = off; >1 = exaggerated). */
  strength?: number;
  /** Per-effect settings, index-aligned with `motionIds` (loop / strength / easing each). */
  motionParams?: MotionParam[];
  /** Depth 0=far .. 1=near. Adds a base drop-shadow; read by depth motions via ctx.z. */
  z?: number;
  /** When true, prepend translate(-50%,-50%) so the layer centers on its left/top anchor. */
  centered?: boolean;
  /** Base scale folded into the transform (before motion transforms). */
  scale?: number;
  /** Base rotation in degrees folded into the transform. */
  rotation?: number;
  /** Mirror the CONTENT (children) horizontally / vertically, in place. Applied to an inner wrapper
   *  with transformOrigin "center center" — decoupled from the main motion transform chain so it
   *  never interacts with a motion's own transform-origin (e.g. bottom-anchored squashStretch). */
  flipX?: boolean;
  flipY?: boolean;
  params?: Record<string, number>;
  /** Shine sweep (the `shineSweep` motion emits a `--shine` gradient): the band is drawn over the
   *  children on an overlay-blended layer masked with this CSS image (an image layer's own src, so
   *  the band follows its alpha) … */
  shineMask?: string;
  /** … or drawn by the host (text: the same glyphs with the band clipped to them). */
  renderShine?: (background: string) => React.ReactNode;
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
  ioChars,
  enterEasing,
  exitEasing,
  loop = false,
  strength = 1,
  motionParams,
  z,
  centered = false,
  scale,
  rotation,
  flipX = false,
  flipY = false,
  params = {},
  shineMask,
  renderShine,
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
  const beat = beatKick(t, bpm, 6, beatOffsetInFrames / fps);
  const zz = z ?? 0;

  const ids = motionIds && motionIds.length ? motionIds : motionId ? [motionId] : [];
  // Per-effect: each motion gets its own loop (progress sawtooth), easing (progress curve), and
  // strength (magnitude). A per-effect value falls back to the layer-level loop/strength.
  // The loop itself lives in effects/stack.ts so wall items compose through the SAME code path.
  const { transform: motionTransform, opacity: motionOpacity, filter: motionFilter, ...motionRest } = stackMotions(
    ids,
    motionParams,
    { frame, fps, t, beat, z: zz, params, width, height },
    f,
    win,
    loop,
    strength,
  );

  // --- enter / exit transitions (element-scoped: fade / slide / zoom / pop / rotate / spin / blur / flash / wipe / iris / typewriter) ---
  // The ramp maths (and the one-clip-path rule) live in effects/io.ts, shared with wall items.
  const io = combineIo({
    enter,
    exit,
    f,
    durationInFrames: durationInFrames ?? undefined,
    enterFrames: enterDurationInFrames,
    exitFrames: exitDurationInFrames,
    // Unset: linear for the reel-tuned kinds (their curve is the easing), easeInOut otherwise.
    enterEasing: enterEasing ?? (REEL_TUNED_KINDS.has(enter) ? "linear" : "easeInOut"),
    exitEasing: exitEasing ?? (REEL_TUNED_KINDS.has(exit) ? "linear" : "easeInOut"),
    w: width,
    h: height,
    chars: ioChars,
  });
  const ioOpacity = io.opacity;
  const ioTx = io.tx;
  const ioTy = io.ty;
  const ioScale = io.scale;
  const ioRotate = io.rotate;
  const ioBlur = io.blur;
  const ioBrightness = io.brightness;
  const ioClip = io.clip;

  // fx full-frame layers render no children — their motion paints on THIS outer div (backgroundImage
  // etc.), so an inner content-wrapper flip (below) would mirror an empty div = no-op. For those we
  // fold the flip into the outer transform instead. This is safe for fx: atmospheric fx motions
  // (weddingPetals/bokehLights/godRays/lensFlare/lightLeakWarm/sakuraPetals/sparkleField) are
  // backgroundImage-based with the default center transform-origin — none set a bottom/top origin
  // like the content-overlay motions (squashStretch/pendulum) that the inner-wrapper path guards.
  const hasChildren = children != null && children !== false;
  const flipStr = `${flipX ? "scaleX(-1) " : ""}${flipY ? "scaleY(-1)" : ""}`.trim();

  const baseParts: string[] = [];
  if (centered) baseParts.push("translate(-50%, -50%)");
  if (ioTx || ioTy) baseParts.push(`translate(${ioTx}px, ${ioTy}px)`);
  if (ioScale !== 1) baseParts.push(`scale(${ioScale})`);
  if (ioRotate) baseParts.push(`rotate(${ioRotate}deg)`);
  if (scale != null && scale !== 1) baseParts.push(`scale(${scale})`);
  if (rotation) baseParts.push(`rotate(${rotation}deg)`);
  if (motionTransform) baseParts.push(String(motionTransform));
  if (flipStr && !hasChildren) baseParts.push(flipStr); // fx: flip the full-frame background in place
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

  // Flip on content overlays (text/image/video) is applied to an INNER content wrapper, never the
  // outer motion transform chain above — some motions (squashStretch/pendulum/eightBitHop) set
  // transformOrigin: bottom/top center via motionRest, and a flip on that chain would mirror about
  // that origin and displace the layer by a full height/width. transformOrigin: "center center"
  // here keeps it always mirroring in place. (fx layers have no children and flip via the outer
  // transform instead — see hasChildren/flipStr above.)
  // Shine: only while a `shineSweep` pass is live does the DOM gain a wrapper + band, so every other
  // layer renders exactly as before.
  const { "--shine": shineBg, ...motionOwn } = motionRest as Record<string, unknown>;
  const shine =
    typeof shineBg === "string" && hasChildren
      ? renderShine
        ? renderShine(shineBg)
        : (
            <div
              style={{
                position: "absolute",
                inset: 0,
                backgroundImage: shineBg,
                mixBlendMode: "overlay",
                pointerEvents: "none",
                ...(shineMask
                  ? { maskImage: shineMask, WebkitMaskImage: shineMask, maskSize: "100% 100%", WebkitMaskSize: "100% 100%", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat" }
                  : {}),
              }}
            />
          )
      : null;
  const body = shine ? (
    <div style={{ position: "relative" }}>
      {children}
      {shine}
    </div>
  ) : (
    children
  );
  const content =
    flipStr && hasChildren ? (
      <div style={{ display: "inline-block", transform: flipStr, transformOrigin: "center center" }}>
        {body}
      </div>
    ) : (
      body
    );

  return (
    <div
      {...(dataIndex != null ? { "data-ovl-index": dataIndex } : {})}
      style={{
        position: "absolute",
        willChange: "transform, opacity",
        ...styleRest,
        ...(motionOwn as React.CSSProperties),
        opacity: finalOpacity,
        ...(filter ? { filter } : {}),
        ...(ioClip ? { clipPath: ioClip } : {}),
        ...(transform ? { transform } : {}),
      }}
    >
      {content}
    </div>
  );
};
