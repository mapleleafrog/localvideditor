import type { CSSProperties } from "react";
import type { MotionCtx } from "./types";
import { clamp, lerp } from "./helpers";

// ---------------------------------------------------------------------------
// Depth / 2.5D toolkit.
//
// The wedding-video vision: 2D layers that read as having depth via shadows,
// bevel and parallax — NOT real 3D. `z` is a normalized depth: 0 = far (small,
// tight shadow), 1 = near (large, soft, lifted shadow). `Layer` applies
// `depthShadow(z)` as a base filter for any layer given a `z` prop, and the
// motions below animate depth explicitly.
// ---------------------------------------------------------------------------

/** A drop-shadow string sized by depth. Uses `filter: drop-shadow` so it hugs
 *  sprite alpha rather than the bounding box. */
export const depthShadow = (z: number): string => {
  const zz = clamp(z);
  const y = lerp(1, 28, zz);
  const blur = lerp(2, 38, zz);
  const op = lerp(0.18, 0.5, zz);
  return `drop-shadow(0px ${y.toFixed(1)}px ${blur.toFixed(1)}px rgba(0,0,0,${op.toFixed(2)}))`;
};

/** Scale a near layer up, a far layer down — pairs with depthShadow. */
export const depthScale = (z: number): number => lerp(0.82, 1.16, clamp(z));

/** Beveled / embossed edge for panels and cards (inset highlight + core shadow
 *  + outer cast shadow). `size` is the bevel thickness in px. */
export const bevel = (size = 3): CSSProperties => ({
  boxShadow:
    `inset ${size}px ${size}px 0 rgba(255,255,255,0.45), ` +
    `inset ${-size}px ${-size}px 0 rgba(0,0,0,0.35), ` +
    `0 ${size * 2}px ${size * 3}px rgba(0,0,0,0.35)`,
});

export const depthStyles: Record<string, (ctx: MotionCtx) => CSSProperties> = {
  // Lift off the background: scale up slightly, rise, and grow the shadow.
  dropShadowLift: ({ progress: p }) => ({
    transform: `translateY(${-p * 14}px) scale(${lerp(1, 1.08, p)})`,
    filter: depthShadow(lerp(0.1, 0.9, p)),
  }),

  // Static beveled card whose top-light highlight drifts subtly over time.
  bevelEmboss: ({ t }) => ({
    ...bevel(3),
    transform: `translateY(${Math.sin(t * 1.2) * 2}px)`,
  }),

  // Foreground parallax: near layers (high params.z) shift more across the pan.
  parallaxDepth: ({ progress: p, params }) => {
    const z = params.z ?? 0.5;
    return {
      transform: `translateX(${(0.5 - p) * 50 * z}px) scale(${depthScale(z)})`,
      filter: depthShadow(z),
    };
  },

  // Float bob with a ground shadow: as the sprite rises, its shadow drops,
  // blurs and fades — the classic "ground contact" depth cue.
  floatShadow: ({ t }) => {
    const bob = Math.sin(t * 1.6);
    const up = Math.max(0, bob);
    return {
      transform: `translateY(${-bob * 10}px)`,
      filter: `drop-shadow(0px ${12 + up * 16}px ${6 + up * 12}px rgba(0,0,0,${(0.45 - up * 0.2).toFixed(2)}))`,
    };
  },

  // Perspective tilt with the cast shadow following the tilt direction.
  tiltShadow: ({ t }) => {
    const ry = Math.sin(t * 1.2) * 12;
    const rx = Math.cos(t * 1.0) * 7;
    const sx = Math.sin(t * 1.2) * 18;
    return {
      transform: `perspective(700px) rotateY(${ry}deg) rotateX(${rx}deg)`,
      filter: `drop-shadow(${-sx}px 14px 14px rgba(0,0,0,0.4))`,
    };
  },

  // Pop toward the camera on each beat: scale + rise + shadow swell.
  popLayer: ({ beat: k }) => ({
    transform: `scale(${1 + k * 0.18}) translateY(${-k * 10}px)`,
    filter: depthShadow(0.3 + k * 0.6),
  }),
};
