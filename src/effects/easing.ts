import { clamp } from "./helpers";

// Pure easing curves (t in [0,1] → [0,1]). Used for clip transitions (via linearTiming's `easing`),
// overlay enter/exit ramps, and per-effect progress shaping. One set, used everywhere.
const cubicIn = (t: number) => t * t * t;
const cubicOut = (t: number) => 1 - Math.pow(1 - t, 3);
const cubicInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const cubicOutIn = (t: number) => (t < 0.5 ? cubicOut(2 * t) / 2 : cubicIn(2 * t - 1) / 2 + 0.5);

export const EASINGS = {
  linear: (t: number) => t,
  easeIn: cubicIn,
  easeOut: cubicOut,
  easeInOut: cubicInOut,
  easeOutIn: cubicOutIn,
} as const;

export type EasingName = keyof typeof EASINGS;
export const EASING_NAMES = Object.keys(EASINGS) as EasingName[];

/** Apply a named easing to a 0..1 value (clamped). Unknown name → linear. */
export const ease = (name: EasingName | undefined, t: number): number => (EASINGS[name ?? "linear"] ?? EASINGS.linear)(clamp(t));
