import type { CSSProperties } from "react";
import type { MotionCtx } from "./types";
import { MOTION_FORMULAS } from "./portable";

// Advanced-retro / FX motion formulas (sprite, backgrounds, overlay) now live in
// `portable.ts` (single source). This file keeps the catalog-wiring record.
const RETRO_IDS = [
  "neonGlow",
  "chromaPulse",
  "vhsJitter",
  "glitchSlice",
  "hologram",
  "echoTrail",
  "crtTurnOn",
  "flameFlicker",
  "rainbowCycle",
  "powerUp",
  "arcadeHop",
  "wobbleVHS",
  "synthGrid",
  "starfield",
  "crtRoom",
  "vignette",
  // pack: more cyber motions + backdrops
  "rgbSplitHeavy",
  "dataGlitchBlocks",
  "neonBorderPulse",
  "vaporTint",
  "scanlineFlicker",
  "synthSunset",
  "gridRunner",
] as const;

export const retroStyles: Record<string, (ctx: MotionCtx) => CSSProperties> = Object.fromEntries(
  RETRO_IDS.map((id) => [id, MOTION_FORMULAS[id]]),
) as unknown as Record<string, (ctx: MotionCtx) => CSSProperties>;
