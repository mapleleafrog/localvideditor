import type { CSSProperties } from "react";
import type { MotionCtx } from "./types";
import { MOTION_FORMULAS } from "./portable";

// Promo-reel pack — glow set (heroGlow / glowRays / glowBloom / shockwaveRing / sparkleBurst /
// sparkleTwinkle / impactFlash, full-frame for fx layers) + impact set (landingSquash / impactPunch
// / shineSweep, on the subject). Formula bodies live in portable.ts (single source, shared with the
// portal); this file is the catalog-wiring record consumed by motions.ts' merge loop, like mv.ts.
const REEL_IDS = [
  "heroGlow",
  "glowRays",
  "glowBloom",
  "shockwaveRing",
  "sparkleBurst",
  "sparkleTwinkle",
  "impactFlash",
  "landingSquash",
  "impactPunch",
  "shineSweep",
] as const;

export const reelStyles: Record<string, (ctx: MotionCtx) => CSSProperties> = Object.fromEntries(
  REEL_IDS.map((id) => [id, MOTION_FORMULAS[id]]),
) as unknown as Record<string, (ctx: MotionCtx) => CSSProperties>;
