// Wall mode — the camera instrument. PURE MATHS.
//
// No React, no DOM, no frame reads, no Math.random, no Date, and NO 1920/1080 default anywhere:
// `W` and `H` are always parameters (a vertical project must work). This module is the single
// authority shared by the renderer (WallClip.tsx), the editor (gestures, Fit buttons, minimap,
// scene strip) and `npm run check:wall`, so there is exactly one implementation of the geometry.
//
// The schema is imported with `import type` ONLY — check-wall.mjs bundles this file with esbuild
// and must not pull in zod or the effects registry.
//
// Three load-bearing rules (see scratchpad wall-design §0):
//   1. Every easing satisfies e(0)=0, e(1)=1, e'(0)=e'(1)=0 — there is deliberately no `linear`.
//      Camera velocity is therefore continuous at every hold<->glide junction, which is what lets
//      the breathing damping, the paper-fibre gain and the bloom lift all be derived from the
//      camera's own instantaneous speed with no ramps, no state and no boundary special-casing.
//   2. Parallax is POSITION-ONLY: an item at depth d renders inside a layer scaled by zoom*d and
//      cancels the size change with its own scale(1/d). Depth changes how much a thing DRIFTS,
//      never how big it IS — which is also why fit-all has a closed form.
//   3. Fit-all is an EXACT convex 1-D solve per axis, not a two-pass AABB (the naive version
//      leaves content outside the frame in ~50% of walls with mixed depths).
import type { Wall, WallItem, WallScene } from "./schema";

// ---------------------------------------------------------------------------------------------
// Loose input types.
//
// zod defaults DO NOT run on the `<Player inputProps>` path (Preview.tsx hands the raw store
// object straight to the Player), so every field is read `?? default` here. These all-optional
// shapes make that legitimate rather than dead code; the schema types are assignable to them
// (asserted below at compile time).
// ---------------------------------------------------------------------------------------------

export interface WallItemLike {
  type?: string;
  src?: string;
  text?: string;
  x?: number;
  y?: number;
  width?: number;
  aspect?: number;
  rotation?: number;
  depth?: number;
  frame?: string;
  fontSize?: number;
  /** Scene timing refs (scene ids). Unset / unknown = always on the wall. */
  appearIn?: string;
  appearDelaySeconds?: number;
  leaveAfter?: string;
}

export interface WallSceneLike {
  id?: string;
  hover?: string;
  hoverAmount?: number;
  x?: number;
  y?: number;
  zoom?: number;
  rotation?: number;
  holdSeconds?: number;
  glideSeconds?: number;
  easing?: string;
  arc?: number;
}

export interface WallLike {
  items?: WallItemLike[];
  scenes?: WallSceneLike[];
  intro?: boolean;
  introHoldSeconds?: number;
  outro?: boolean;
  outroSeconds?: number;
  outroHoldSeconds?: number;
  fitPadding?: number;
}

/** Compile-time proof that the schema shapes satisfy the loose shapes this module consumes.
 *  `Assert<false>` is a type ERROR, so a schema field whose type stopped matching fails `tsc`
 *  instead of silently evaluating to `never` (which a bare conditional alias would do). */
type Assert<T extends true> = T;
export type WallShapesAssignable = Assert<
  Wall extends WallLike ? (WallItem extends WallItemLike ? (WallScene extends WallSceneLike ? true : false) : false) : false
>;

export interface Cam {
  x: number;
  y: number;
  zoom: number;
  rot: number;
}

export interface Box {
  w: number;
  h: number;
}

// ---------------------------------------------------------------------------------------------
// Small pure helpers (local — this module has no dependencies).
// ---------------------------------------------------------------------------------------------

const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
/** Endpoint-exact lerp: at t=0 returns `a`, at t=1 returns `b`, bit-exactly. */
const mix = (a: number, b: number, t: number) => (1 - t) * a + t * b;
const smooth = (t: number) => t * t * (3 - 2 * t);
/** `?? default` is not enough: zod defaults never run on the `<Player inputProps>` path and the
 *  editor's number fields yield NaN for an emptied input, so every numeric read goes through this.
 *  Exported because WallClip.tsx must harden the SAME fields — otherwise an item's geometry would be
 *  computed at (0,0) while its DOM emitted `left: NaNpx`, i.e. the two would disagree instead of
 *  both degrading. */
export const finite = (v: unknown, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

/** Signed shortest angular difference u -> v, in (-180, 180]. */
export const shortAngle = (u: number, v: number) => (((v - u + 180) % 360) + 360) % 360 - 180;
/** Normalise an angle into [-180, 180) — the same convention CanvasOverlay/ContextMenu use. */
export const normAngle = (deg: number) => (((deg + 180) % 360) + 360) % 360 - 180;

// ---------------------------------------------------------------------------------------------
// 1. The four eases. e(0)=0, e(1)=1, e'(0)=e'(1)=0 for all of them — measured, not asserted
//    (check:wall group 1). There is no `linear` precisely so the invariant is absolute.
//
//    `smooth` (the DEFAULT) additionally has e''(0)=e''(1)=0: zero ACCELERATION at both ends. A
//    sine ease has zero velocity at the ends but its acceleration PEAKS there (0.5*pi^2*cos(pi p)),
//    so the camera departs and lands with a shove — that is exactly the "forceful arrival" a viewer
//    feels. The quintic smootherstep 6p^5 - 15p^4 + 10p^3 ramps acceleration from zero, so a glide
//    eases in and eases out with no perceptible onset. It is a little faster mid-glide at equal
//    duration (1.875 vs 1.571), which suggestGlideSeconds accounts for.
//
//      ease    peak slope           overshoot        endpoint accel
//      smooth  1.8750 @ p=0.500     none             0 (C2)         <- default
//      sine    1.5708 @ p=0.500     none             +-4.93 (C1)
//      cubic   3.0000 @ p=0.500     none             +-12 (C1)      (a SNAP ease)
//      settle  1.8780 @ p=0.544     +2.51% @ p=0.878 +-4.93 (C1)    (use only at >= 1.0 s)
//      gentle  2.1875 @ p=0.500     none             0 (C3)         (septic: longer dwell at both ends,
//                                                                    so the middle is faster — "more ease")
// ---------------------------------------------------------------------------------------------

export type EaseId = "smooth" | "gentle" | "sine" | "cubic" | "settle";
export const EASE_IDS: readonly EaseId[] = ["smooth", "gentle", "sine", "cubic", "settle"];
export const DEFAULT_EASE: EaseId = "smooth";

/** Overshoot amplitude of `settle`. A polynomial term that vanishes to 2nd order at BOTH ends. */
export const SETTLE_A = 9;

export const EASE: Record<EaseId, (p: number) => number> = {
  smooth: (p) => p * p * p * (p * (p * 6 - 15) + 10),
  // Septic smootherstep: zero velocity, acceleration AND jerk at both ends.
  gentle: (p) => p * p * p * p * (p * (p * (p * -20 + 70) - 84) + 35),
  sine: (p) => 0.5 - 0.5 * Math.cos(Math.PI * p),
  cubic: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
  settle: (p) => 0.5 - 0.5 * Math.cos(Math.PI * p) + SETTLE_A * Math.pow(p, 6) * Math.pow(1 - p, 2),
};

export const ease = (id: string | undefined, p: number): number =>
  (EASE[(id ?? DEFAULT_EASE) as EaseId] ?? EASE[DEFAULT_EASE])(clamp(p));

// ---------------------------------------------------------------------------------------------
// 2. Item geometry. `itemBox` is the treatment-inclusive OUTER box, and it is AUTHORITATIVE:
//    the same function drives fit-all, the frustum cull, the renderer's DOM box and the editor's
//    selection handles, so a polaroid's handles hug its card instead of sitting inside it.
//    Nothing measures the DOM — a measured aspect would make the framing depend on image load
//    state, which is nondeterministic across preview and render.
// ---------------------------------------------------------------------------------------------

const ASPECT_MIN = 0.2;
const ASPECT_MAX = 5;
export const itemAspect = (it: WallItemLike) => {
  const a = it.aspect;
  return typeof a === "number" && Number.isFinite(a) && a > 0 ? clamp(a, ASPECT_MIN, ASPECT_MAX) : 1;
};

/** Parallax factor, clamped to the schema's own range. */
export const itemDepth = (it: WallItemLike) => clamp(finite(it.depth, 1), 0.2, 3);

/** Kana / kanji / fullwidth — a CJK glyph is a full em wide, a latin one about half.
 *  Written with \u escapes on purpose: the first range opens at U+3000 IDEOGRAPHIC SPACE, and a
 *  literal one is invisible in source (and trips eslint no-irregular-whitespace). */
const CJK_RE = /[\u3000-\u30FF\u3400-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/;

/** Advance width of ONE line, in em. Costed PER CHARACTER rather than per string: a single `per`
 *  applied to a whole mixed line charged every latin glyph a full em and over-estimated
 *  "ありがとう / All our love" by 2x. Pure-latin and pure-CJK strings are unchanged by construction. */
const lineEms = (seg: string) => {
  let u = 0;
  for (const ch of seg) u += CJK_RE.test(ch) ? 1.0 : 0.52;
  return u;
};

/** Polaroid margins as fractions of the OUTER width: sides/top and the fat bottom margin.
 *  The ONE source for wall-paper.ts (chrome), itemBox (geometry) and check:wall (group 13).
 *  A real Polaroid 600 is 5.7 % / 25.7 %; 6 / 24 keeps that proportion with a caption still legible. */
export const POLAROID = { side: 0.06, bottom: 0.24 } as const;

export const itemBox = (it: WallItemLike): Box => {
  const w = Math.max(1, finite(it.width, 560));
  if ((it.type ?? "image") === "text") {
    // Deterministic and authoritative: the DOM renders the text block at EXACTLY box.h
    // (flex-centred, overflow visible), so the selection box and the rendered box agree by
    // construction and there is no measuring path to go stale.
    //
    // WallClip.tsx renders the block with `white-space: pre-wrap`, so an explicit "\n" FORCES a break.
    // Costing the whole string in ONE ceil() ignored that (a 5-line poem measured as one line, and
    // every text item in the demo project carries a "\n"), so hard lines are split first and each
    // wraps on its own. Deviation from design §1's single-ceil formula, in service of the F-9
    // guarantee that formula exists to provide.
    const fs = Math.max(1, finite(it.fontSize, 96));
    const text = it.text ?? "";
    const lines = text.split("\n").reduce((n, seg) => n + Math.max(1, Math.ceil((fs * lineEms(seg)) / w)), 0);
    return { w, h: Math.max(1, lines) * fs * 1.18 };
  }
  const inner = w / itemAspect(it);
  switch (it.frame ?? "none") {
    // polaroid: POLAROID.side sides/top, POLAROID.bottom bottom  |  matte: 9% all round
    case "polaroid":
      return { w, h: (1 - 2 * POLAROID.side) * inner + (POLAROID.side + POLAROID.bottom) * w };
    case "matte":
      return { w, h: 0.82 * inner + 0.18 * w };
    // `taped` tape overhangs visually but is not part of the hit box; `torn` deckles inward.
    default:
      return { w, h: inner };
  }
};

/** Half-extents of the item's rotated AABB, in WALL units. */
export const itemHalfExtents = (it: WallItemLike) => {
  const { w, h } = itemBox(it);
  const r = (finite(it.rotation, 0) * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  return { hx: (c * w + s * h) / 2, hy: (s * w + c * h) / 2 };
};

// ---------------------------------------------------------------------------------------------
// 3. Camera transform and coordinate mapping.
//
//   CAM(cam, d) = translate(W/2, H/2) rotate(-rot) scale(zoom*d) translate(-cam.x, -cam.y)
//
//   screen centre = C + R(-rot) * (zoom*d) * (p - cam)   <- drifts d x as fast
//   screen size   = box * zoom                           <- INDEPENDENT of d (the item cancels 1/d)
//
// Angle convention (a classic sign bug, stated once): a wall vector at angle phi appears on
// screen at phi - cam.rot. So the editor draws a selection frame at rotate(item.rotation - cam.rot)
// and its rotate gesture writes item.rotation = normAngle(screenAngle + cam.rot).
//
// NOTHING rounds a camera coordinate. Rounding happens only when a transform string is emitted
// (a deterministic function of the inputs, so preview and render agree byte-for-byte) and in
// editor readouts. Integer camera coordinates would step visibly on a slow 0.6 s glide.
// ---------------------------------------------------------------------------------------------

export const layerTransform = (cam: Cam, d: number, W: number, H: number) =>
  `translate(${W / 2}px, ${H / 2}px) rotate(${(-cam.rot).toFixed(4)}deg) ` +
  `scale(${(cam.zoom * d).toFixed(6)}) translate(${(-cam.x).toFixed(3)}px, ${(-cam.y).toFixed(3)}px)`;

export const wallToScreen = (p: { x: number; y: number }, cam: Cam, d: number, W: number, H: number) => {
  const k = cam.zoom * d;
  const th = (cam.rot * Math.PI) / 180;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const u = (p.x - cam.x) * k;
  const v = (p.y - cam.y) * k;
  return { x: W / 2 + (u * c + v * s), y: H / 2 + (-u * s + v * c) };
};

export const screenToWall = (q: { x: number; y: number }, cam: Cam, d: number, W: number, H: number) => {
  const k = Math.max(1e-9, cam.zoom * d);
  const th = (cam.rot * Math.PI) / 180;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const u = (q.x - W / 2) / k;
  const v = (q.y - H / 2) / k;
  return { x: cam.x + (u * c - v * s), y: cam.y + (u * s + v * c) };
};

/** Screen-space placement of an item's OUTER box: centre, size and on-screen angle.
 *  Size is `box * zoom` — position-only parallax means depth never enters it. */
export const itemScreenBox = (it: WallItemLike, cam: Cam, W: number, H: number) => {
  const b = itemBox(it);
  const c = wallToScreen({ x: finite(it.x, 0), y: finite(it.y, 0) }, cam, itemDepth(it), W, H);
  return {
    cx: c.x,
    cy: c.y,
    w: b.w * cam.zoom,
    h: b.h * cam.zoom,
    /** Degrees, already camera-relative — draw handles with rotate(angle). */
    angle: finite(it.rotation, 0) - cam.rot,
  };
};

/** Frustum cull: is the item's rotated screen AABB within the frame + `pad` (fraction of W/H)?
 *  Culled items get `visibility:hidden` and are NEVER unmounted — unmounting would drop and
 *  re-acquire <Img>/<Gif> delayRender handles mid-render and force GIF re-decodes. */
export const visibleAt = (it: WallItemLike, cam: Cam, W: number, H: number, pad = 0.25) => {
  const b = itemScreenBox(it, cam, W, H);
  const r = (b.angle * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  const hx = (c * b.w + s * b.h) / 2;
  const hy = (s * b.w + c * b.h) / 2;
  const px = W * pad;
  const py = H * pad;
  return b.cx + hx >= -px && b.cx - hx <= W + px && b.cy + hy >= -py && b.cy - hy <= H + py;
};

// ---------------------------------------------------------------------------------------------
// 4. Fit-all — an EXACT convex 1-D solve, not a two-pass AABB.
//
// Fit-all always uses rot = 0, so x and y separate. With position-only parallax the required
// half-width at a candidate centre c is
//
//     Hx(c) = max_i [ d_i * |p_i.x - c| + hw_i ]
//
// a maximum of absolute-affine functions, therefore convex piecewise-linear with a unique
// minimising interval. Ternary search (80 iterations shrinks the bracket by (2/3)^80 ~ 1e-14)
// finds it deterministically; same for y; then zoom is bounded independently by each axis:
//
//     zoom = min( (W/2)(1-pad) / Hx(cx*),  (H/2)(1-pad) / Hy(cy*) )
//
// Fuzzed over 20 000 random walls at the schema's own depth range, worst-case frame usage is
// exactly 1 - pad — i.e. the solve is TIGHT, not merely safe. The two-pass heuristic every
// earlier draft used left content outside the frame in 49.5% of those walls (worst 4.62x).
// ---------------------------------------------------------------------------------------------

const ternary = (f: (c: number) => number, lo0: number, hi0: number) => {
  let lo = lo0;
  let hi = hi0;
  for (let i = 0; i < 80; i++) {
    const third = (hi - lo) / 3;
    const a = lo + third;
    const b = hi - third;
    if (f(a) <= f(b)) hi = b;
    else lo = a;
  }
  return (lo + hi) / 2;
};

/** Whole-wall pose: the intro, the outro, `F` = Fit all, the minimap viewBox and every scene
 *  thumbnail. `rot` is always 0. An empty wall fits at the origin at zoom 1. */
export const fitAll = (items: WallItemLike[] | undefined, W: number, H: number, pad = 0.06): Cam => {
  const list = items ?? [];
  if (!list.length) return { x: 0, y: 0, zoom: 1, rot: 0 };
  const pts = list.map((it) => {
    const e = itemHalfExtents(it);
    return { x: finite(it.x, 0), y: finite(it.y, 0), d: itemDepth(it), hx: e.hx, hy: e.hy };
  });
  const p = clamp(pad, 0, 0.4);

  const needX = (c: number) => pts.reduce((m, q) => Math.max(m, q.d * Math.abs(q.x - c) + q.hx), 0);
  const needY = (c: number) => pts.reduce((m, q) => Math.max(m, q.d * Math.abs(q.y - c) + q.hy), 0);

  const xs = pts.map((q) => q.x);
  const ys = pts.map((q) => q.y);
  const cx = ternary(needX, Math.min(...xs), Math.max(...xs));
  const cy = ternary(needY, Math.min(...ys), Math.max(...ys));

  const hx = needX(cx);
  const hy = needY(cy);
  const zx = hx > 1e-9 ? ((W / 2) * (1 - p)) / hx : Infinity;
  const zy = hy > 1e-9 ? ((H / 2) * (1 - p)) / hy : Infinity;
  const z = Math.min(zx, zy);
  // A wall of zero-size items has no scale of its own; cap so the pose stays finite.
  return { x: cx, y: cy, zoom: Number.isFinite(z) ? Math.max(1e-6, z) : 1, rot: 0 };
};

// ---------------------------------------------------------------------------------------------
// 5. The schedule.
//
//   [intro hold on `whole`] [intro glide] hold(0) glide(1) hold(1) ... hold(n-1) [outro glide] [outro hold]
//
// - scenes[0].glideSeconds IS the intro glide, used only when `intro` is on.
// - holdSeconds 0 => a "via" scene (flow through, no stop). glideSeconds 0 => a hard cut.
// - ALL segment boundaries are integers, accumulated as integers, so segments tile [0, total)
//   with no gap, no overlap and no fractional drift. There is no Math.ceil in this module —
//   `total` is the sum of the rounded lengths by construction.
// - Glide segments carry RESOLVED poses a/b, so intro (from `whole`) and outro (to `whole`) run
//   through the identical interpolator with no index special-casing downstream. A dropped
//   zero-length segment therefore leaves a POSE-CHAIN BREAK, and that break IS the hard cut:
//   `segs[i].b !== segs[i+1].a` is the exact, structural definition of one. (A scene that is BOTH
//   a via and a cut — holdSeconds 0 AND glideSeconds 0 — is an instantaneous waypoint: the camera
//   cuts to it and leaves in the same frame. Degenerate but coherent, and the authored path is
//   preserved rather than silently rerouted around the scene.)
// ---------------------------------------------------------------------------------------------

export interface WallSeg {
  kind: "hold" | "glide";
  /** Inclusive start / exclusive end, clip-local frames. */
  from: number;
  to: number;
  a: Cam;
  b: Cam;
  easing: EaseId;
  arc: number;
  /** Scene this segment holds on / glides into; -1 for the whole-wall intro/outro segments. */
  scene: number;
  /** True when this segment is on or toward the whole-wall fit pose. */
  whole: boolean;
}

export interface WallSchedule {
  segs: WallSeg[];
  total: number;
  whole: Cam;
  fps: number;
  /** Frame each scene is ARRIVED at / LEFT. Filled DURING construction, so a dropped zero-length
   *  hold can never make a lookup fall through to frame 0. */
  sceneFrames: number[];
  sceneEnds: number[];
}

export const sceneCam = (s: WallSceneLike): Cam => ({
  x: finite(s.x, 0),
  y: finite(s.y, 0),
  zoom: Math.max(1e-4, finite(s.zoom, 1)),
  rot: finite(s.rotation, 0),
});

/** Hover (slow drift during a hold) gains at amount 1: +6 % zoom for a push-in, 140 screen px for
 *  a pan. Small on purpose — a hover is felt, not seen; the glide is the move. */
export const HOVER_ZOOM = 0.06;
export const HOVER_PAN_PX = 140;

/** The pose a scene's hold ENDS on: the authored pose drifted by its hover. Identity when the
 *  scene has no hover, so a still hold stays bit-exact and every downstream glide is unchanged.
 *  `next` is where the following glide goes (the next scene, or the whole-wall outro pose) —
 *  only `toward` reads it: a creep along that direction, or along its zoom when there is no
 *  travel; identity when there is nowhere to go (last scene, no outro). */
export const sceneHoverCam = (s: WallSceneLike, next?: Cam): Cam => {
  const c = sceneCam(s);
  const k = clamp(finite(s.hoverAmount, 0.5), 0, 1);
  const pan = (HOVER_PAN_PX * k) / c.zoom; // screen px -> wall units at this zoom
  switch (s.hover) {
    case "toward": {
      if (!next) return c;
      const dx = next.x - c.x;
      const dy = next.y - c.y;
      const d = Math.hypot(dx, dy);
      if (d > 1e-6) {
        // Never overshoot a short hop: creep at most a third of the way there.
        const step = Math.min(pan, d / 3);
        return { ...c, x: c.x + (dx / d) * step, y: c.y + (dy / d) * step };
      }
      if (next.zoom > c.zoom) return { ...c, zoom: c.zoom * (1 + HOVER_ZOOM * k) };
      if (next.zoom < c.zoom) return { ...c, zoom: c.zoom / (1 + HOVER_ZOOM * k) };
      return c;
    }
    case "pushIn":
      return { ...c, zoom: c.zoom * (1 + HOVER_ZOOM * k) };
    case "pullOut":
      return { ...c, zoom: c.zoom / (1 + HOVER_ZOOM * k) };
    case "left":
      return { ...c, x: c.x - pan };
    case "right":
      return { ...c, x: c.x + pan };
    case "up":
      return { ...c, y: c.y - pan };
    case "down":
      return { ...c, y: c.y + pan };
    default:
      return c;
  }
};

const easeIdOf = (v: string | undefined): EaseId =>
  v === "gentle" || v === "sine" || v === "cubic" || v === "settle" ? v : DEFAULT_EASE;

export const scheduleWall = (wall: WallLike | undefined, fps: number, W: number, H: number): WallSchedule => {
  const w = wall ?? {};
  const f = Math.max(1, Math.round(finite(fps, 30)));
  const whole = fitAll(w.items, W, H, clamp(finite(w.fitPadding, 0.06), 0, 0.4));
  const scenes = w.scenes ?? [];

  const segs: WallSeg[] = [];
  const sceneFrames = new Array<number>(scenes.length).fill(0);
  const sceneEnds = new Array<number>(scenes.length).fill(0);
  let cur = 0;
  const push = (seg: Omit<WallSeg, "from" | "to">, len: number) => {
    if (len <= 0) return; // zero-length segments are DROPPED, never emitted
    segs.push({ ...seg, from: cur, to: cur + len });
    cur += len;
  };
  const holdLen = (sec: number | undefined) => Math.max(0, Math.round(finite(sec, 0) * f));
  // A positive but tiny glide still gets at least one frame; EXACTLY 0 is a hard cut (dropped).
  const glideLen = (sec: number | undefined) => {
    const s = finite(sec, 0);
    return s <= 0 ? 0 : Math.max(1, Math.round(s * f));
  };
  const wholeSeg = (kind: "hold" | "glide", a: Cam, b: Cam, scene: number, easing: EaseId = DEFAULT_EASE) =>
    ({ kind, a, b, easing, arc: 0, scene, whole: true }) as const;

  if (scenes.length) {
    const poses = scenes.map(sceneCam);
    // Where each scene's hold ENDS (its hover drift) — the pose the NEXT glide departs from. A via
    // scene (hold 0) has no hold segment, so nothing drifts and the glide leaves the authored pose.
    const nextOf = (i: number): Cam | undefined => (i + 1 < poses.length ? poses[i + 1] : (w.outro ?? true) ? whole : undefined);
    const ends = scenes.map((s, i) => (holdLen(s.holdSeconds ?? 1.8) > 0 ? sceneHoverCam(s, nextOf(i)) : poses[i]));
    if (w.intro ?? true) {
      push(wholeSeg("hold", whole, whole, -1), holdLen(w.introHoldSeconds ?? 0.8));
      push(
        { kind: "glide", a: whole, b: poses[0], easing: easeIdOf(scenes[0].easing), arc: clamp(finite(scenes[0].arc, 0), -1, 1), scene: 0, whole: true },
        glideLen(scenes[0].glideSeconds ?? 1.5),
      );
    }
    for (let i = 0; i < scenes.length; i++) {
      const s = scenes[i];
      if (i > 0) {
        push(
          { kind: "glide", a: ends[i - 1], b: poses[i], easing: easeIdOf(s.easing), arc: clamp(finite(s.arc, 0), -1, 1), scene: i, whole: false },
          glideLen(s.glideSeconds ?? 1.5),
        );
      }
      sceneFrames[i] = cur;
      // A hold drifts from the authored pose to its hover pose (b === a when there is no hover).
      push({ kind: "hold", a: poses[i], b: ends[i], easing: easeIdOf(s.easing), arc: 0, scene: i, whole: false }, holdLen(s.holdSeconds ?? 1.8));
      sceneEnds[i] = cur;
    }
    if (w.outro ?? true) {
      push(wholeSeg("glide", ends[ends.length - 1], whole, -1), glideLen(w.outroSeconds ?? 2.4));
      push(wholeSeg("hold", whole, whole, -1), holdLen(w.outroHoldSeconds ?? 1.5));
    }
  }

  // No scenes, or every segment collapsed to zero length: hold on the WHOLE-WALL pose, never on
  // the wall origin. A fresh wall clip with items scattered around (2000, 900) frames those
  // items, not blank paper at (0,0).
  if (!segs.length) push(wholeSeg("hold", whole, whole, -1), f);

  return { segs, total: cur, whole, fps: f, sceneFrames, sceneEnds };
};

/** The "Fit duration to scenes" target, and the only length authority. `clip.durationInFrames`
 *  remains the mount window; `calculateTimelineMetadata` is not involved. */
export const wallFitFrames = (wall: WallLike | undefined, fps: number, W: number, H: number) =>
  Math.max(1, scheduleWall(wall, fps, W, H).total);

// ---------------------------------------------------------------------------------------------
// Per-object scene timing ("appears in scene N" / "leaves after scene M").
//
// Objects are on the wall for the whole clip by default. An item that names a scene by `id` is
// hidden until the camera ARRIVES at that scene (`sceneFrames[i]`, plus an optional stagger) and,
// when it also names a `leaveAfter` scene, hidden again once that scene's hold ENDS
// (`sceneEnds[j]`). Both refs resolve by id so a reorder never re-targets an object; an unknown id
// is treated as unset (never as "hidden forever").
// ---------------------------------------------------------------------------------------------

/** Index of the scene with this id, or -1 when unset / unknown. */
export const sceneIndexById = (wall: WallLike | undefined, id: string | undefined): number => {
  if (!id) return -1;
  const scenes = wall?.scenes ?? [];
  for (let i = 0; i < scenes.length; i++) if (scenes[i].id === id) return i;
  return -1;
};

export interface ItemWindow {
  /** Inclusive first visible clip-local frame. */
  from: number;
  /** Exclusive last visible frame; Infinity when the object never leaves. */
  to: number;
}

/** The clip-local frame window an item is visible in, or null = always visible (no scene refs).
 *  `from` is clamped to `to`, so a reversed pair (leave before appear, or a stagger past the
 *  leave frame) degrades to an EMPTY window rather than a negative one. */
export const itemWindow = (sched: WallSchedule, wall: WallLike | undefined, it: WallItemLike): ItemWindow | null => {
  const i = sceneIndexById(wall, it.appearIn);
  const j = sceneIndexById(wall, it.leaveAfter);
  if (i < 0 && j < 0) return null;
  const delay = Math.max(0, Math.round(Math.max(0, finite(it.appearDelaySeconds, 0)) * sched.fps));
  const to = j >= 0 ? finite(sched.sceneEnds[j], 0) : Infinity;
  const from = Math.min(i >= 0 ? finite(sched.sceneFrames[i], 0) + delay : 0, to);
  return { from, to };
};

/** Editor hint predicate (no schedule needed): is the item visible while the camera holds on
 *  scene `j`? Ignores the stagger — agrees with `itemWindow` at `sceneFrames[j]` when delay is 0. */
export const itemVisibleInScene = (wall: WallLike | undefined, it: WallItemLike, j: number): boolean => {
  const a = sceneIndexById(wall, it.appearIn);
  const l = sceneIndexById(wall, it.leaveAfter);
  if (a >= 0 && j < a) return false;
  if (l >= 0 && j > l) return false;
  if (a >= 0 && l >= 0 && l < a) return false;
  return true;
};

/** Index of the segment covering `frame`; frames past `total` park on the last segment. */
export const segIndexAt = (sched: WallSchedule, frame: number) => {
  const segs = sched.segs;
  if (!segs.length) return -1;
  if (frame < segs[0].from) return 0;
  for (let i = 0; i < segs.length; i++) if (frame < segs[i].to) return i;
  return segs.length - 1;
};

// ---------------------------------------------------------------------------------------------
// 6. Glide — four decoupled channels.
//
// Path and timing are separated: the easing is the SPEED GRAPH along a fixed spatial path, and
// `arc` defines that path. Every spatial term is evaluated at the EASED ep, so the bow peaks at
// half-DISTANCE, not half-TIME.
// ---------------------------------------------------------------------------------------------

/** Perpendicular offset of the Bezier control point, as a fraction of chord length. */
export const ARC_GAIN = 0.22;
/** Zoom leads position by 10% — a real operator sizes the frame first and lets the pan settle. */
export const ZOOM_LEAD = 0.1;
/** Mid-glide pull-back: reads as lift/travel/land AND reduces optical flow at the fastest instant.
 *  Kept small: at 0.075 the dip read as a "push" into every scene; 0.035 is felt, not seen. */
export const LIFT_GAIN = 0.035;

/** Asymmetric lift envelope: peak 1.0 @ p=0.4424, EXACT 0 at both ends with ~0 endpoint
 *  derivatives (0.678 @ p=0.25 vs 0.397 @ p=0.75 — pull out fast, ride, land gently).
 *  The naive sin(pi*p) has slope pi at both ends and pops the zoom velocity at every edge. */
export const liftShape = (p: number) => Math.pow(Math.sin(Math.PI * Math.pow(clamp(p), 0.85)), 2);

/** The pose of a segment at a (possibly fractional) frame. A still hold (a === b) returns its pose
 *  BIT-EXACTLY; a hovering hold drifts a -> b on the `smooth` curve (zero velocity AND
 *  acceleration at both ends, so it meets the glides on either side without a shove). */
export const poseInSeg = (seg: WallSeg, frame: number, W: number): Cam => {
  const a = seg.a;
  const b = seg.b;
  if (seg.kind === "hold") {
    if (a.x === b.x && a.y === b.y && a.zoom === b.zoom && a.rot === b.rot) return { x: a.x, y: a.y, zoom: a.zoom, rot: a.rot };
    const len = seg.to - seg.from;
    const p = EASE.smooth(len <= 0 ? 1 : clamp((frame - seg.from) / len));
    return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p, zoom: a.zoom + (b.zoom - a.zoom) * p, rot: a.rot + shortAngle(a.rot, b.rot) * p };
  }
  const len = seg.to - seg.from;
  const p = len <= 0 ? 1 : clamp((frame - seg.from) / len);
  const ep = ease(seg.easing, p);

  // (a) position + arc — quadratic Bezier; arc 0 collapses ALGEBRAICALLY to lerp.
  const Dx = b.x - a.x;
  const Dy = b.y - a.y;
  const L = Math.hypot(Dx, Dy);
  let x: number;
  let y: number;
  if (L < 1e-6 || !seg.arc) {
    x = mix(a.x, b.x, ep);
    y = mix(a.y, b.y, ep);
  } else {
    // Left normal of travel; the SIGN of `arc` picks the side. The bow depends only on `arc` and
    // the travel vector — never on the wall's content centre — so adding a prop in a far corner
    // can never silently mirror an already-approved glide.
    const nx = -Dy / L;
    const ny = Dx / L;
    const cx = (a.x + b.x) / 2 + nx * ARC_GAIN * seg.arc * L;
    const cy = (a.y + b.y) / 2 + ny * ARC_GAIN * seg.arc * L;
    const u = 1 - ep;
    x = u * u * a.x + 2 * u * ep * cx + ep * ep * b.x;
    y = u * u * a.y + 2 * u * ep * cy + ep * ep * b.y;
  }

  // (b) zoom — its own curve, with a lead and a span-damped mid-glide lift.
  const ez = ease(seg.easing, clamp(p / (1 - ZOOM_LEAD)));
  const zb = mix(a.zoom, b.zoom, ez);
  const travel = L * ((a.zoom + b.zoom) / 2); // screen px actually crossed
  const norm = clamp(travel / Math.max(1, W), 0, 1.5); // 1 == a full frame-width traverse
  const span = clamp(1 - Math.abs(Math.log2(b.zoom / a.zoom)) / 0.8, 0.25, 1); // already zooming? no lift
  const zoom = zb * (1 - LIFT_GAIN * norm * span * liftShape(p));

  // (c) rotation — shortest arc, double-smoothed. A plain lerp over a +-180 field would sweep
  // 350 deg for a -175 -> +175 pair the user framed as a 10 deg adjustment. Rotation is also the
  // most nausea-inducing channel, so it starts and stops flatter than the pan.
  const rot = a.rot + shortAngle(a.rot, b.rot) * smooth(ease(seg.easing, p));

  return { x, y, zoom, rot };
};

// ---------------------------------------------------------------------------------------------
// 7. Camera speed — the scalar everything else reads.
//
// Optical flow at the frame edge in SCREEN PX PER FRAME, computed entirely WITHIN the current
// segment (both samples clamped into [from, to]), so a hard cut between two holds reads speed 0
// on both sides instead of spiking the whole inter-scene distance into one frame. The zoom and
// roll terms matter: a pure push-in has zero translation but is the most flow-heavy shot there is.
// ---------------------------------------------------------------------------------------------

export const segSpeed = (seg: WallSeg, frame: number, W: number, H: number) => {
  const R = 0.5 * Math.hypot(W, H);
  const cl = (v: number) => Math.min(seg.to, Math.max(seg.from, v));
  const P0 = poseInSeg(seg, cl(frame - 0.5), W);
  const P1 = poseInSeg(seg, cl(frame + 0.5), W);
  const z = Math.max(1e-6, poseInSeg(seg, cl(frame), W).zoom);
  return (
    Math.hypot(P1.x - P0.x, P1.y - P0.y) * z +
    (Math.abs(P1.zoom - P0.zoom) / z) * R +
    Math.abs(shortAngle(P0.rot, P1.rot)) * (Math.PI / 180) * R
  );
};

// ---------------------------------------------------------------------------------------------
// 8. Breathing — handheld drift on ABSOLUTE seconds.
//
// Three mutually incommensurate octaves per channel, so it never visibly loops inside a song.
// Applied after the segment pose and DIVIDED BY ZOOM, so the wobble is a constant amplitude ON
// SCREEN whether pulled out over the whole wall or tight on one polaroid (a handheld tremor is
// angular at the camera, not spatial at the wall). Both damping factors are continuous because
// every ease has zero endpoint velocity — no ramp, no state, no boundary case.
// Max excursion at g=1: +-8.7 px x, +-7.3 px y, +-0.22 deg, +-0.55% zoom.
// ---------------------------------------------------------------------------------------------

export const breatheX = (t: number) => 5.0 * Math.sin(0.62 * t) + 2.6 * Math.sin(1.09 * t + 1.7) + 1.1 * Math.sin(2.31 * t + 3.1);
export const breatheY = (t: number) => 4.2 * Math.cos(0.53 * t + 0.9) + 2.2 * Math.sin(0.97 * t + 2.4) + 0.9 * Math.sin(2.07 * t + 0.6);
export const breatheRot = (t: number) => 0.16 * Math.sin(0.41 * t + 1.2) + 0.06 * Math.sin(0.83 * t + 2.9);
export const breatheZoom = (t: number) => 0.0055 * Math.sin(0.37 * t + 0.3);

export interface WallCamera {
  /** Final camera, breathing included. */
  cam: Cam;
  /** Segment pose before breathing — bit-exact on holds. */
  base: Cam;
  seg: WallSeg;
  segIndex: number;
  /** Progress within the segment, [0, 1]. */
  p: number;
  /** Screen px per frame (pan + zoom + roll), breathing-free. */
  speed: number;
}

/**
 * The camera at a clip-local frame.
 *
 * @param tAbs ABSOLUTE composition seconds `(absStart + frame)/fps` — breathing rides this so the
 *             drift never restarts at a segment or clip boundary.
 */
export const cameraAt = (
  sched: WallSchedule,
  frame: number,
  tAbs: number,
  opts: { W: number; H: number; breathing?: number },
): WallCamera => {
  const { W, H } = opts;
  const i = segIndexAt(sched, frame);
  // Degenerate to the point of having no segments at all: park on the whole-wall pose.
  if (i < 0) {
    const c = { ...sched.whole };
    const seg: WallSeg = { kind: "hold", from: 0, to: 1, a: c, b: c, easing: "sine", arc: 0, scene: -1, whole: true };
    return { cam: { ...c }, base: { ...c }, seg, segIndex: -1, p: 0, speed: 0 };
  }
  const seg = sched.segs[i];
  const f = Math.min(seg.to, Math.max(seg.from, frame));
  const base = poseInSeg(seg, f, W);
  const speed = segSpeed(seg, f, W, H);

  const amp = clamp(finite(opts.breathing, 0), 0, 1);
  const g = amp * (1 - 0.62 * clamp(speed / 26)) * clamp(base.zoom / 0.55, 0.35, 1);
  const z = Math.max(1e-6, base.zoom);
  const cam: Cam =
    g === 0
      ? { x: base.x, y: base.y, zoom: base.zoom, rot: base.rot }
      : {
          x: base.x + (g * breatheX(tAbs)) / z,
          y: base.y + (g * breatheY(tAbs)) / z,
          zoom: base.zoom * (1 + g * breatheZoom(tAbs)),
          rot: base.rot + g * breatheRot(tAbs),
        };
  const len = seg.to - seg.from;
  return { cam, base, seg, segIndex: i, p: len <= 0 ? 1 : clamp((f - seg.from) / len), speed };
};

// ---------------------------------------------------------------------------------------------
// 9. Two velocity numbers, two purposes, because they scale differently with fps.
//
// How glides read (30 fps): <=18 px/frame glassy; 18-34 brisk; 34-55 energetic (fine detail
// starts to strobe, the fibre gain drops automatically); >55 a whip. The romantic register for
// this project lives in the GLASSY band, so the default target sits inside it.
// ---------------------------------------------------------------------------------------------

/** Peak slope of the default `smooth` ease — the factor between mean and peak glide speed. */
export const PEAK_SLOPE = 1.875;

/** JUDDER — px per FRAME. This is what strobes, and it is fps-dependent. Drives the editor chip. */
export const peakVelocity = (a: Cam, b: Cam, sec: number, fps: number) =>
  sec <= 0 ? Infinity : (PEAK_SLOPE * Math.hypot(b.x - a.x, b.y - a.y) * ((a.zoom + b.zoom) / 2)) / (fps * sec);

/** FEEL — targets PEAK px per SECOND, so the suggestion is identical at 30 and 60 fps. */
export const V_TARGET_PER_SEC = 480;

/** What "Set as scene" writes: the tool's default is always a move a motion designer would sign
 *  off, and the user has to work to make a bad one. 480 px/s peak == 16 px/frame at 30 fps (inside
 *  the glassy band) and 8 px/frame at 60 fps — cleaner for free, which is right. */
export const suggestGlideSeconds = (a: Cam, b: Cam) =>
  clamp((PEAK_SLOPE * Math.hypot(b.x - a.x, b.y - a.y) * ((a.zoom + b.zoom) / 2)) / V_TARGET_PER_SEC, 0.6, 6.0);
