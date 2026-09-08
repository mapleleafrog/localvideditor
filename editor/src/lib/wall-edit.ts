// Wall authoring model — pure helpers shared by the store, the Wall view and the inspectors.
//
// No React, no store import (the store imports THIS), no DOM. Every camera/geometry statement is
// delegated to src/timeline/wall.ts, the module the renderer uses.
//
// TWO RULES THIS FILE EXISTS TO ENFORCE
//
// 1. zod defaults NEVER run on the `<Player inputProps>` path — Preview.tsx hands the raw store
//    object to the Player with no `projectSchema.parse`. So DEFAULT_WALL / DEFAULT_WALL_ITEM /
//    DEFAULT_SCENE write EVERY defaulted field explicitly; anything created here is already a
//    complete, renderable payload.
// 2. Every mutation is an IMMUTABLE REBUILD AT EVERY LEVEL. `patchClip` returns a new project
//    object, and BOTH zundo's throttled handleSet and the localStorage autosave compare by
//    reference — an in-place mutation of `wall.items` is invisible to undo AND never saves.
import type { Clip, Project, Wall, WallItem, WallScene } from "../../../src/timeline/schema";
import {
  fitAll,
  itemBox,
  sceneCam,
  scheduleWall,
  suggestGlideSeconds,
  wallFitFrames,
  type Cam,
} from "../../../src/timeline/wall";
import { clipStarts } from "./timeline-utils";

// ---------------------------------------------------------------------------------------------
// Defaults — every field explicit (see rule 1 above).
// ---------------------------------------------------------------------------------------------

export const DEFAULT_WALL_ITEM: WallItem = {
  type: "image",
  src: "",
  text: "",
  x: 0,
  y: 0,
  width: 560,
  rotation: 0,
  opacity: 1,
  depth: 1,
  frame: "none",
  caption: "",
  filter: "none",
  filterStrength: 1,
  motions: [],
  windowInFrames: 90,
  fontSize: 96,
  color: "#3a3226",
  align: "center",
  // Genuinely optional (no zod default, every reader does `?? fallback`) — listed so the full shape
  // is visible in one place: aspect, motionParams, playbackRate, alpha, seed, pixelated, flipX,
  // flipY, label, fontFamily.
};

/** A fresh item. Goes through this rather than a bare `{...DEFAULT_WALL_ITEM}` so `motions` is a NEW
 *  array every time — the default's array is a shared reference. */
export const newWallItem = (patch: Partial<WallItem> = {}): WallItem => ({
  ...DEFAULT_WALL_ITEM,
  motions: [],
  ...patch,
});

export const DEFAULT_SCENE: WallScene = {
  name: "",
  x: 0,
  y: 0,
  zoom: 1,
  rotation: 0,
  holdSeconds: 1.8,
  glideSeconds: 1.5,
  easing: "smooth",
  arc: 0,
};

export const DEFAULT_WALL: Wall = {
  items: [],
  scenes: [],
  paper: "cream",
  fibre: 1,
  finish: 1,
  breathing: 0.55,
  intro: true,
  introHoldSeconds: 0.8,
  outro: true,
  outroSeconds: 2.4,
  outroHoldSeconds: 1.5,
  viewfinder: false,
  handFont: "caveat",
  fitPadding: 0.06,
  timecodeOffsetInFrames: 0,
};

export const IDENTITY_CAM: Cam = { x: 0, y: 0, zoom: 1, rot: 0 };

/**
 * HARDENING, and why the editor needs its own.
 *
 * `Wall` / `WallItem` / `WallScene` are the POST-DEFAULT zod output types, so every field is
 * REQUIRED in TypeScript — but zod defaults never run on the `<Player inputProps>` path (rule 1 at
 * the top of this file), and the documented authoring route until now was hand-editing
 * `projects/*.json`. A legal, partially-specified file (`{"type":"wall","wall":{"items":[…],
 * "scenes":[{"x":100,"y":0,"zoom":1.2}]}}`) therefore reaches the editor with `undefined` where
 * tsc promises a number. The renderer copes (`finite()` at every read); a React `value={undefined}`
 * does not — the input flips to UNCONTROLLED and every derived readout prints NaN.
 *
 * So harden ONCE, at the single boundary every component already funnels through (`wallOf`).
 * Memoised by input reference in a WeakMap, which matters for more than speed: `authoringProject`
 * spreads the hardened wall, and `Wall.tsx` memoises on `wall.items` — a fresh array per call would
 * defeat both. Patching still goes through `rawWall` (see `withWall`), so hardening never writes
 * defaults back into the project JSON; only fields the user actually touches are persisted.
 */
const hardened = new WeakMap<Wall, Wall>();
export const hardenWall = (w: Wall): Wall => {
  const hit = hardened.get(w);
  if (hit) return hit;
  const out: Wall = {
    ...DEFAULT_WALL,
    ...w,
    // `motions` last and explicit: spreading the default's array would hand several items the SAME
    // array reference, which reads fine (everything here rebuilds) but is a trap waiting for the
    // first `.push`.
    items: (w.items ?? []).map((i) => ({ ...DEFAULT_WALL_ITEM, ...i, motions: i.motions ?? [] })),
    scenes: (w.scenes ?? []).map((s) => ({ ...DEFAULT_SCENE, ...s })),
  };
  hardened.set(w, out);
  // Idempotent: hardening the RESULT must hand back the same object, or a `wallOf(wallOf(x))`
  // anywhere in the tree would allocate a new items array and break the memo chain above.
  hardened.set(out, out);
  return out;
};

/** The wall payload of a clip, HARDENED (see above) — this is what every reader should use.
 *  Never returns the shared DEFAULT_WALL for mutation: callers rebuild, they never patch in place. */
export const wallOf = (c: Clip | undefined): Wall => hardenWall(c?.wall ?? DEFAULT_WALL);

/** The wall payload EXACTLY as stored — the patch path. Patches merge onto this, so hardening
 *  never silently writes a defaulted field the user never touched into the saved JSON. */
export const rawWall = (c: Clip | undefined): Wall => c?.wall ?? DEFAULT_WALL;

/** Deep copy. The wall payload is provably pure JSON (numbers/strings/booleans/arrays), so
 *  structuredClone is exact and cheap; a bare spread would leave two clips sharing one `items`. */
export const cloneWall = (w: Wall): Wall => structuredClone(w);

// ---------------------------------------------------------------------------------------------
// Immutable array helpers. Used by every store op so "rebuild at every level" is one call, not a
// convention someone has to remember.
// ---------------------------------------------------------------------------------------------

export const mapAt = <T>(arr: readonly T[], i: number, fn: (v: T) => T): T[] =>
  arr.map((v, k) => (k === i ? fn(v) : v));
export const removeAt = <T>(arr: readonly T[], i: number): T[] => arr.filter((_, k) => k !== i);
export const insertAt = <T>(arr: readonly T[], i: number, v: T): T[] => {
  const a = [...arr];
  a.splice(Math.max(0, Math.min(a.length, i)), 0, v);
  return a;
};
export const moveAt = <T>(arr: readonly T[], from: number, to: number): T[] => {
  const a = [...arr];
  if (from < 0 || from >= a.length) return a;
  const [moved] = a.splice(from, 1);
  a.splice(Math.max(0, Math.min(a.length, to)), 0, moved);
  return a;
};

/**
 * Rebuild a project with clip `ci`'s wall replaced by `fn(wall)`. Returns null when `ci` is not a
 * wall clip any more — every caller then no-ops rather than writing onto an unrelated clip (an undo
 * that reorders or removes clips while the Wall view is open must never mutate the wrong thing).
 */
export const withWall = (p: Project, ci: number, fn: (w: Wall) => Wall): Project | null => {
  const c = p.clips?.[ci];
  if (!c || c.type !== "wall") return null;
  // RAW, not hardened: a patch merges onto what is stored, so opening a hand-authored wall and
  // nudging one item does not rewrite the file with fifteen defaulted globals it never had.
  const next = fn(rawWall(c));
  return { ...p, clips: p.clips.map((cc, k) => (k === ci ? { ...cc, wall: next } : cc)) };
};

/** True when the clip at `ci` is a wall clip — the guard every async wall handler re-runs after an
 *  await, against a freshly read store. */
export const isWallClip = (p: Project, ci: number | null | undefined): ci is number =>
  typeof ci === "number" && p.clips?.[ci]?.type === "wall";

/** Index of the first wall clip, or -1. */
export const firstWallClip = (p: Project): number => (p.clips ?? []).findIndex((c) => c.type === "wall");

// ---------------------------------------------------------------------------------------------
// Scenes.
// ---------------------------------------------------------------------------------------------

/** Camera -> scene keyframe. `wallCam` is already in scene space, so "Set as scene" is a COPY, not
 *  a conversion: a hold segment returns the pose bit-exact (design §0.4). */
export const sceneFromCam = (cam: Cam, patch?: Partial<WallScene>): WallScene => ({
  ...DEFAULT_SCENE,
  x: cam.x,
  y: cam.y,
  zoom: cam.zoom,
  rotation: cam.rot,
  ...patch,
});

/** Scene keyframe -> camera (hardened the same way the renderer hardens it). */
export const camFromScene = (s: WallScene): Cam => sceneCam(s);

/** What `⊕ Set as scene` appends: the authoring pose, with a glide duration a motion designer would
 *  sign off (`suggestGlideSeconds` targets a peak px/second, so it is fps-independent). */
export const appendedScene = (wall: Wall, cam: Cam): WallScene => {
  const scenes = wall.scenes ?? [];
  const prev = scenes.length ? camFromScene(scenes[scenes.length - 1]) : cam;
  return sceneFromCam(cam, { glideSeconds: Math.round(suggestGlideSeconds(prev, cam) * 100) / 100 });
};

// ---------------------------------------------------------------------------------------------
// Items.
// ---------------------------------------------------------------------------------------------

/** Stable look seed (tape angles, torn ring, frame tint) — written ONCE at create time. A seed that
 *  carried a frame term would make the print boil. */
export const newSeed = () => (Math.random() * 1e9) | 0;

export interface NewItemOpts {
  x: number;
  y: number;
  /** Intrinsic w/h of the source (imageNaturalSize / videoNaturalSize). Omitted -> 1 at every read. */
  aspect?: number;
  /** OUTER card width in WALL units. */
  width?: number;
  frame?: WallItem["frame"];
  seed?: number;
  label?: string;
}

/** A dropped/imported asset as a wall item. `frame: "polaroid"` for images is the house default. */
export const newWallItemFromAsset = (src: string, o: NewItemOpts): WallItem => newWallItem({
  type: "image",
  src,
  x: Math.round(o.x),
  y: Math.round(o.y),
  width: Math.max(1, Math.round(o.width ?? DEFAULT_WALL_ITEM.width)),
  ...(o.aspect && Number.isFinite(o.aspect) && o.aspect > 0 ? { aspect: o.aspect } : {}),
  frame: o.frame ?? "polaroid",
  seed: o.seed ?? newSeed(),
  ...(o.label ? { label: o.label } : {}),
});

export const newWallTextItem = (text: string, o: { x: number; y: number; width?: number; fontSize?: number }): WallItem =>
  newWallItem({
    type: "text",
    text,
    x: Math.round(o.x),
    y: Math.round(o.y),
    width: Math.max(1, Math.round(o.width ?? 720)),
    fontSize: Math.max(1, Math.round(o.fontSize ?? DEFAULT_WALL_ITEM.fontSize)),
    frame: "none",
    seed: newSeed(),
  });

/** A copy of an item, offset by +24/+24 wall units with a fresh look seed (two identical seeds
 *  would give the duplicate the same tape angles and read as a rendering bug). */
export const duplicatedItem = (it: WallItem, dx = 24, dy = 24): WallItem => ({
  ...structuredClone(it),
  x: it.x + dx,
  y: it.y + dy,
  seed: newSeed(),
});

/** Import width, sized in SCREEN terms and stored in WALL units: a photo dropped while pulled out
 *  is not a speck, and a 4000 px scan does not swamp the wall. */
export const importWidth = (natW: number, compW: number, zoom: number): number => {
  const cap = (0.45 * compW) / Math.max(1e-6, zoom);
  const nat = natW > 0 ? natW : cap;
  return Math.max(1, Math.round(Math.min(nat, cap)));
};

/** Golden angle — a compact cluster with no random walk, so a batch lands reproducibly. */
export const GOLDEN_ANGLE = 2.399963229728653;

/**
 * Fan-out offset for the n-th item of a multi-file import, in WALL units.
 *
 * ONE implementation, because the constant was triplicated and two of the three copies divided by
 * `cam.zoom` a SECOND time — `importWidth` already returns wall units, so the ring spacing scaled
 * as 1/zoom: ten photos dropped at 3x landed essentially stacked, and at 0.2x they scattered across
 * two frame widths. The ratio of ring spacing to card width is a constant, by definition.
 */
export const spiralOffset = (n: number, width: number) => {
  const a = n * GOLDEN_ANGLE;
  const rad = 0.374 * width * Math.sqrt(n);
  return { x: rad * Math.cos(a), y: rad * Math.sin(a) };
};

/** Kana / kanji / fullwidth — Caveat has NO Japanese glyphs, so the inspector warns when a caption
 *  or text item contains any of these under a latin hand font. Written with \u escapes for the same
 *  reason wall.ts's CJK_RE is: the first range opens at U+3000 IDEOGRAPHIC SPACE, invisible in source. */
export const hasJapanese = (text: string): boolean =>
  /[\u3000-\u30FF\u3400-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/.test(text);

// ---------------------------------------------------------------------------------------------
// Clips.
// ---------------------------------------------------------------------------------------------

/** A new, empty wall clip whose duration already equals its (degenerate) schedule. Every clip field
 *  is explicit for the same reason the wall defaults are. */
export const newWallClip = (fps: number, W: number, H: number, wall: Wall = DEFAULT_WALL): Clip => ({
  type: "wall",
  src: "",
  durationInFrames: wallFitFrames(wall, fps, W, H),
  motion: "none",
  transitionToNext: "none",
  transitionDurationInFrames: 20,
  trimBefore: 0,
  trimAfter: 0,
  volume: 1,
  wall: cloneWall(wall),
});

// ---------------------------------------------------------------------------------------------
// The authoring loupe (design §0.4).
// ---------------------------------------------------------------------------------------------

/**
 * The derived project the Wall view's `<Player component={Timeline}>` renders: ONE synthetic scene
 * at the authoring camera, everything time-varying switched off.
 *
 * PURE, MEMOISED, NEVER STORED, NEVER UNDOABLE. The pixels under the drag handles are produced by
 * the shipping renderer, so an editor-only rendering bug cannot exist.
 *
 * The `wall` is SPREAD rather than rebuilt so `items` keeps its array identity — a useMemo keyed on
 * `wall.items` downstream then stays stable while the camera moves.
 *
 * Named, bounded divergences (design §8): breathing 0 freezes the handheld drift so items do not
 * crawl under the handles, intro/outro/viewfinder are off, and overlays/audio are emptied so titles
 * do not occlude the wall while arranging. Live mode swaps the real project back in.
 *
 * `finish: 0` is the FOURTH named divergence, and it is the one design §8's guarantee 5 ("overscan
 * cannot leak") did not cover. Overscan is a composition-size change, which keeps every ZOOM-
 * dependent term bit-identical — but the finish is a set of FULL-FRAME lens layers whose geometry is
 * a percentage of the composition (`inset: 0` + `radial-gradient(60% 45% at 22% 12%, …)`,
 * wall-paper.ts). At 1.6x the recorded rectangle spans 31.25%–68.75% of the canvas, so the bloom
 * hotspot at (22%, 12%) falls entirely OUTSIDE it and the vignette's outer stop is never reached
 * inside it: the MP4 would carry a warm top-left bloom and darkened corners that the bright
 * rectangle you framed against does not show. Grading against a lie is worse than not grading, so
 * the arrange viewport is neutral and ▶ Live (k = 1) shows the real finish.
 *
 * The paper's tiling phase diverges for the same reason (`paperSpan = ceil(hypot(W,H)) + 8` feeds
 * the background-position modulo), i.e. the procedural stains sit elsewhere in wall space under
 * overscan. That one is left as-is and documented rather than fixed: it is the PHASE of a
 * featureless texture, it cannot move an item or change a framing, and removing it would mean
 * threading a recorded-frame size through the renderer for an editor-only concern.
 */
export const authoringProject = (p: Project, ci: number, cam: Cam): Project => {
  const c = p.clips?.[ci];
  // The clip vanished (an undo reordered or removed it): render nothing rather than falling through
  // to the whole clip track, which would put unrelated footage under the drag handles.
  if (!c) return { ...p, overlays: [], audio: [], clips: [] };
  return {
    ...p,
    overlays: [],
    audio: [],
    clips: [
      {
        ...c,
        transitionToNext: "none",
        motion: "none",
        wall: {
          ...wallOf(c),
          breathing: 0,
          intro: false,
          outro: false,
          viewfinder: false,
          finish: 0,
          scenes: [sceneFromCam(cam, { holdSeconds: 1e5, glideSeconds: 0, arc: 0 })],
        },
      },
    ],
  };
};

// ---------------------------------------------------------------------------------------------
// Fit status — ONE function, surfaced in three places (the Scenes strip header, a badge on every
// wall block in the timeline, the Storyboard card). No auto-refit: the button is manual.
// ---------------------------------------------------------------------------------------------

export interface WallFitStatus {
  /** Index of the wall clip in project.clips. */
  clip: number;
  /** Absolute start frame — clipStarts()[i] IS the wall absStart contract (see timeline-utils). */
  start: number;
  /** Frames the camera schedule needs. */
  need: number;
  /** Frames the clip actually has. */
  have: number;
  state: "fit" | "short" | "long";
  /** Human-readable, ready for a chip/badge. */
  label: string;
}

export const wallFitStatus = (p: Project): WallFitStatus[] => {
  const fps = p.fps ?? 30;
  const W = p.width ?? 1920;
  const H = p.height ?? 1080;
  const starts = clipStarts(p);
  const out: WallFitStatus[] = [];
  (p.clips ?? []).forEach((c, i) => {
    if (c.type !== "wall") return;
    const need = wallFitFrames(wallOf(c), fps, W, H);
    const have = c.durationInFrames;
    const state: WallFitStatus["state"] = have === need ? "fit" : have < need ? "short" : "long";
    out.push({
      clip: i,
      start: starts[i] ?? 0,
      need,
      have,
      state,
      label:
        state === "fit"
          ? "✓ fit"
          : state === "short"
            ? `⚠ cuts the camera short by ${need - have}f`
            : `ⓘ holds the last framing for ${have - need}f`,
    });
  });
  return out;
};

export const wallFitFor = (p: Project, ci: number): WallFitStatus | null => {
  const c = p.clips?.[ci];
  if (!c || c.type !== "wall") return null;
  const fps = p.fps ?? 30;
  const need = wallFitFrames(wallOf(c), fps, p.width ?? 1920, p.height ?? 1080);
  const have = c.durationInFrames;
  const state: WallFitStatus["state"] = have === need ? "fit" : have < need ? "short" : "long";
  return {
    clip: ci,
    start: clipStarts(p)[ci] ?? 0,
    need,
    have,
    state,
    label:
      state === "fit"
        ? "✓ fit"
        : state === "short"
          ? `⚠ cuts the camera short by ${need - have}f`
          : `ⓘ holds the last framing for ${have - need}f`,
  };
};

/**
 * The ONE "⟲ Fit clip duration" patch, so the four buttons that offer it (the Inspector, the Scenes
 * strip, the clip context menu and the Storyboard card) cannot disagree.
 *
 * `project.durationInFrames`, when set, FIXES the video's length and caps how far any clip can be
 * extended (CLAUDE.md; TimelinePanel's `capDur` enforces it for every other retime path). Three of
 * the four fit buttons wrote `need` raw, so on a duration-capped project the same action produced
 * three different clip lengths.
 */
export const fitDurationPatch = (p: Project, ci: number): { durationInFrames: number } | null => {
  const fit = wallFitFor(p, ci);
  if (!fit) return null;
  const maxDur = p.durationInFrames && p.durationInFrames > 0 ? p.durationInFrames : Infinity;
  return { durationInFrames: Math.max(1, Math.min(maxDur, fit.need)) };
};

/** `12 items · 5 scenes · 31.1s` — the Storyboard card, the timeline block label, the strip header. */
export const wallSummary = (wall: Wall, fps: number, W: number, H: number) => {
  const items = (wall.items ?? []).length;
  const scenes = (wall.scenes ?? []).length;
  const frames = wallFitFrames(wall, fps, W, H);
  const seconds = frames / Math.max(1, fps);
  return {
    items,
    scenes,
    frames,
    seconds,
    text: `${items} item${items === 1 ? "" : "s"} · ${scenes} scene${scenes === 1 ? "" : "s"} · ${seconds.toFixed(1)}s`,
  };
};

/** Contribution breakdown for the Camera card: `intro 2.3s + scenes 24.4s + outro 3.9s = 31.1s`.
 *  Read straight off the schedule's own sceneFrames/sceneEnds arrays — never by segment search, so
 *  a dropped zero-length hold can't make a lookup fall through to frame 0. */
export const wallTiming = (wall: Wall, fps: number, W: number, H: number) => {
  const sched = scheduleWall(wall, fps, W, H);
  const f = Math.max(1, sched.fps);
  const n = sched.sceneFrames.length;
  const first = n ? sched.sceneFrames[0] : sched.total;
  const last = n ? sched.sceneEnds[n - 1] : sched.total;
  return {
    intro: first / f,
    scenes: Math.max(0, last - first) / f,
    outro: Math.max(0, sched.total - last) / f,
    total: sched.total / f,
    frames: sched.total,
  };
};

// ---------------------------------------------------------------------------------------------
// Batch arrange — the shortest path from a folder of photos to a finished camera montage.
// ---------------------------------------------------------------------------------------------

export interface ScatterRef {
  src: string;
  /** Intrinsic w/h, if the caller measured it. */
  aspect?: number;
  label?: string;
}

export interface ScatterOpts {
  /** Recorded frame size — the scenes are framed against it (NOT the overscanned one). */
  W: number;
  H: number;
  /** Cluster grid. */
  columns?: number;
  /** Wall units between cluster centres. */
  pitch?: number;
  /** Items per cluster. */
  perCluster?: number;
  /** Card width in wall units. */
  width?: number;
  fps?: number;
}

/** Deterministic 32-bit hash — so a batch arrange is reproducible (the same photos land the same
 *  way twice) while every item still gets a distinct look seed. */
const hash = (s: string, salt: number) => {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 1000000007;
};

/**
 * Lay `refs` out as a grid of clusters and generate ONE scene per cluster, framed by the same
 * `fitAll` the intro/outro use, timed by `suggestGlideSeconds`. Deterministic: no Math.random for
 * any position, so the arrangement is reproducible.
 */
export const scatterIntoWall = (refs: ScatterRef[], opts: ScatterOpts): Wall => {
  const columns = Math.max(1, Math.round(opts.columns ?? 4));
  const pitch = opts.pitch ?? 980;
  const perCluster = Math.max(1, Math.round(opts.perCluster ?? 6));
  const width = Math.max(1, Math.round(opts.width ?? 460));
  const pad = DEFAULT_WALL.fitPadding;

  const items: WallItem[] = [];
  const clusters: WallItem[][] = [];

  refs.forEach((r, i) => {
    const ci = Math.floor(i / perCluster);
    const cx = (ci % columns) * pitch;
    const cy = Math.floor(ci / columns) * pitch;
    // Golden-angle phyllotaxis: a compact, non-overlapping-ish cluster with no random walk.
    const k = i % perCluster;
    const off = spiralOffset(k, width);
    const seed = hash(r.src, i);
    const it: WallItem = newWallItemFromAsset(r.src, {
      x: cx + off.x,
      y: cy + off.y,
      width,
      aspect: r.aspect,
      seed,
      label: r.label,
    });
    // A hand-pinned wall is never perfectly square; +-6 degrees, deterministic per item.
    const item: WallItem = { ...it, rotation: (seed % 1200) / 100 - 6 };
    items.push(item);
    if (!clusters[ci]) clusters[ci] = [];
    clusters[ci].push(item);
  });

  const scenes: WallScene[] = [];
  let prev: Cam | null = null;
  clusters.forEach((group) => {
    if (!group.length) return;
    const cam = fitAll(group, opts.W, opts.H, pad);
    const glide = prev ? Math.round(suggestGlideSeconds(prev, cam) * 100) / 100 : DEFAULT_SCENE.glideSeconds;
    scenes.push(sceneFromCam(cam, { glideSeconds: glide }));
    prev = cam;
  });

  return { ...DEFAULT_WALL, items, scenes };
};

/** Re-export so callers that already import wall-edit don't have to reach into wall.ts too. */
export { fitAll, itemBox, wallFitFrames, scheduleWall, suggestGlideSeconds };
export type { Cam };
