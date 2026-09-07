// Pure timing maths for the polaroid "Carried Stacks" montage. No React, no frame reads — the
// renderer (Montage.tsx) and the editor (fit-duration button, block label) both call into here so
// the schedule is computed exactly once, the same way, everywhere.
//
// Everything is measured in BEATS on the project's beat grid, then converted to frames, so every
// peel lands on a kick even when beatFrames is fractional (e.g. 30 fps at 128 BPM = 14.06 f/beat).
//
// One chapter =  walk-in ─ set-down ─ [hold first pair] ─ peel ─ hold ─ peel … ─ walk-in ─ pick-up ─ walk-out
//                  (WALK_IN beats)      (peelBeats each)                        (PICKUP beats)
import type { Montage, MontageChapter } from "./schema";

/** Beats the sprites spend walking in with the stacks (arrival lands on a beat). */
export const WALK_IN_BEATS = 2;
/** Beats from "sprites return" to "stacks gone" at the end of a chapter. */
export const PICKUP_BEATS = 2;
/** Fraction of a beat the peel itself takes (clamped to >= MIN_PEEL_FRAMES). */
export const PEEL_BEAT_FRACTION = 0.5;
export const MIN_PEEL_FRAMES = 8;

export const beatFrames = (fps: number, bpm: number) => (60 / Math.max(1, bpm)) * fps;

/** Longest stack in the chapter — the chapter peels until that stack is down to one print. */
export const chapterMaxStack = (ch: MontageChapter) =>
  ch.stacks.reduce((m, s) => Math.max(m, s.photos.length), 0);

/** Chapter length in beats (0 for an empty chapter). */
export const chapterBeats = (ch: MontageChapter, peelBeats: number) => {
  const n = chapterMaxStack(ch);
  if (n === 0) return 0;
  // hold the first pair for peelBeats, then (n-1) peels each followed by a peelBeats hold
  return WALK_IN_BEATS + n * peelBeats + PICKUP_BEATS;
};

export const montageBeats = (m: Montage) =>
  m.chapters.reduce((s, ch) => s + chapterBeats(ch, m.peelBeats), 0);

/** Frames the whole montage needs so its last chapter finishes on the grid (before any lead-in). */
export const montageDurationInFrames = (m: Montage, fps: number, bpm: number) =>
  Math.ceil(montageBeats(m) * beatFrames(fps, bpm));

export interface ChapterSchedule {
  index: number;
  chapter: MontageChapter;
  /** Chapter-local frame at which the chapter starts / ends, relative to the montage grid start. */
  startFrame: number;
  endFrame: number;
  /** Frames the sprites walk in (arrival = startFrame + walkIn). */
  walkIn: number;
  /** Frame (relative to chapter start) of peel k (k = 0 is the FIRST peel, removing print 0). */
  peelAt: (k: number) => number;
  /** Frames one peel animation lasts. */
  peelFrames: number;
  /** Frames one print is held (= peelBeats on the grid). */
  holdFrames: number;
  /** Number of peels in this chapter (= maxStack − 1). */
  peels: number;
  /** Frame (relative to chapter start) the sprites start walking back in to collect the stacks. */
  pickupAt: number;
}

export interface MontageSchedule {
  /** Clip-local frame at which the beat grid starts (first beat at/after the clip's absolute start). */
  gridStart: number;
  beatFrames: number;
  chapters: ChapterSchedule[];
  /** Clip-local frame after which everything has left the page. */
  endFrame: number;
}

/**
 * Lay the montage out on the absolute beat grid.
 * @param absStart  absolute composition frame at which this clip starts (so peels lock to the song)
 * @param beatOffsetInFrames  project downbeat offset
 */
export const scheduleMontage = (
  m: Montage,
  opts: { fps: number; bpm: number; beatOffsetInFrames: number; absStart: number },
): MontageSchedule => {
  const bf = beatFrames(opts.fps, opts.bpm);
  const off = opts.beatOffsetInFrames;
  // First beat at or after the clip start, expressed clip-locally.
  const firstBeatAbs = Math.ceil((opts.absStart - off) / bf) * bf + off;
  const gridStart = firstBeatAbs - opts.absStart;
  const peelFrames = Math.max(MIN_PEEL_FRAMES, Math.round(PEEL_BEAT_FRACTION * bf));
  const holdFrames = m.peelBeats * bf;

  const chapters: ChapterSchedule[] = [];
  let cursor = gridStart;
  m.chapters.forEach((chapter, index) => {
    const n = chapterMaxStack(chapter);
    if (n === 0) return;
    const beats = chapterBeats(chapter, m.peelBeats);
    const startFrame = cursor;
    const endFrame = cursor + beats * bf;
    const walkIn = WALK_IN_BEATS * bf;
    chapters.push({
      index,
      chapter,
      startFrame,
      endFrame,
      walkIn,
      peelFrames,
      holdFrames,
      peels: n - 1,
      // peel k starts at: arrival + (k+1) holds − the peel itself, so the REVEAL lands on the beat
      peelAt: (k) => walkIn + (k + 1) * holdFrames - peelFrames,
      pickupAt: walkIn + n * holdFrames,
    });
    cursor = endFrame;
  });
  return { gridStart, beatFrames: bf, chapters, endFrame: cursor };
};
