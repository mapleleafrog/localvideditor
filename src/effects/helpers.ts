// Pure maths for the effect registry. No React, no frame reads — every
// function is a deterministic value transform sampled by `Layer`.

export const TAU = Math.PI * 2;

export const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Smoothstep 0..1. */
export const smooth = (t: number) => t * t * (3 - 2 * t);

export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** Damped spring 0->1 with overshoot. */
export const springy = (p: number) =>
  p >= 1 ? 1 : 1 - Math.exp(-6 * p) * Math.cos(9 * p);

export const bounceOut = (p: number) => {
  const n = 7.5625;
  const d = 2.75;
  if (p < 1 / d) return n * p * p;
  if (p < 2 / d) {
    p -= 1.5 / d;
    return n * p * p + 0.75;
  }
  if (p < 2.5 / d) {
    p -= 2.25 / d;
    return n * p * p + 0.9375;
  }
  p -= 2.625 / d;
  return n * p * p + 0.984375;
};

/** Elastic overshoot 0->1 (used by `elasticIn`). */
export const elasticOut = (p: number) => {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * c4) + 1;
};

/** Decaying beat kick. frame-derived t keeps it deterministic; exp = sharpness.
 *  `offsetSec` shifts the downbeat so the metronome can be aligned to a real song. */
export const beatKick = (t: number, bpm = 120, exp = 6, offsetSec = 0) => {
  const spb = 60 / bpm;
  // Positive modulo so a negative (t - offset) still lands in [0, spb).
  const ph = ((((t - offsetSec) % spb) + spb) % spb) / spb;
  return Math.pow(1 - ph, exp);
};

/** Integer beat index since t=0 (after the downbeat offset), for "every Nth beat" logic. */
export const beatIndex = (t: number, bpm = 120, offsetSec = 0) =>
  Math.floor((t - offsetSec) / (60 / bpm));

/** Cubic bezier point at t for [x,y] control points. */
export const bez = (
  t: number,
  p0: readonly number[],
  p1: readonly number[],
  p2: readonly number[],
  p3: readonly number[],
) => {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ] as const;
};

/** Snap v to `steps` discrete levels — the core of stepped pixel-art motion. */
export const quantize = (v: number, steps: number) => Math.round(v * steps) / steps;

/** Snap seconds to a low "animation fps" so sprite motion reads as chunky pixel frames. */
export const stepTime = (t: number, animFps = 8) => Math.floor(t * animFps) / animFps;

/** Deterministic pseudo-random in [0,1) from an integer seed (no Math.random). */
export const seededRandom = (seed: number) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
