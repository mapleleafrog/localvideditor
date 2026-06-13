import { z } from "zod";

// ---------------------------------------------------------------------------
// The `project` config that drives the generic Timeline composition.
//
// A video = a clip track (full-frame images/videos joined by transitions) +
// overlays (positioned text/images with stacked effects) + a background.
// Effect ids (`motion`, `motions[]`, transition `id`, background `motion`) are
// plain strings resolved against the single src/effects registry — so any new
// effect added there is immediately usable here.
// ---------------------------------------------------------------------------

export const backgroundSchema = z.object({
  type: z.enum(["none", "color", "gradient", "motion"]).default("none"),
  color: z.string().optional(),
  gradient: z.string().optional(),
  /** A Backgrounds motion id: synthGrid | starfield | crtRoom. */
  motion: z.string().optional(),
});

const transitionRef = z.object({
  /** Transition id from the registry (crossfade, dreamyZoom, crtOn, ...). */
  id: z.string(),
  durationInFrames: z.number().int().positive(),
});

const clipCommon = {
  durationInFrames: z.number().int().positive(),
  /** Full-frame motion id applied to the clip (kenBurns, slowZoomIn, panLR, ...). */
  motion: z.string().optional(),
  motionParams: z.record(z.string(), z.number()).optional(),
  /** Transition into the NEXT clip. Ignored on the last clip. */
  transitionToNext: transitionRef.optional(),
};

export const imageClipSchema = z.object({
  type: z.literal("image"),
  src: z.string(),
  ...clipCommon,
});

export const videoClipSchema = z.object({
  type: z.literal("video"),
  src: z.string(),
  trimBefore: z.number().int().nonnegative().optional(),
  trimAfter: z.number().int().positive().optional(),
  volume: z.number().min(0).max(1).optional(),
  ...clipCommon,
});

export const clipSchema = z.discriminatedUnion("type", [imageClipSchema, videoClipSchema]);

const overlayCommon = {
  from: z.number().int().nonnegative().default(0),
  durationInFrames: z.number().int().positive(),
  /** Position of the element's CENTER, in % of the frame. */
  x: z.number().default(50),
  y: z.number().default(50),
  scale: z.number().default(1),
  rotation: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
  /** Stacked effect ids — all composed onto this element at once. */
  motions: z.array(z.string()).default([]),
  motionParams: z.record(z.string(), z.number()).optional(),
  windowInFrames: z.number().int().positive().optional(),
  /** Depth 0=far..1=near (drop-shadow + depth motions). */
  z: z.number().min(0).max(1).optional(),
};

export const textOverlaySchema = z.object({
  type: z.literal("text"),
  text: z.string(),
  fontSize: z.number().default(80),
  color: z.string().default("#ffffff"),
  fontFamily: z.string().default("monospace"),
  /** CSS text-shadow string for neon/glow titles. */
  glow: z.string().optional(),
  ...overlayCommon,
});

export const imageOverlaySchema = z.object({
  type: z.literal("image"),
  src: z.string(),
  width: z.number().default(200),
  ...overlayCommon,
});

export const overlaySchema = z.discriminatedUnion("type", [textOverlaySchema, imageOverlaySchema]);

export const projectSchema = z.object({
  fps: z.number().default(30),
  width: z.number().default(1920),
  height: z.number().default(1080),
  background: backgroundSchema.default({ type: "none" }),
  clips: z.array(clipSchema).default([]),
  overlays: z.array(overlaySchema).default([]),
});

export type Project = z.infer<typeof projectSchema>;
export type Clip = z.infer<typeof clipSchema>;
export type Overlay = z.infer<typeof overlaySchema>;
export type Background = z.infer<typeof backgroundSchema>;

/** A ready-to-render sample wedding-ish project using existing public/ assets. */
export const SAMPLE_PROJECT: Project = projectSchema.parse({
  background: { type: "motion", motion: "synthGrid" },
  clips: [
    {
      type: "image",
      src: "clip-a.svg",
      durationInFrames: 90,
      motion: "kenBurns",
      transitionToNext: { id: "dreamyZoom", durationInFrames: 24 },
    },
    { type: "image", src: "clip-b.svg", durationInFrames: 120, motion: "slowZoomIn" },
  ],
  overlays: [
    {
      type: "text",
      text: "Soranji",
      from: 12,
      durationInFrames: 96,
      x: 50,
      y: 28,
      fontSize: 120,
      color: "#ffffff",
      glow: "0 0 18px #ff2e88, 0 0 36px #ff2e88",
      motions: ["floatLoop", "neonGlow"],
      windowInFrames: 24,
    },
    {
      type: "image",
      src: "orange-mush.gif",
      from: 40,
      durationInFrames: 120,
      x: 76,
      y: 68,
      width: 200,
      motions: ["floatLoop", "pixelBob"],
      z: 0.45,
    },
  ],
});
