import type { CSSProperties } from "react";
import type { MotionCtx } from "./types";
import { MOTION_FORMULAS } from "./portable";

// Wedding pack — romantic element glow/grade + full-frame atmospherics. Formula
// bodies live in `portable.ts` (single source); this file is the catalog-wiring
// record consumed by motions.ts' merge loop. The full-frame atmospherics
// (weddingPetals/confettiRain/bokehLights/lightLeakWarm/sparkleField) are meant
// for an `fx` overlay layer so they composite on top and alpha-export for DaVinci.
const WEDDING_IDS = [
  "goldenHour",
  "dreamGlow",
  "romanticGlow",
  "softFocusBreath",
  "sparkleGlow",
  "weddingPetals",
  "confettiRain",
  "bokehLights",
  "lightLeakWarm",
  "sparkleField",
] as const;

export const weddingStyles: Record<string, (ctx: MotionCtx) => CSSProperties> = Object.fromEntries(
  WEDDING_IDS.map((id) => [id, MOTION_FORMULAS[id]]),
) as unknown as Record<string, (ctx: MotionCtx) => CSSProperties>;
