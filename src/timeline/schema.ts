import { z } from "zod";
import { readyMotions, readyTransitions } from "../effects";
import { FONT_IDS } from "./fonts";

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

// --- Wall ("collage wall with a keyframed camera") --------------------------------------------
// A clip of type "wall" pins photos, props and hand-font text anywhere on an UNBOUNDED wall
// (negative coordinates included) and walks a camera across it through an ordered list of scenes
// (camera keyframes, in SECONDS — the beat grid is deliberately not involved).
// Pure maths: wall.ts (schedule / camera / fit-all / boxes). Look: wall-paper.ts. Render: WallClip.tsx.
const wallItemSchema = z.object({
  type: z.enum(["image", "text"]).default("image"),
  /** public/ or public/media/ ref. .gif -> <Gif>, .webm/.mp4/.mov -> <OffthreadVideo>, else <Img>. */
  src: z.string().default(""),
  text: z.string().default(""),
  /** CENTRE, wall units. 1 unit = 1 composition px at zoom 1. Negative is legal — the wall has no
   *  origin corner and the camera is never clamped. */
  x: z.number().default(0),
  y: z.number().default(0),
  /** OUTER card width in wall units (the frame treatment is included). */
  width: z.number().positive().default(560),
  /** Intrinsic w/h of the source, written by the editor at import (imageNaturalSize /
   *  videoNaturalSize). Clamped to [0.2, 5] at every read; unset -> 1. */
  aspect: z.number().positive().optional(),
  rotation: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
  /** Parallax factor. 1 = the wall plane, <1 recedes, >1 comes forward. POSITION ONLY — it never
   *  changes the item's rendered size (the camera layer's scale(zoom*depth) is cancelled by the
   *  item's own scale(1/depth)). */
  depth: z.number().min(0.2).max(3).default(1),
  frame: z.enum(["none", "polaroid", "matte", "taped", "torn"]).default("none"),
  /** Handwritten caption on a polaroid/matte margin; ignored by other treatments and by text. */
  caption: z.string().default(""),
  filter: z.enum(["none", "sepia", "faded", "bw", "warm", "cool"]).default("none"),
  filterStrength: z.number().min(0).max(1).default(1),
  /** Stacked registry effects — composed exactly like an overlay's. */
  motions: z.array(enumOf(MOTION_IDS)).default([]),
  /** Per-effect settings, index-aligned with `motions` (the SAME schema overlays use). */
  motionParams: z.array(motionParamSchema).optional(),
  windowInFrames: z.number().int().positive().default(90),
  /** GIF / video playback speed. */
  playbackRate: z.number().positive().optional(),
  /** Force PNG frame extraction so WebM/MOV alpha survives. Unset = auto by extension. */
  alpha: z.boolean().optional(),
  /** Stable look seed (tape angles, torn ring, frame tint). Written once at create time — a seed
   *  must never carry a frame term or the print boils. */
  seed: z.number().int().optional(),
  pixelated: z.boolean().optional(),
  flipX: z.boolean().optional(),
  flipY: z.boolean().optional(),
  /** Editor-only name in the item list; the render ignores it. */
  label: z.string().optional(),
  // text only
  fontSize: z.number().positive().default(96), // wall units
  fontFamily: enumOf([...FONT_IDS]).optional(),
  color: z.string().default("#3a3226"),
  align: z.enum(["left", "center", "right"]).default("center"),
});

const wallSceneSchema = z.object({
  name: z.string().default(""),
  x: z.number().default(0),
  y: z.number().default(0),
  zoom: z.number().positive().default(1),
  rotation: z.number().default(0),
  /** 0 = a "via" scene: the camera flows through the pose without stopping. */
  holdSeconds: z.number().min(0).default(1.8),
  /** Glide INTO this scene. On scene 0 this is the INTRO glide, used only when `intro` is on. */
  glideSeconds: z.number().min(0).default(1.5),
  /** `smooth` (default) has zero velocity AND zero acceleration at both ends — no shove on arrival. */
  easing: z.enum(["smooth", "sine", "cubic", "settle"]).default("smooth"),
  /** Path bow. 0 = provably identical to a straight lerp. Sign picks the side of travel
   *  (+ = left of the direction of travel). Deterministic and LOCAL. */
  arc: z.number().min(-1).max(1).default(0),
});

export const wallSchema = z.object({
  /** ARRAY ORDER IS PAINT ORDER — depth is parallax only and never reorders. */
  items: z.array(wallItemSchema).default([]),
  scenes: z.array(wallSceneSchema).default([]),
  paper: z.enum(["cream", "kraft", "white", "night"]).default("cream"),
  fibre: z.number().min(0).max(1).default(1),
  finish: z.number().min(0).max(1).default(1),
  breathing: z.number().min(0).max(1).default(0.55),
  intro: z.boolean().default(true),
  introHoldSeconds: z.number().min(0).default(0.8),
  outro: z.boolean().default(true),
  outroSeconds: z.number().min(0).default(2.4),
  outroHoldSeconds: z.number().min(0).default(1.5),
  viewfinder: z.boolean().default(false),
  handFont: z.enum(["caveat", "yomogi", "zenKurenaido"]).default("caveat"),
  /** Margin fraction for the whole-wall "fit all" pose (intro/outro/Fit-all/thumbnails). */
  fitPadding: z.number().min(0).max(0.4).default(0.06),
  timecodeOffsetInFrames: z.number().int().nonnegative().default(0),
});

const clipSchema = z.object({
  type: z.enum(["image", "video", "wall"]).default("image"),
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
  /** Mirror the media horizontally / vertically, in place (does not invert its motion's direction).
   *  Optional — unset = not flipped, so existing clip literals stay valid. */
  flipX: z.boolean().optional(),
  flipY: z.boolean().optional(),
  /** Storyboard-only: a short shot title + free notes. Optional so existing clip literals
   *  (Root.tsx defaultProps, projects/*.json) stay valid; the render ignores these. */
  label: z.string().optional(),
  note: z.string().optional(),
  /** Used when type = wall (see wallSchema). Optional so image/video clip literals stay valid. */
  wall: wallSchema.optional(),
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
  /** Font family id — resolved to a CSS font via @remotion/google-fonts (see fonts.ts). Optional;
   *  unset / "default" = monospace, so existing projects are unchanged. */
  fontFamily: enumOf([...FONT_IDS]).optional(),
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
  /** Mirror the layer's content horizontally / vertically, in place. Applied to an inner content
   *  wrapper (NOT the outer motion transform) so it never interacts with a motion's own
   *  transform-origin (e.g. bottom-anchored squashStretch/pendulum). Optional — unset = not flipped. */
  flipX: z.boolean().optional(),
  flipY: z.boolean().optional(),
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
export type Wall = z.infer<typeof wallSchema>;
export type WallItem = z.infer<typeof wallItemSchema>;
export type WallScene = z.infer<typeof wallSceneSchema>;
export type Background = z.infer<typeof projectSchema>["background"];
