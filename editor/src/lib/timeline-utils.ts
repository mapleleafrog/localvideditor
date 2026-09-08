import type { AudioTrack, Project } from "../../../src/timeline/schema";

/** Last frame any non-looping audio track plays — mirror of Timeline.audioEndFrames. */
export const audioEndFrames = (audio: AudioTrack[], durationOf: (src: string) => number | undefined): number =>
  audio.reduce((end, a) => {
    if (a.loop) return end;
    const srcFrames = durationOf(a.src);
    if (srcFrames == null) return end;
    const playable = (a.trimAfter || srcFrames) - (a.trimBefore || 0);
    return Math.max(end, (a.from ?? 0) + Math.max(0, playable));
  }, 0);

/** Mirror of calculateTimelineMetadata: max(Σclip − Σtransitions, overlay end, audio end).
 *  `audioEnd` is supplied by the caller (audio lengths are loaded async in the browser). */
export const computeDuration = (p: Project, audioEnd = 0): number => {
  if (p.durationInFrames && p.durationInFrames > 0) return p.durationInFrames; // fixed project length
  const clips = p.clips ?? [];
  const overlays = p.overlays ?? [];
  const clipsTotal = clips.reduce((s, c) => s + c.durationInFrames, 0);
  const transTotal = clips.reduce(
    (s, c, i) =>
      s + (i < clips.length - 1 && c.transitionToNext && c.transitionToNext !== "none" ? c.transitionDurationInFrames : 0),
    0,
  );
  const overlayEnd = overlays.reduce((m, o) => Math.max(m, (o.from ?? 0) + o.durationInFrames), 0);
  return Math.max(clipsTotal - transTotal, overlayEnd, audioEnd, 1);
};

/** Absolute start frame of each clip on the (sequential, transition-overlapped) clip track.
 *
 *  `clipStarts(p)[i]` IS the wall clip's `absStart` contract. Four sites implement the same overlap
 *  rule and MUST stay in sync — do not "optimise" one of them out of step:
 *    1. here (the editor: fit status, block placement, the Wall view's Live seek),
 *    2. `ClipTrack`'s accumulator in src/timeline/Timeline.tsx, which threads absStart into the
 *       wall so breathing / item motions / the timecode run on ABSOLUTE composition seconds
 *       (`TransitionSeries.Sequence` makes useCurrentFrame() clip-LOCAL),
 *    3. `calculateTimelineMetadata`'s `transTotal`,
 *    4. `computeDuration` above. */
export const clipStarts = (p: Project): number[] => {
  const starts: number[] = [];
  let acc = 0;
  (p.clips ?? []).forEach((c, i) => {
    starts.push(acc);
    const overlap =
      i < (p.clips ?? []).length - 1 && c.transitionToNext && c.transitionToNext !== "none"
        ? c.transitionDurationInFrames
        : 0;
    acc += c.durationInFrames - overlap;
  });
  return starts;
};

export const fmtTime = (frame: number, fps: number) => {
  const s = frame / fps;
  const mm = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${mm}:${ss.toString().padStart(2, "0")}`;
};

export const clampFrame = (f: number, max: number) => Math.max(0, Math.min(max, Math.round(f)));
