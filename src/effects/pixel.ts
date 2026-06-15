import type { CSSProperties } from "react";
import type { MotionCtx } from "./types";
import { MOTION_FORMULAS } from "./portable";

// Pixel-art motion formulas now live in `portable.ts` (single source). This file
// keeps the catalog-wiring record consumed by motions.ts' merge loop.
const PIXEL_IDS = ["pixelBob", "spriteBlink", "paletteCycle", "pixelShake", "crtScanlines", "stepWalk"] as const;

export const pixelStyles: Record<string, (ctx: MotionCtx) => CSSProperties> = Object.fromEntries(
  PIXEL_IDS.map((id) => [id, MOTION_FORMULAS[id]]),
) as unknown as Record<string, (ctx: MotionCtx) => CSSProperties>;
