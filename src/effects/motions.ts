import type { MotionDef } from "./types";
import { CATALOG } from "./catalog";
import { MOTION_FORMULAS } from "./portable";
import { depthStyles } from "./depth";
import { pixelStyles } from "./pixel";
import { retroStyles } from "./retro";
import { weddingStyles } from "./wedding";

// Formula bodies live in portable.ts (the single source shared with the portal
// bundle). This file owns the catalog wiring only: it flips catalog stubs from
// status:'todo' to 'ready' and attaches the shared formula + per-motion defaults.
const FORMULAS = MOTION_FORMULAS as unknown as Record<string, NonNullable<MotionDef["style"]>>;

// 1. Stub every motion row from the catalog (status stays 'todo').
const motions: Record<string, MotionDef> = {};
for (const e of CATALOG) if (e.kind === "motion") motions[e.id] = { ...e };

// 2. Override the implemented ids with status:'ready' + a style(ctx) from portable.
const ready = (
  id: string,
  style: NonNullable<MotionDef["style"]>,
  defaults?: Record<string, number>,
) => {
  if (!motions[id]) throw new Error(`Motion "${id}" is implemented but missing from CATALOG`);
  motions[id] = { ...motions[id], status: "ready", style, defaults };
};

// --- Ken Burns / Zoom ---
ready("kenBurns", FORMULAS.kenBurns);
ready("slowZoomIn", FORMULAS.slowZoomIn);
ready("slowZoomOut", FORMULAS.slowZoomOut);
ready("pulseZoom", FORMULAS.pulseZoom);
ready("smashZoom", FORMULAS.smashZoom);
ready("focusBreath", FORMULAS.focusBreath);

// --- Pan / Move ---
ready("panLR", FORMULAS.panLR);
ready("panUD", FORMULAS.panUD);
ready("parallaxPan", FORMULAS.parallaxPan, { speed: 1 });
ready("driftFloat", FORMULAS.driftFloat);
ready("kineticText", FORMULAS.kineticText);

// --- Path ---
ready("motionPath", FORMULAS.motionPath);
ready("arcMove", FORMULAS.arcMove);
ready("orbit", FORMULAS.orbit, { radius: 30 });
ready("drawOn", FORMULAS.drawOn);
ready("bezierFloat", FORMULAS.bezierFloat);

// --- Physics / Spring ---
ready("springPop", FORMULAS.springPop);
ready("bounceIn", FORMULAS.bounceIn);
ready("elasticIn", FORMULAS.elasticIn);
ready("jiggleWobble", FORMULAS.jiggleWobble);
ready("inertiaSlide", FORMULAS.inertiaSlide);
ready("squashStretch", FORMULAS.squashStretch);
ready("pendulum", FORMULAS.pendulum);

// --- 3D / Perspective (CSS perspective only) ---
ready("tiltPerspective", FORMULAS.tiltPerspective);
ready("flip3DLayer", FORMULAS.flip3DLayer);

// --- Camera (CSS analogs of cinematic moves) ---
ready("dollyInOut", FORMULAS.dollyInOut);
ready("truck", FORMULAS.truck);
ready("pedestal", FORMULAS.pedestal);
ready("panCam", FORMULAS.panCam);
ready("tiltCam", FORMULAS.tiltCam);
ready("zoomLens", FORMULAS.zoomLens);
ready("rackFocus", FORMULAS.rackFocus);
ready("dollyZoom", FORMULAS.dollyZoom);
ready("whipPanCam", FORMULAS.whipPanCam);
ready("craneJib", FORMULAS.craneJib);
ready("arcShot", FORMULAS.arcShot);
ready("handheld", FORMULAS.handheld);
ready("dutchAngle", FORMULAS.dutchAngle, { angle: 8 });
ready("steadicamFollow", FORMULAS.steadicamFollow);

// --- Loop / Idle ---
ready("breathingLoop", FORMULAS.breathingLoop);
ready("floatLoop", FORMULAS.floatLoop);
ready("swayLoop", FORMULAS.swayLoop);
ready("shimmerLoop", FORMULAS.shimmerLoop);
ready("pulseGlow", FORMULAS.pulseGlow);
ready("grainLoop", FORMULAS.grainLoop);

// --- Beat-reactive (frame-derived beat; no audio analysis this stage) ---
ready("beatPulse", FORMULAS.beatPulse);
ready("beatFlash", FORMULAS.beatFlash);
ready("beatShake", FORMULAS.beatShake);
ready("beatColorCycle", FORMULAS.beatColorCycle);
ready("beatZoomCut", FORMULAS.beatZoomCut);
ready("audioBars", FORMULAS.audioBars);
ready("waveform", FORMULAS.waveform);

// --- Merge the Depth/2.5D, Pixel-art and Retro/FX families (all 'ready') ---
for (const [id, style] of Object.entries(depthStyles)) ready(id, style);
for (const [id, style] of Object.entries(pixelStyles)) ready(id, style);
for (const [id, style] of Object.entries(retroStyles)) ready(id, style);
for (const [id, style] of Object.entries(weddingStyles)) ready(id, style);

export { motions };
