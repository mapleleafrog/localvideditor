import type { CSSProperties } from "react";
import type { MotionCtx } from "./types";
import { MOTION_FORMULAS } from "./portable";

// Japan MV pack — sakura petals, anamorphic lens flare, komorebi god-rays (all full-frame,
// meant for `fx` overlay layers with screen-blend compositing) + a pastel element/clip grade.
// Formula bodies live in portable.ts (single source); this file is the catalog-wiring record
// consumed by motions.ts' merge loop, mirroring wedding.ts.
const MV_IDS = ["sakuraPetals", "lensFlare", "godRays", "japanMvGrade"] as const;

export const mvStyles: Record<string, (ctx: MotionCtx) => CSSProperties> = Object.fromEntries(
  MV_IDS.map((id) => [id, MOTION_FORMULAS[id]]),
) as unknown as Record<string, (ctx: MotionCtx) => CSSProperties>;
