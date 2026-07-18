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
const easingPick = z.enum(["linear", "easeIn", "easeOut", "easeInOut", "easeOutIn"]);
// Per-effect settings, index-aligned with `overlay.motions`.
const motionParamSchema = z.object({
  loop: z.boolean().optional(),
  strength: z.number().min(0).optional(),
  easing: easingPick.optional(),
});
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
  /** Easing curve for the transition (linear / easeIn / easeOut / easeInOut / easeOutIn). */
  transitionEasing: easingPick.optional(),
  /** Video only — 0 means "no trim". */
  trimBefore: z.number().int().nonnegative().default(0),
  trimAfter: z.number().int().nonnegative().default(0),
  volume: z.number().min(0).max(1).default(1),
  /** Effect strength multiplier for this clip's motion (1 = normal). Optional — defaults to 1. */
  strength: z.number().min(0).optional(),
  /** Storyboard-only: a short shot title + free notes. Optional so existing clip literals
   *  (Root.tsx defaultProps, projects/*.json) stay valid; the render ignores these. */
  label: z.string().optional(),
  note: z.string().optional(),
});

const overlaySchema = z.object({
  // "fx" = a full-frame effect layer (no text/image content) — stack full-frame motions
  // like weddingPetals/bokehLights on top of footage; alpha-exports cleanly for compositing.
  // "video" = a video layer that overlaps other layers/clips (PiP, split-screen).
  type: z.enum(["text", "image", "fx", "video"]).default("text"),
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
  /** Enter / exit transition for this layer (element-scoped: fade / slide / zoom / pop / rotate /
   *  spin / blur / flash / wipe / iris / typewriter — in & out). */
  enter: z
    .enum(["none", "fade", "slideLeft", "slideRight", "slideUp", "slideDown", "zoom", "pop", "rotateIn", "spin", "blurIn", "flash", "wipe", "iris", "typewriter"])
    .default("none"),
  exit: z
    .enum(["none", "fade", "slideLeft", "slideRight", "slideUp", "slideDown", "zoom", "pop", "rotateIn", "spin", "blurIn", "flash", "wipe", "iris", "typewriter"])
    .default("none"),
  enterDurationInFrames: z.number().int().nonnegative().default(15),
  exitDurationInFrames: z.number().int().nonnegative().default(15),
  /** Easing curves for the enter / exit ramps. */
  enterEasing: easingPick.optional(),
  exitEasing: easingPick.optional(),
  /** Per-layer fallback loop/strength (applied to every effect unless a per-effect param overrides). */
  loop: z.boolean().optional(),
  strength: z.number().min(0).optional(),
  /** Per-effect settings, index-aligned with `motions` (loop / strength / easing each). */
  motionParams: z.array(motionParamSchema).optional(),
  /** Text only. */
  fontSize: z.number().default(80),
  color: z.string().default("#ffffff"),
  glow: z.string().default(""),
  /** Per-character reveal for text overlays (charFadeUp / charBlurReveal / typewriterChar /
   *  wordHighlight). Optional — unset or "none" = static text. */
  textAnimation: z.enum(["none", "charFadeUp", "charBlurReveal", "typewriterChar", "wordHighlight"]).optional(),
  /** Frames between successive characters/words in the reveal (default 3). */
  textAnimationStagger: z.number().int().nonnegative().optional(),
  width: z.number().default(200),
  /** Crisp pixel-art scaling (`image-rendering: pixelated`) for image layers. Optional — default is
   *  smooth (bilinear), so slow/sub-pixel motion doesn't snap to whole pixels (= choppy). */
  pixelated: z.boolean().optional(),
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
  /** Fixed project length in frames. Optional — 0/unset = auto (fit clips/overlays/audio). When set
   *  it caps the video length and the max a clip can be extended to. */
  durationInFrames: z.number().int().nonnegative().optional(),
  fps: z.number().int().positive().default(30),
  width: z.number().int().positive().default(1920),
  height: z.number().int().positive().default(1080),
});

export type Project = z.infer<typeof projectSchema>;
export type Clip = z.infer<typeof clipSchema>;
export type Overlay = z.infer<typeof overlaySchema>;
export type AudioTrack = z.infer<typeof audioTrackSchema>;
export type MotionParam = z.infer<typeof motionParamSchema>;
export type Background = z.infer<typeof projectSchema>["background"];
