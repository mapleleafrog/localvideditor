// Single bridge to the effect registry. The editor's effect/transition pickers
// read from HERE, so any VFX added to src/effects (portable.ts + catalog.ts)
// appears automatically — no editor changes.
export { readyMotions, readyTransitions, getMotion, getTransitionPresentation } from "../../../src/effects";
export { MOTION_META } from "../../../src/effects/portable";
export type { MotionDef, TransitionDef } from "../../../src/effects/types";
