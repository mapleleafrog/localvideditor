import { z } from "zod";
import { readyMotions, readyTransitions } from "../effects";

// ---------------------------------------------------------------------------
// The `project` config that drives the generic Timeline composition.
//
// IMPORTANT: this schema is tuned for Remotion Studio's VISUAL props editor.
// It uses ONLY editor-supported zod types — z.object, z.array, z.enum,
// z.number, z.string, z.boolean (NO z.discriminatedUnion / z.record, which the
// editor can't render). Clips/overlays are plain objects with a `type` enum;
// the component branches on `type`. Effect / transition / background pickers are
// z.enum lists built from the live registry, so the form shows real DROPDOWNS
// and stays in sync as effects are added.
// ---------------------------------------------------------------------------

const MOTION_IDS = readyMotions().map((m) => m.id);
const BG_IDS = readyMotions()
  .filter((m) => m.category === "Backgrounds")
  .map((m) => m.id);
const TRANSITION_IDS = readyTransitions().map((t) => t.id);

// z.enum needs a non-empty tuple type; the registry always has entries.
const enumOf = (vals: string[]) => z.enum(vals as [string, ...string[]]);
const motionPick = enumOf(["none", ...MOTION_IDS]); // "none" = no full-frame motion
const transitionPick = enumOf(["none", ...TRANSITION_IDS]);
const bgMotionPick = enumOf(["none", ...BG_IDS]);

const clipSchema = z.object({
  type: z.enum(["image", "video"]).default("image"),
  /** A file in public/ (e.g. "clip-a.svg") or public/media/ (e.g. "media/photo.jpg"). */
  src: z.string().default("clip-a.svg"),
  durationInFrames: z.number().int().positive().default(90),
  /** Full-frame motion over the clip (kenBurns, slowZoomIn, panLR, ...). */
  motion: motionPick.default("none"),
  /** Transition INTO the next clip (ignored on the last clip). */
  transitionToNext: transitionPick.default("none"),
  transitionDurationInFrames: z.number().int().positive().default(20),
  /** Video only — 0 means "no trim". */
  trimBefore: z.number().int().nonnegative().default(0),
  trimAfter: z.number().int().nonnegative().default(0),
  volume: z.number().min(0).max(1).default(1),
  /** Storyboard-only: a short shot title + free notes. Optional so existing clip literals
   *  (Root.tsx defaultProps, projects/*.json) stay valid; the render ignores these. */
  label: z.string().optional(),
  note: z.string().optional(),
});

const overlaySchema = z.object({
  // "fx" = a full-frame effect layer (no text/image content) — stack full-frame motions
  // like weddingPetals/bokehLights on top of footage; alpha-exports cleanly for compositing.
  type: z.enum(["text", "image", "fx"]).default("text"),
  /** Used when type = text. */
  text: z.string().default("Title"),
  /** Used when type = image — a file in public/ or public/media/. */
  src: z.string().default("orange-mush.gif"),
  from: z.number().int().nonnegative().default(0),
  durationInFrames: z.number().int().positive().default(90),
  /** Center position, % of frame. */
  x: z.number().default(50),
  y: z.number().default(50),
  scale: z.number().default(1),
  rotation: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
  /** Stacked effects — all applied at once (dropdowns). */
  motions: z.array(enumOf(MOTION_IDS)).default([]),
  /** Depth 0=far..1=near (drop-shadow). */
  z: z.number().min(0).max(1).default(0.4),
  /** Progress window for entrance effects. */
  windowInFrames: z.number().int().positive().default(30),
  /** Text only. */
  fontSize: z.number().default(80),
  color: z.string().default("#ffffff"),
  glow: z.string().default(""),
  width: z.number().default(200),
});

// A soundtrack / sfx track layered under the whole timeline (rendered as <Audio>).
const audioTrackSchema = z.object({
  /** Audio file in public/ or public/media/ (e.g. "media/soranji.mp3") or an http(s) URL. */
  src: z.string().default("media/song.mp3"),
  volume: z.number().min(0).max(1).default(1),
  /** Timeline frame at which this track starts playing. */
  from: z.number().int().nonnegative().default(0),
  /** Trim INTO the source (frames) before playback; 0 = from the start. */
  trimBefore: z.number().int().nonnegative().default(0),
  /** Stop at this source frame; 0 = play to the end. */
  trimAfter: z.number().int().nonnegative().default(0),
  loop: z.boolean().default(false),
});

export const projectSchema = z.object({
  background: z
    .object({
      type: z.enum(["none", "color", "gradient", "motion"]).default("motion"),
      color: z.string().default("#0c1322"),
      gradient: z.string().default("linear-gradient(#1b2a6b, #0e3b4d)"),
      motion: bgMotionPick.default("synthGrid"),
    })
    .default({ type: "motion", color: "#0c1322", gradient: "linear-gradient(#1b2a6b, #0e3b4d)", motion: "synthGrid" }),
  clips: z.array(clipSchema).default([]),
  overlays: z.array(overlaySchema).default([]),
  /** Soundtrack — music/sfx tracks played under the whole video. */
  audio: z.array(audioTrackSchema).default([]),
  /** Tempo for the beat-reactive motions (beatPulse, beatShake, …). Set to your song's BPM. */
  bpm: z.number().positive().default(120),
  /** Shift the beat grid so the downbeat lands on the song's first beat (in frames). */
  beatOffsetInFrames: z.number().int().default(0),
  fps: z.number().int().positive().default(30),
  width: z.number().int().positive().default(1920),
  height: z.number().int().positive().default(1080),
});

export type Project = z.infer<typeof projectSchema>;
export type Clip = z.infer<typeof clipSchema>;
export type Overlay = z.infer<typeof overlaySchema>;
export type AudioTrack = z.infer<typeof audioTrackSchema>;
export type Background = z.infer<typeof projectSchema>["background"];
