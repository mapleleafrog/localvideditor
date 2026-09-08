// Wall view <-> screen mapping. A THIN ADAPTER, deliberately: every geometric statement below is
// delegated to src/timeline/wall.ts, the same module the renderer uses, so the editor's gesture
// maths and the render maths cannot disagree. Nothing here reimplements a rotation or a scale.
//
// Two coordinate systems and exactly one scalar between them:
//   * COMPOSITION px — what wall.ts's wallToScreen/screenToWall/itemScreenBox speak. Under overscan
//     the composition is (compW*k, compH*k), because overscan is a COMPOSITION-SIZE change and
//     never a zoom change (design §0.4) — cam.zoom stays bit-identical to the render.
//   * BOX-LOCAL px — the pointer coordinates inside the Player's contain-fit box, which the
//     WallOverlay sits over at inset:0. `k = boxW / W` is coords.ts#scaleFactor, uniform because
//     useContainFit forces the exact composition aspect.
import { scaleFactor } from "./coords";
import {
  itemDepth,
  itemScreenBox,
  normAngle,
  screenToWall,
  wallToScreen,
  type Cam,
  type WallItemLike,
} from "../../../src/timeline/wall";

export { normAngle };
export type { Cam };

/** The camera-independent half of the mapping: the overscanned composition size + the box scale. */
export interface WallViewport {
  /** OVERSCANNED composition width/height in composition px (recorded frame x overscan). */
  W: number;
  H: number;
  /** The RECORDED frame, centred inside W x H — what actually lands in the MP4. */
  recW: number;
  recH: number;
  /** Screen (box-local) px per composition px. Uniform — see coords.ts#scaleFactor. */
  k: number;
}

export const wallViewport = (compW: number, compH: number, overscan: number, boxW: number): WallViewport => {
  const o = overscan > 0 ? overscan : 1;
  const W = compW * o;
  const H = compH * o;
  return { W, H, recW: compW, recH: compH, k: scaleFactor(boxW, W) };
};

const kOf = (vp: WallViewport) => (vp.k > 0 ? vp.k : 1);

/** Wall point -> box-local screen px, at an item's own depth (1 = the wall plane). */
export const wallToScreenPt = (p: { x: number; y: number }, cam: Cam, vp: WallViewport, depth = 1) => {
  const s = wallToScreen(p, cam, depth, vp.W, vp.H);
  const k = kOf(vp);
  return { x: s.x * k, y: s.y * k };
};

/** Box-local screen px -> wall point, at an item's own depth. Exact inverse of wallToScreenPt. */
export const screenPtToWall = (q: { x: number; y: number }, cam: Cam, vp: WallViewport, depth = 1) => {
  const k = kOf(vp);
  return screenToWall({ x: q.x / k, y: q.y / k }, cam, depth, vp.W, vp.H);
};

/** A screen DELTA in box-local px -> a wall delta at `depth`. Taken as the difference of two
 *  screenToWall reads so the rotation/zoom handling stays in wall.ts (a depth-1.2 item then tracks
 *  the pointer 1:1 instead of running ahead of it). */
export const screenDeltaToWall = (d: { x: number; y: number }, cam: Cam, vp: WallViewport, depth = 1) => {
  const a = screenPtToWall({ x: 0, y: 0 }, cam, vp, depth);
  const b = screenPtToWall(d, cam, vp, depth);
  return { x: b.x - a.x, y: b.y - a.y };
};

/** An item's OUTER box on screen (box-local px): centre, size and camera-relative angle.
 *  Size is treatment-inclusive and depth-INDEPENDENT (position-only parallax), so the handles hug
 *  a polaroid's card rather than sitting inside it. */
export const itemScreenBoxPx = (it: WallItemLike, cam: Cam, vp: WallViewport) => {
  const b = itemScreenBox(it, cam, vp.W, vp.H);
  const k = kOf(vp);
  return { cx: b.cx * k, cy: b.cy * k, w: b.w * k, h: b.h * k, angle: b.angle };
};

/** Drag the wall under the pointer: the camera moves opposite the screen delta, at depth 1. */
export const panBy = (cam: Cam, d: { x: number; y: number }, vp: WallViewport): Cam => {
  const w = screenDeltaToWall(d, cam, vp, 1);
  return { x: cam.x - w.x, y: cam.y - w.y, zoom: cam.zoom, rot: cam.rot };
};

export const ZOOM_MIN = 0.02;
export const ZOOM_MAX = 8;
/** Wheel sensitivity — one notch (~100px of deltaY) is about a 16% zoom step. */
export const ZOOM_RATE = 0.0015;

const clampZoom = (z: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));

/**
 * Wheel-zoom anchored at the cursor: read the wall point under the pointer, apply the zoom, then
 * solve the camera so that point lands back under the pointer.
 *
 * `screenToWall(q, cam, d, W, H) = cam + f(q, zoom, rot)`, so the solve is a subtraction — again no
 * local geometry: `f` is evaluated by calling wall.ts with a zero camera.
 */
export const zoomAtCursor = (cam: Cam, cursor: { x: number; y: number }, deltaY: number, vp: WallViewport): Cam =>
  zoomTo(cam, clampZoom(cam.zoom * Math.exp(-deltaY * ZOOM_RATE)), cursor, vp);

/** Set an absolute zoom while keeping the wall point under `cursor` (box-local px) fixed. */
export const zoomTo = (cam: Cam, zoom: number, cursor: { x: number; y: number }, vp: WallViewport): Cam => {
  const z = clampZoom(zoom);
  const anchor = screenPtToWall(cursor, cam, vp, 1);
  const k = kOf(vp);
  const q = { x: cursor.x / k, y: cursor.y / k };
  const f = screenToWall(q, { x: 0, y: 0, zoom: z, rot: cam.rot }, 1, vp.W, vp.H);
  return { x: anchor.x - f.x, y: anchor.y - f.y, zoom: z, rot: cam.rot };
};

/** Angle (degrees) from an item's on-screen centre to a pointer, in the same convention the item's
 *  `rotation` uses: a wall vector at phi appears on screen at phi - cam.rot, so the gesture adds
 *  cam.rot back. Matches CanvasOverlay/ContextMenu's normAngle range. */
export const screenAngleToItemRotation = (
  cursor: { x: number; y: number },
  centre: { x: number; y: number },
  cam: Cam,
) => normAngle((Math.atan2(cursor.y - centre.y, cursor.x - centre.x) * 180) / Math.PI + 90 + cam.rot);

/** Depth of an item, clamped to the schema range (re-exported so gesture code has one source). */
export const depthOf = (it: WallItemLike) => itemDepth(it);
