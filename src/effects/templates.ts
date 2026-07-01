import type { CSSProperties } from "react";
import type { MotionCtx } from "./types";
import { MOTION_FORMULAS } from "./portable";

// Ported from reactvideoeditor/remotion-templates (MIT) — reworked from standalone
// <Composition>s into style(ctx)=>CSSProperties formulas so they fit our per-layer
// motion model. Formula bodies live in portable.ts (single source, shared with the
// portal); this file is the catalog-wiring record consumed by motions.ts' merge loop.
// Templates needing dynamic content (live-counting numbers, data-bound charts,
// multi-image galleries, scrolling credit lists) aren't representable as a single
// style formula and are intentionally left out — they'd need a new overlay content
// type + schema fields, not just a motion.
const TEMPLATE_IDS = [
  "spotlightReveal",
  "letterboxReveal",
  "liquidWave",
  "monogramSpinReveal",
  "monogramScaleRotate",
  "monogramBlurReveal",
  "chapterTitleReveal",
  "quoteCardReveal",
  "lowerThirdBar",
  "polaroidFrame",
  "circularProgressReveal",
] as const;

export const templateStyles: Record<string, (ctx: MotionCtx) => CSSProperties> = Object.fromEntries(
  TEMPLATE_IDS.map((id) => [id, MOTION_FORMULAS[id]]),
) as unknown as Record<string, (ctx: MotionCtx) => CSSProperties>;
