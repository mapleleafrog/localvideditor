// Screen <-> composition coordinate mapping for the canvas transform tools.
// The Player is forced into an EXACT composition-aspect box (no letterbox), so
// the on-screen scale is uniform: k = boxWidthPx / compWidthPx. Proxy boxes live
// in box-local px (the CanvasOverlay sits at inset:0 over that box).

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
  rot: number; // degrees
}

/** screen px per composition px (uniform). */
export const scaleFactor = (boxW: number, compW: number) => (compW > 0 ? boxW / compW : 1);

/**
 * model (x%,y% center, scale, rotation) + base content size (comp px) -> proxy box (box-local px).
 * Overlays center on (x%,y%): translate(-50%,-50%) then scale/rotate around center, so the
 * center is invariant to scale/rotation.
 */
export function modelToBox(
  m: { x: number; y: number; scale: number; rotation: number },
  baseW: number,
  baseH: number,
  boxW: number,
  boxH: number,
  k: number,
): Box {
  const width = baseW * m.scale * k;
  const height = baseH * m.scale * k;
  const cx = (m.x / 100) * boxW;
  const cy = (m.y / 100) * boxH;
  return { left: cx - width / 2, top: cy - height / 2, width, height, rot: m.rotation };
}

/** proxy box center -> model x%/y%. */
export function boxToModelXY(b: Box, boxW: number, boxH: number) {
  const cx = b.left + b.width / 2;
  const cy = b.top + b.height / 2;
  return { x: boxW > 0 ? (cx / boxW) * 100 : 50, y: boxH > 0 ? (cy / boxH) * 100 : 50 };
}

/** proxy width (px) -> model scale, given the content's base width (comp px) and k. */
export const boxWidthToScale = (widthPx: number, baseW: number, k: number) =>
  baseW > 0 && k > 0 ? widthPx / (baseW * k) : 1;
