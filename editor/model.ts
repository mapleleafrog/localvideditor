import type { AudioTrack, Clip, Overlay, Project } from "../src/timeline/schema";

export type Selection = { kind: "clip" | "overlay"; index: number } | null;

export const VIDEO_RE = /\.(mp4|webm|mov|m4v)$/i;
export const AUDIO_RE = /\.(mp3|wav|m4a|aac|ogg|flac)$/i;
export const isVideoSrc = (s: string) => VIDEO_RE.test(s);
export const isAudioSrc = (s: string) => AUDIO_RE.test(s);

/** A blank project to start editing from. */
export const emptyProject = (): Project => ({
  fps: 30,
  width: 1920,
  height: 1080,
  background: { type: "none" },
  clips: [],
  overlays: [],
  audio: [],
});

export const newClip = (src: string): Clip =>
  isVideoSrc(src)
    ? { type: "video", src, durationInFrames: 90, volume: 1 }
    : { type: "image", src, durationInFrames: 90, motion: "kenBurns" };

export const newTextOverlay = (): Overlay => ({
  type: "text",
  text: "New text",
  fontSize: 90,
  color: "#ffffff",
  fontFamily: "monospace",
  from: 0,
  durationInFrames: 90,
  x: 50,
  y: 50,
  scale: 1,
  rotation: 0,
  opacity: 1,
  motions: [],
});

export const newImageOverlay = (src: string): Overlay => ({
  type: "image",
  src,
  width: 240,
  from: 0,
  durationInFrames: 90,
  x: 50,
  y: 50,
  scale: 1,
  rotation: 0,
  opacity: 1,
  motions: [],
});

export const newAudioTrack = (src: string): AudioTrack => ({
  src,
  volume: 1,
  from: 0,
  loop: false,
});

/** Immutably reorder an array element from `from` to `to`. */
export const move = <T>(arr: T[], from: number, to: number): T[] => {
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

export const basename = (p: string) => p.split("/").pop() ?? p;
