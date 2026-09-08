// Wall minimap — a PLAN view of the whole wall, in pure SVG.
//
// Honest about being a plan rather than pretending to be the frame: no <Player>, no Remotion
// context, no offscreen render. That is what lets one component serve four places (the Wall view's
// always-on overview, every scene card's thumb, the Storyboard card, TimelineTip) and still reorder
// live while the user drags.
//
// Everything it draws comes from src/timeline/wall.ts — itemBox for the rects, sceneCam for the
// frusta, and scheduleWall + poseInSeg SAMPLED for the glide paths, so what is drawn IS the path
// the camera takes (arc, easing and all). Drawing the real Bezier is the whole point: `arc` and
// scene order are otherwise authored blind.
//
// On an unbounded canvas with an unclamped camera you WILL get lost without this. It is a
// requirement, not a nicety.
import React, { useMemo, useRef } from "react";
import type { Wall } from "../../../src/timeline/schema";
import {
  itemBox,
  itemDepth,
  poseInSeg,
  sceneCam,
  scheduleWall,
  type Cam,
} from "../../../src/timeline/wall";

export interface WallMiniMapProps {
  wall: Wall;
  /** RECORDED frame size in composition px — the frusta are drawn against this, never the
   *  overscanned canvas (overscan is an editor-only composition-size change). */
  W: number;
  H: number;
  fps?: number;
  /** Rendered size in CSS px. The viewBox is stretched to this exact aspect so the px -> wall
   *  mapping stays a plain linear function (no preserveAspectRatio slack to invert). */
  width?: number;
  height?: number;
  /** Scene whose frustum is drawn solid (the card this map belongs to). */
  highlight?: number;
  /** Live authoring camera, drawn as a filled viewport rect. */
  cam?: Cam | null;
  /** Click / drag to move the camera centre. Omitted = a static thumbnail. */
  onJump?: (p: { x: number; y: number }) => void;
  /** Draw the numbered frusta + glide paths (off for a bare wall thumbnail). */
  showScenes?: boolean;
  className?: string;
  title?: string;
}

/** Depth -> colour. Position-only parallax means depth never changes an item's SIZE, so the map
 *  has to say it in colour: cool = recedes, warm = comes forward. */
const depthColour = (d: number) => {
  const t = Math.max(0, Math.min(1, (d - 0.75) / 0.6)); // 0.75 -> 1.35 covers the useful range
  const r = Math.round(74 + t * (217 - 74));
  const g = Math.round(111 + t * (138 - 111));
  const b = Math.round(165 + t * (74 - 165));
  return `rgb(${r},${g},${b})`;
};

/** Corners of a rect centred at (cx,cy), size w x h, rotated `deg` (y-down, so + is clockwise). */
const corners = (cx: number, cy: number, w: number, h: number, deg: number) => {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const hw = w / 2;
  const hh = h / 2;
  return [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ].map(([x, y]) => ({ x: cx + x * c - y * s, y: cy + x * s + y * c }));
};

export const WallMiniMap: React.FC<WallMiniMapProps> = ({
  wall,
  W,
  H,
  fps = 30,
  width = 220,
  height = 132,
  highlight,
  cam,
  onJump,
  showScenes = true,
  className,
  title,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const items = wall.items ?? [];
  const scenes = wall.scenes ?? [];

  // TWO memos, split on cost. The expensive half (schedule + fitAll + 25 pose samples per glide)
  // must NOT depend on `cam` — `cam` is a fresh object from every `setWallCam`, so with it in the
  // dep list a single pan re-solved the whole schedule on every pointermove, on top of the Player
  // re-rendering k² pixels. The cheap half (the bounds the camera rect can push outward) is the
  // only part that has to follow the camera.
  const plan = useMemo(() => {
    const rects = items.map((it) => {
      const b = itemBox(it);
      return {
        cx: it.x ?? 0,
        cy: it.y ?? 0,
        w: b.w,
        h: b.h,
        rot: it.rotation ?? 0,
        depth: itemDepth(it),
        text: (it.type ?? "image") === "text",
      };
    });

    // A scene sees a W x H screen rect; in wall space that is W/zoom x H/zoom, rotated by +rot
    // (a wall vector at phi appears on screen at phi - rot, so the screen x-axis lies at +rot).
    const frusta = showScenes
      ? scenes.map((s, i) => {
          const c = sceneCam(s);
          return { i, cx: c.x, cy: c.y, w: W / c.zoom, h: H / c.zoom, rot: c.rot };
        })
      : [];

    // The ACTUAL glide paths: sample the shipping interpolator, so the drawn curve is the curve.
    const paths: { d: string; whole: boolean }[] = [];
    if (showScenes && scenes.length) {
      const sched = scheduleWall(wall, fps, W, H);
      for (const seg of sched.segs) {
        if (seg.kind !== "glide") continue;
        const N = 24;
        let d = "";
        for (let k = 0; k <= N; k++) {
          const p = poseInSeg(seg, seg.from + ((seg.to - seg.from) * k) / N, W);
          d += `${k === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
        }
        paths.push({ d, whole: seg.whole });
      }
    }

    // Camera-independent bounds over everything drawn, so nothing is ever cropped out of the plan.
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const eat = (x: number, y: number) => {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    };
    rects.forEach((r) => corners(r.cx, r.cy, r.w, r.h, r.rot).forEach((p) => eat(p.x, p.y)));
    frusta.forEach((f) => corners(f.cx, f.cy, f.w, f.h, f.rot).forEach((p) => eat(p.x, p.y)));
    return { rects, frusta, paths, minX, minY, maxX, maxY };
  }, [items, scenes, wall, W, H, fps, showScenes]);

  const model = useMemo(() => {
    let { minX, minY, maxX, maxY } = plan;
    const eat = (x: number, y: number) => {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    };
    if (cam) corners(cam.x, cam.y, W / cam.zoom, H / cam.zoom, cam.rot).forEach((p) => eat(p.x, p.y));
    if (!Number.isFinite(minX)) {
      minX = -W / 2;
      maxX = W / 2;
      minY = -H / 2;
      maxY = H / 2;
    }

    // Pad, then stretch the SHORT axis to the rendered aspect: the mapping stays linear, so a
    // pointer position inverts to a wall point with a subtraction and a multiply.
    const padX = Math.max(40, (maxX - minX) * 0.06);
    const padY = Math.max(40, (maxY - minY) * 0.06);
    let x0 = minX - padX;
    let y0 = minY - padY;
    let vw = Math.max(1, maxX - minX + 2 * padX);
    let vh = Math.max(1, maxY - minY + 2 * padY);
    const aspect = width / Math.max(1, height);
    if (vw / vh < aspect) {
      const nw = vh * aspect;
      x0 -= (nw - vw) / 2;
      vw = nw;
    } else {
      const nh = vw / aspect;
      y0 -= (nh - vh) / 2;
      vh = nh;
    }
    return { rects: plan.rects, frusta: plan.frusta, paths: plan.paths, x0, y0, vw, vh };
  }, [plan, cam, W, H, width, height]);

  // Stroke widths are authored in wall units, so divide by the on-screen scale to keep them ~1 px
  // whatever the wall's extent.
  const u = model.vw / Math.max(1, width);

  const jumpTo = (e: React.PointerEvent) => {
    if (!onJump) return;
    const el = svgRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    onJump({
      x: model.x0 + ((e.clientX - r.left) / r.width) * model.vw,
      y: model.y0 + ((e.clientY - r.top) / r.height) * model.vh,
    });
  };

  return (
    <svg
      ref={svgRef}
      className={"wall-mini" + (className ? " " + className : "") + (onJump ? " clickable" : "")}
      width={width}
      height={height}
      viewBox={`${model.x0} ${model.y0} ${model.vw} ${model.vh}`}
      onPointerDown={
        onJump
          ? (e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              jumpTo(e);
            }
          : undefined
      }
      onPointerMove={
        onJump
          ? (e) => {
              if (e.buttons & 1) jumpTo(e);
            }
          : undefined
      }
      onPointerUp={
        onJump
          ? (e) => {
              try {
                e.currentTarget.releasePointerCapture(e.pointerId);
              } catch {
                /* not captured */
              }
            }
          : undefined
      }
    >
      {title ? <title>{title}</title> : null}
      <rect x={model.x0} y={model.y0} width={model.vw} height={model.vh} className="wm-paper" />

      {/* glide paths first, so items and frusta sit on top of them */}
      {model.paths.map((p, i) => (
        <path key={i} d={p.d} className={"wm-path" + (p.whole ? " whole" : "")} strokeWidth={2 * u} />
      ))}

      {model.rects.map((r, i) => (
        <rect
          key={i}
          x={r.cx - r.w / 2}
          y={r.cy - r.h / 2}
          width={r.w}
          height={r.h}
          transform={`rotate(${r.rot.toFixed(2)} ${r.cx} ${r.cy})`}
          fill={r.text ? "none" : depthColour(r.depth)}
          stroke={depthColour(r.depth)}
          strokeWidth={(r.text ? 2 : 1) * u}
          strokeDasharray={r.text ? `${6 * u} ${4 * u}` : undefined}
          fillOpacity={0.55}
        />
      ))}

      {model.frusta.map((f) => (
        <g key={f.i} transform={`rotate(${f.rot.toFixed(2)} ${f.cx} ${f.cy})`}>
          <rect
            x={f.cx - f.w / 2}
            y={f.cy - f.h / 2}
            width={f.w}
            height={f.h}
            className={"wm-frustum" + (highlight === f.i ? " on" : "")}
            strokeWidth={(highlight === f.i ? 3 : 1.5) * u}
          />
          <text
            x={f.cx - f.w / 2 + 8 * u}
            y={f.cy - f.h / 2 + 26 * u}
            className={"wm-num" + (highlight === f.i ? " on" : "")}
            fontSize={26 * u}
          >
            {f.i + 1}
          </text>
        </g>
      ))}

      {cam && (
        <rect
          x={cam.x - W / cam.zoom / 2}
          y={cam.y - H / cam.zoom / 2}
          width={W / cam.zoom}
          height={H / cam.zoom}
          transform={`rotate(${cam.rot.toFixed(2)} ${cam.x} ${cam.y})`}
          className="wm-view"
          strokeWidth={2 * u}
        />
      )}
    </svg>
  );
};
