// The shared motion stacker.
//
// This is the VERBATIM extraction of `Layer.tsx`'s per-effect loop (formerly Layer.tsx:152-161):
// per-effect `loop` (progress sawtooth) / `easing` (progress curve) / `strength` (magnitude), each
// falling back to the layer-level value, then scaleStrength(getMotion(id)(ctx)) and composeStyles.
//
// It exists so OVERLAYS (Layer.tsx) and WALL ITEMS (WallClip.tsx) provably compose identically instead
// of drifting apart. Argument order and every `??` fallback are exactly as they were inline — a
// transposed fallback here would silently alter every existing render.
//
// A LEAF, and actually one: `getMotion` comes from ./get-motion, NOT from ./index (which
// re-exports this file — importing back from it would be a module cycle that only works while
// nothing reads `getMotion` at module-evaluation time). Not imported by portable.ts either, so
// public/portal/effects.bundle.js stays byte-identical and `npm run check:portal` needs no
// regeneration.
import type { CSSProperties } from "react";
import { getMotion } from "./get-motion";
import { composeStyles, scaleStrength } from "./compose";
import { ease, type EasingName } from "./easing";
import { clamp } from "./helpers";
import type { MotionCtx } from "./types";

/** Per-effect settings (index-aligned with the motion ids). */
export type MotionParam = { loop?: boolean; strength?: number; easing?: EasingName };

/** Everything a motion reads EXCEPT `progress` — which stackMotions computes per effect.
 *  `params` is always present: portable.ts reads params.speed (parallaxPan), params.radius
 *  (orbit), params.angle (dutchAngle) and params.z (parallaxDepth), so omitting it is a
 *  render-killing TypeError one Effect-Browser click away. */
export type StackCtx = Omit<MotionCtx, "progress">;

/**
 * Compose a stack of registry motions into one CSS style.
 *
 * @param ids      motion ids, in application order
 * @param params   per-effect settings, index-aligned with `ids` (each field falls back below)
 * @param ctx      the frame context minus `progress`
 * @param f        LOCAL frame (frame - from) driving the progress window
 * @param win      progress window length in frames
 * @param loop     layer-level loop fallback
 * @param strength layer-level strength fallback
 */
export const stackMotions = (
  ids: string[],
  params: MotionParam[] | undefined,
  ctx: StackCtx,
  f: number,
  win: number,
  loop: boolean,
  strength: number,
): CSSProperties => {
  const perEffect = ids.map((id, i) => {
    const p = params?.[i];
    const looped = (p?.loop ?? loop) ? f / win - Math.floor(f / win) : clamp(f / win);
    const progress = ease(p?.easing ?? "linear", looped);
    return scaleStrength(
      getMotion(id)({
        progress,
        frame: ctx.frame,
        fps: ctx.fps,
        t: ctx.t,
        beat: ctx.beat,
        z: ctx.z,
        params: ctx.params,
      }),
      p?.strength ?? strength,
    );
  });
  return composeStyles(perEffect);
};
