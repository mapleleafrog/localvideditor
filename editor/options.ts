import { readyMotions, readyTransitions } from "../src/effects";

export type Opt = { value: string; label: string };

const byName = (a: Opt, b: Opt) => a.label.localeCompare(b.label);

/** All ready motions, for clip + overlay effect pickers. */
export const MOTION_OPTIONS: Opt[] = readyMotions()
  .map((m) => ({ value: m.id, label: m.name }))
  .sort(byName);

/** Backgrounds-category motions only (synthGrid / starfield / crtRoom). */
export const BG_MOTION_OPTIONS: Opt[] = readyMotions()
  .filter((m) => m.category === "Backgrounds")
  .map((m) => ({ value: m.id, label: m.name }))
  .sort(byName);

/**
 * All ready transitions. WebGL shader ones render fine but their Studio/Player
 * preview needs a Chrome flag, so they're flagged in the label.
 */
export const TRANSITION_OPTIONS: Opt[] = readyTransitions()
  .map((t) => ({ value: t.id, label: t.engine === "webgl" ? `${t.name} (shader*)` : t.name }))
  .sort(byName);
