import type { CSSProperties } from "react";
import type { MotionCtx } from "./types";
import { MOTION_FORMULAS } from "./portable";

// Depth math (`depthShadow`/`depthScale`/`bevel`) and the depth motion formulas
// now live in `portable.ts` (single source, shared with the portal bundle).
// Re-export the math so the effects barrel keeps exposing it, and build the
// depthStyles record (consumed by motions.ts' merge loop) from the shared formulas.
export { depthShadow, depthScale, bevel } from "./portable";

const DEPTH_IDS = ["dropShadowLift", "bevelEmboss", "parallaxDepth", "floatShadow", "tiltShadow", "popLayer"] as const;

export const depthStyles: Record<string, (ctx: MotionCtx) => CSSProperties> = Object.fromEntries(
  DEPTH_IDS.map((id) => [id, MOTION_FORMULAS[id]]),
) as unknown as Record<string, (ctx: MotionCtx) => CSSProperties>;
