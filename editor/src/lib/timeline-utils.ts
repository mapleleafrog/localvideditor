import type { Project } from "../../../src/timeline/schema";

/** Mirror of calculateTimelineMetadata: Σclip − Σtransitions(with next), covering overlays. */
export const computeDuration = (p: Project): number => {
  const clips = p.clips ?? [];
  const overlays = p.overlays ?? [];
  const clipsTotal = clips.reduce((s, c) => s + c.durationInFrames, 0);
  const transTotal = clips.reduce(
    (s, c, i) =>
      s + (i < clips.length - 1 && c.transitionToNext && c.transitionToNext !== "none" ? c.transitionDurationInFrames : 0),
    0,
  );
  const overlayEnd = overlays.reduce((m, o) => Math.max(m, (o.from ?? 0) + o.durationInFrames), 0);
  return Math.max(clipsTotal - transTotal, overlayEnd, 1);
};

/** Absolute start frame of each clip on the (sequential, transition-overlapped) clip track. */
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
