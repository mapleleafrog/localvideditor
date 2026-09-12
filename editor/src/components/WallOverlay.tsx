// Wall gestures — CanvasOverlay.tsx RESTRUCTURED for the wall, not reinvented.
//
// Same absolutely-positioned overlay at inset:0 over the Player's contain-fit box, the same
// pointer-capture gestures, the same `e.button !== 0` guards so a right-click never starts a drag,
// and the same `openCtxMenu(x, y, frame, target)` contract. What changes is the coordinate space:
// every screen<->wall statement goes through lib/wall-coords.ts, which is itself a thin adapter
// over src/timeline/wall.ts — the module the renderer uses. The gesture maths and the render maths
// therefore cannot disagree.
//
// Four things worth stating because each is a bug that would otherwise be invisible:
//
//  1. Hit boxes come from `itemScreenBox`, which is TREATMENT-INCLUSIVE, so a polaroid's handles hug
//     its card instead of sitting inside it — the same box the renderer lays out and `fitAll` uses.
//  2. A move converts the SCREEN delta at each item's OWN depth, so a depth-1.2 item tracks the
//     pointer 1:1 instead of running ahead of it.
//  3. Rotation adds `cam.rot` BACK (a wall vector at phi appears on screen at phi - cam.rot), so
//     dragging the knob under a rolled camera turns the card the way the pointer moves.
//  4. The corner handle writes `width` — width IS the model, there is no separate `scale` to fight.
//
// Group scale and group rotate are deliberately out of scope (they would need a shared pivot and a
// second meaning for `width`); group MOVE, ALIGN, DISTRIBUTE and Z-ORDER are here, because
// arranging sixty overlapping photos one at a time is this view's actual daily job.
import React, { useRef, useState } from "react";
import { useEditor } from "../store";
import type { Wall, WallItem } from "../../../src/timeline/schema";
import { itemBox, itemVisibleInScene, normAngle, sceneIndexById } from "../../../src/timeline/wall";
import {
  itemScreenBoxPx,
  panBy,
  screenDeltaToWall,
  screenAngleToItemRotation,
  depthOf,
  type Cam,
  type WallViewport,
} from "../lib/wall-coords";

interface Props {
  /** Index of the wall clip in project.clips. */
  ci: number;
  wall: Wall;
  cam: Cam;
  vp: WallViewport;
  /** Box-local size of the Player box in CSS px (= vp.W * vp.k, vp.H * vp.k). */
  boxW: number;
  boxH: number;
  onCam: (c: Cam) => void;
  /** Sticky hand tool (`H`) — every left-drag pans. */
  hand: boolean;
  /** Live `Space`-is-held flag (the pan modifier). A ref so holding Space costs no re-render. */
  spaceRef: React.RefObject<boolean>;
  /** Playhead frame, captured for openCtxMenu BEFORE selecting (selection can move the player). */
  frame: number;
}

/** Snap tolerance, in SCREEN px — constant on screen at every zoom, which is what a user feels. */
const SNAP_PX = 6;
/** A drag shorter than this is a click (deselect / select), not a pan. */
const CLICK_PX = 3;

/** The lead item's screen box AT GESTURE START — see `snapDelta`. */
type StartBox = { cx: number; cy: number; w: number; h: number };

type Gesture =
  | {
      kind: "move";
      sx: number;
      sy: number;
      items: { i: number; x0: number; y0: number; d: number }[];
      /** Frozen at pointer-down: `items` is live and has already moved by the time the second
       *  pointermove runs, so snapping against it double-counts the drag. */
      b0: StartBox | null;
    }
  | { kind: "scale"; i: number; cx: number; cy: number; startDist: number; startWidth: number }
  | { kind: "rotate"; i: number; cx: number; cy: number }
  | { kind: "pan"; sx: number; sy: number; cam0: Cam; moved: boolean }
  | { kind: "rotcam"; sx: number; sy: number; rot0: number; ang0: number }
  | { kind: "marquee"; sx: number; sy: number; x: number; y: number; add: number[] };

const CORNERS: [string, number, number][] = [
  ["nw", 0, 0],
  ["ne", 1, 0],
  ["sw", 0, 1],
  ["se", 1, 1],
];

export const WallOverlay: React.FC<Props> = ({ ci, wall, cam, vp, boxW, boxH, onCam, hand, spaceRef, frame }) => {
  const selection = useEditor((s) => s.selection);
  const wallSel = useEditor((s) => s.wallSel);
  const setWallSel = useEditor((s) => s.setWallSel);
  const select = useEditor((s) => s.select);
  const openCtxMenu = useEditor((s) => s.openCtxMenu);

  const g = useRef<Gesture | null>(null);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const [marquee, setMarquee] = useState<{ l: number; t: number; w: number; h: number } | null>(null);

  const items = wall.items ?? [];
  // The selected scene card (footer strip): items that are NOT on the wall during that scene draw
  // a dashed "hidden here" outline. Editor chrome only — the Player pixels are the render's.
  const wallScene = useEditor((s) => s.wallScene);
  const sceneIdx = sceneIndexById(wall, wallScene ?? undefined);
  const primary = selection?.kind === "wallItem" && selection.clip === ci ? selection.index : -1;
  // wallSel is the multi-selection; a bare primary counts as a selection of one.
  const sel = wallSel.length ? wallSel.filter((i) => i >= 0 && i < items.length) : primary >= 0 ? [primary] : [];
  const selSet = new Set(sel);

  const boxOf = (it: WallItem) => itemScreenBoxPx(it, cam, vp);

  // The RECORDED frame: the centred W x H sub-rectangle of the overscanned canvas (design §0.4 —
  // overscan is a composition-size change, so this rectangle is exactly what lands in the MP4).
  const recW = vp.recW * vp.k;
  const recH = vp.recH * vp.k;
  const recL = (boxW - recW) / 2;
  const recT = (boxH - recH) / 2;

  const localPt = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).closest(".wall-ovl")!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  // ---------------------------------------------------------------------------------------------
  // Snapping — item centres/edges and the recorded-frame centre, all in SCREEN px. Alt disables.
  //
  // `b0` is the lead item's box AS IT WAS WHEN THE DRAG STARTED, and it has to be: `dx`/`dy` are
  // the CUMULATIVE delta since pointer-down, while `items` is the live array the previous
  // pointermove already wrote the whole delta into. Anchoring on the live box therefore evaluated
  // start + 2*delta, which fired the 6 px test when the item was roughly HALFWAY to a snap line and
  // then applied a correction that left it half the distance from the guide being drawn. Targets,
  // tolerance and guides were always right — only the anchor was.
  // ---------------------------------------------------------------------------------------------
  const snapDelta = (dx: number, dy: number, moving: number[], b0: StartBox | null) => {
    const targX: number[] = [recL + recW / 2];
    const targY: number[] = [recT + recH / 2];
    items.forEach((it, i) => {
      if (moving.includes(i)) return;
      const b = boxOf(it);
      targX.push(b.cx, b.cx - b.w / 2, b.cx + b.w / 2);
      targY.push(b.cy, b.cy - b.h / 2, b.cy + b.h / 2);
    });
    if (!b0) return { dx, dy, gx: [] as number[], gy: [] as number[] };
    const anchorsX = [b0.cx + dx, b0.cx + dx - b0.w / 2, b0.cx + dx + b0.w / 2];
    const anchorsY = [b0.cy + dy, b0.cy + dy - b0.h / 2, b0.cy + dy + b0.h / 2];
    let bestX: { d: number; line: number } | null = null;
    let bestY: { d: number; line: number } | null = null;
    anchorsX.forEach((a) =>
      targX.forEach((t) => {
        const d = t - a;
        if (Math.abs(d) <= SNAP_PX && (!bestX || Math.abs(d) < Math.abs(bestX.d))) bestX = { d, line: t };
      }),
    );
    anchorsY.forEach((a) =>
      targY.forEach((t) => {
        const d = t - a;
        if (Math.abs(d) <= SNAP_PX && (!bestY || Math.abs(d) < Math.abs(bestY.d))) bestY = { d, line: t };
      }),
    );
    const bx = bestX as { d: number; line: number } | null;
    const by = bestY as { d: number; line: number } | null;
    return {
      dx: dx + (bx ? bx.d : 0),
      dy: dy + (by ? by.d : 0),
      gx: bx ? [bx.line] : [],
      gy: by ? [by.line] : [],
    };
  };

  // ---------------------------------------------------------------------------------------------
  // Gesture starts.
  // ---------------------------------------------------------------------------------------------
  const capture = (e: React.PointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
  };

  const startItem = (i: number) => (e: React.PointerEvent) => {
    if (e.button !== 0) return; // never let a right-click start a drag
    e.preventDefault();
    e.stopPropagation();
    const st = useEditor.getState();
    let next = st.wallSel.length ? [...st.wallSel] : primary >= 0 ? [primary] : [];
    let removed = false;
    if (e.shiftKey) {
      removed = next.includes(i);
      next = removed ? next.filter((k) => k !== i) : [...next, i];
      if (!next.length) {
        select(null);
        setWallSel([]);
        return;
      }
    } else if (!next.includes(i)) {
      next = [i];
    }
    // Shift-clicking a selected item REMOVES it from the group, so it must not also become the
    // primary: the transform handles are drawn on (and scale/rotate) the primary, which would then
    // be an item the group bar reports as not selected. Hand the primary to a survivor instead.
    const lead = removed ? next[next.length - 1] : i;
    select({ kind: "wallItem", clip: ci, index: lead });
    setWallSel(next);
    const leadItem = items[lead];
    g.current = {
      kind: "move",
      sx: localPt(e).x,
      sy: localPt(e).y,
      items: next
        .map((k) => ({ k, it: items[k] }))
        .filter((r) => !!r.it)
        .map((r) => ({ i: r.k, x0: r.it.x ?? 0, y0: r.it.y ?? 0, d: depthOf(r.it) })),
      b0: leadItem ? boxOf(leadItem) : null,
    };
    capture(e);
  };

  const startHandle = (kind: "scale" | "rotate") => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const it = items[primary];
    if (!it) return;
    const b = boxOf(it);
    const p = localPt(e);
    g.current =
      kind === "scale"
        ? {
            kind,
            i: primary,
            cx: b.cx,
            cy: b.cy,
            startDist: Math.hypot(p.x - b.cx, p.y - b.cy) || 1,
            startWidth: Math.max(1, it.width ?? 560),
          }
        : { kind, i: primary, cx: b.cx, cy: b.cy };
    capture(e);
  };

  const startBackground = (e: React.PointerEvent) => {
    // Order matters, and this order is the fix for two bugs: the marquee used to sit in a final
    // `else` that only Shift could reach (so its "replace the selection" branch was dead code), and
    // `hand`/Space were OR'd into the pan clause AHEAD of the Shift test, which made the hand tool
    // disable marquee selection entirely.
    //
    //   middle-drag           -> pan (always)
    //   Shift-drag            -> marquee, ADDING to the selection
    //   Alt+Shift-drag        -> marquee, REPLACING the selection
    //   hand / Space held     -> pan
    //   Alt-drag              -> camera roll
    //   plain drag            -> pan
    if (e.button !== 0 && e.button !== 1) return;
    const p = localPt(e);
    if (e.button === 1) {
      g.current = { kind: "pan", sx: p.x, sy: p.y, cam0: { ...cam }, moved: false };
    } else if (e.shiftKey) {
      g.current = { kind: "marquee", sx: p.x, sy: p.y, x: p.x, y: p.y, add: e.altKey ? [] : [...sel] };
      setMarquee({ l: p.x, t: p.y, w: 0, h: 0 });
    } else if (hand || spaceRef.current) {
      g.current = { kind: "pan", sx: p.x, sy: p.y, cam0: { ...cam }, moved: false };
    } else if (e.altKey) {
      g.current = {
        kind: "rotcam",
        sx: p.x,
        sy: p.y,
        rot0: cam.rot,
        ang0: (Math.atan2(p.y - boxH / 2, p.x - boxW / 2) * 180) / Math.PI,
      };
    } else {
      g.current = { kind: "pan", sx: p.x, sy: p.y, cam0: { ...cam }, moved: false };
    }
    e.preventDefault();
    capture(e);
  };

  // ---------------------------------------------------------------------------------------------
  // Gesture move / end. Handlers live on the ROOT: a captured pointer's moves are dispatched to the
  // capturing child and bubble up here, so there is exactly one implementation per gesture.
  // ---------------------------------------------------------------------------------------------
  const onMove = (e: React.PointerEvent) => {
    const d = g.current;
    if (!d) return;
    const p = localPt(e);
    const st = useEditor.getState();

    if (d.kind === "move") {
      let dx = p.x - d.sx;
      let dy = p.y - d.sy;
      let gx: number[] = [];
      let gy: number[] = [];
      if (!e.altKey) {
        const s = snapDelta(dx, dy, d.items.map((r) => r.i), d.b0);
        dx = s.dx;
        dy = s.dy;
        gx = s.gx;
        gy = s.gy;
      }
      setGuides({ x: gx, y: gy });
      d.items.forEach((r) => {
        const w = screenDeltaToWall({ x: dx, y: dy }, cam, vp, r.d);
        st.patchWallItem(ci, r.i, { x: Math.round(r.x0 + w.x), y: Math.round(r.y0 + w.y) });
      });
      return;
    }
    if (d.kind === "scale") {
      const dist = Math.hypot(p.x - d.cx, p.y - d.cy);
      st.patchWallItem(ci, d.i, { width: Math.max(8, Math.round((d.startWidth * dist) / d.startDist)) });
      return;
    }
    if (d.kind === "rotate") {
      let deg = screenAngleToItemRotation(p, { x: d.cx, y: d.cy }, cam);
      if (e.shiftKey) deg = normAngle(Math.round(deg / 15) * 15);
      st.patchWallItem(ci, d.i, { rotation: Math.round(deg * 10) / 10 });
      return;
    }
    if (d.kind === "pan") {
      if (!d.moved && Math.hypot(p.x - d.sx, p.y - d.sy) > CLICK_PX) d.moved = true;
      // Camera navigation writes the TRANSIENT wallCam only — pan/zoom never enters undo history.
      onCam(panBy(d.cam0, { x: p.x - d.sx, y: p.y - d.sy }, vp));
      return;
    }
    if (d.kind === "rotcam") {
      const ang = (Math.atan2(p.y - boxH / 2, p.x - boxW / 2) * 180) / Math.PI;
      // MINUS, so the paper turns UNDER the hand. A wall vector at phi appears on screen at
      // phi - cam.rot, so INCREASING rot spins the wall counter-clockwise while a screen atan2
      // grows clockwise: adding the delta turned the wall the opposite way to the pointer — the
      // one gesture in the view that ran backwards, against pan on the very same element (which
      // follows the hand) and against the item rotate knob (which is direct manipulation too).
      let rot = normAngle(d.rot0 - (ang - d.ang0));
      if (Math.abs(rot) < 0.5) rot = 0; // the level is worth snapping to
      onCam({ ...cam, rot: Math.round(rot * 100) / 100 });
      return;
    }
    // marquee
    d.x = p.x;
    d.y = p.y;
    setMarquee({
      l: Math.min(d.sx, d.x),
      t: Math.min(d.sy, d.y),
      w: Math.abs(d.x - d.sx),
      h: Math.abs(d.y - d.sy),
    });
  };

  const onUp = (e: React.PointerEvent) => {
    const d = g.current;
    g.current = null;
    setGuides({ x: [], y: [] });
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* not captured */
    }
    if (!d) return;
    if (d.kind === "pan" && !d.moved) {
      // A click on empty wall clears the selection (the app-wide convention).
      select(null);
      setWallSel([]);
      return;
    }
    if (d.kind === "marquee") {
      const l = Math.min(d.sx, d.x);
      const t = Math.min(d.sy, d.y);
      const r = Math.max(d.sx, d.x);
      const b = Math.max(d.sy, d.y);
      const hit = items
        .map((it, i) => ({ i, b: boxOf(it) }))
        .filter(({ b: q }) => q.cx >= l && q.cx <= r && q.cy >= t && q.cy <= b)
        .map(({ i }) => i);
      const next = Array.from(new Set([...d.add, ...hit]));
      setMarquee(null);
      setWallSel(next);
      select(next.length ? { kind: "wallItem", clip: ci, index: next[next.length - 1] } : null);
    }
  };

  // ---------------------------------------------------------------------------------------------
  // Group actions (align / distribute / z-order). Each is ONE immutable rebuild = one undo step;
  // z-order also remaps `wallSel` and the primary selection itself, since array order IS paint
  // order and the indices move.
  // ---------------------------------------------------------------------------------------------
  const groupPatch = (fn: (it: WallItem) => Partial<WallItem>) => {
    const st = useEditor.getState();
    const cur = st.project.clips?.[ci]?.wall?.items ?? [];
    st.patchWall(ci, { items: cur.map((it, i) => (selSet.has(i) ? { ...it, ...fn(it) } : it)) });
  };

  const align = (mode: "l" | "cx" | "r" | "t" | "cy" | "b") => {
    const chosen = sel.map((i) => items[i]).filter(Boolean);
    if (chosen.length < 2) return;
    const box = (it: WallItem) => itemBox(it);
    const lefts = chosen.map((it) => (it.x ?? 0) - box(it).w / 2);
    const rights = chosen.map((it) => (it.x ?? 0) + box(it).w / 2);
    const tops = chosen.map((it) => (it.y ?? 0) - box(it).h / 2);
    const bots = chosen.map((it) => (it.y ?? 0) + box(it).h / 2);
    const L = Math.min(...lefts);
    const R = Math.max(...rights);
    const T = Math.min(...tops);
    const B = Math.max(...bots);
    groupPatch((it) => {
      const b = box(it);
      switch (mode) {
        case "l":
          return { x: Math.round(L + b.w / 2) };
        case "r":
          return { x: Math.round(R - b.w / 2) };
        case "cx":
          return { x: Math.round((L + R) / 2) };
        case "t":
          return { y: Math.round(T + b.h / 2) };
        case "b":
          return { y: Math.round(B - b.h / 2) };
        default:
          return { y: Math.round((T + B) / 2) };
      }
    });
  };

  const distribute = (axis: "x" | "y") => {
    const chosen = sel.map((i) => ({ i, it: items[i] })).filter((r) => !!r.it);
    if (chosen.length < 3) return;
    const key = axis === "x" ? "x" : "y";
    const sorted = [...chosen].sort((a, b) => (a.it[key] ?? 0) - (b.it[key] ?? 0));
    const lo = sorted[0].it[key] ?? 0;
    const hi = sorted[sorted.length - 1].it[key] ?? 0;
    const step = (hi - lo) / (sorted.length - 1);
    const target = new Map<number, number>();
    sorted.forEach((r, k) => target.set(r.i, Math.round(lo + step * k)));
    const st = useEditor.getState();
    const cur = st.project.clips?.[ci]?.wall?.items ?? [];
    st.patchWall(ci, {
      items: cur.map((it, i) => (target.has(i) ? { ...it, [key]: target.get(i) as number } : it)),
    });
  };

  const zOrder = (to: "front" | "back") => {
    const st = useEditor.getState();
    const cur = st.project.clips?.[ci]?.wall?.items ?? [];
    const moving = cur.filter((_, i) => selSet.has(i));
    const rest = cur.filter((_, i) => !selSet.has(i));
    const next = to === "front" ? [...rest, ...moving] : [...moving, ...rest];
    st.patchWall(ci, { items: next });
    const base = to === "front" ? rest.length : 0;
    const idx = moving.map((_, k) => base + k);
    st.setWallSel(idx);
    if (idx.length) st.select({ kind: "wallItem", clip: ci, index: idx[idx.length - 1] });
  };

  // Group toolbar anchor: the screen AABB of the selection.
  const groupBox = (() => {
    if (sel.length < 2) return null;
    let l = Infinity;
    let t = Infinity;
    let r = -Infinity;
    let b = -Infinity;
    sel.forEach((i) => {
      const it = items[i];
      if (!it) return;
      const q = boxOf(it);
      const rad = (Math.abs(q.angle) * Math.PI) / 180;
      const hw = (Math.abs(Math.cos(rad)) * q.w + Math.abs(Math.sin(rad)) * q.h) / 2;
      const hh = (Math.abs(Math.sin(rad)) * q.w + Math.abs(Math.cos(rad)) * q.h) / 2;
      l = Math.min(l, q.cx - hw);
      t = Math.min(t, q.cy - hh);
      r = Math.max(r, q.cx + hw);
      b = Math.max(b, q.cy + hh);
    });
    return Number.isFinite(l) ? { l, t, w: r - l, h: b - t } : null;
  })();

  const selItem = primary >= 0 ? items[primary] : undefined;
  const selBox = selItem ? boxOf(selItem) : null;

  return (
    <div className="wall-ovl" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      {/* Background: pan / marquee / camera roll, and the click that clears the selection. */}
      <div
        className={"wo-bg" + (hand ? " hand" : "")}
        onPointerDown={startBackground}
        onContextMenu={(e) => e.stopPropagation()}
      />

      {/* Overscan: the recorded frame bright, everything outside it dimmed to 55%. */}
      <div className="wo-dim" style={{ left: 0, top: 0, width: boxW, height: recT }} />
      <div className="wo-dim" style={{ left: 0, top: recT + recH, width: boxW, height: Math.max(0, boxH - recT - recH) }} />
      <div className="wo-dim" style={{ left: 0, top: recT, width: recL, height: recH }} />
      <div className="wo-dim" style={{ left: recL + recW, top: recT, width: Math.max(0, boxW - recL - recW), height: recH }} />
      <div className="wo-rec" style={{ left: recL, top: recT, width: recW, height: recH }} />

      {/* Hit boxes — treatment-inclusive, rotated by (item.rotation - cam.rot). */}
      {items.map((it, i) => {
        const b = boxOf(it);
        // Cheap cull: a wall can hold hundreds of items and most are far off screen.
        if (b.cx < -b.w - 200 || b.cy < -b.h - 200 || b.cx > boxW + b.w + 200 || b.cy > boxH + b.h + 200) return null;
        return (
          <div
            key={i}
            className={
              "wo-hit" +
              (selSet.has(i) ? " on" : "") +
              (i === primary ? " primary" : "") +
              (sceneIdx >= 0 && !itemVisibleInScene(wall, it, sceneIdx) ? " hidden-in-scene" : "")
            }
            style={{
              left: b.cx - b.w / 2,
              top: b.cy - b.h / 2,
              width: b.w,
              height: b.h,
              transform: `rotate(${b.angle}deg)`,
            }}
            title={it.label || ((it.type ?? "image") === "text" ? it.text : it.src) || "item"}
            onPointerDown={startItem(i)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openCtxMenu(e.clientX, e.clientY, frame, { kind: "wallItem", clip: ci, index: i });
            }}
          />
        );
      })}

      {/* Transform handles for the primary selection. Handles are sized in SCREEN px (see CSS) —
          never scaled by zoom, or they would vanish on a pulled-out wall. */}
      {selBox && (
        <div
          className="wo-frame"
          style={{
            left: selBox.cx - selBox.w / 2,
            top: selBox.cy - selBox.h / 2,
            width: selBox.w,
            height: selBox.h,
            transform: `rotate(${selBox.angle}deg)`,
          }}
        >
          {CORNERS.map(([n, fx, fy]) => (
            <div
              key={n}
              className="wo-corner"
              style={{ left: `${fx * 100}%`, top: `${fy * 100}%` }}
              onPointerDown={startHandle("scale")}
            />
          ))}
          <div className="wo-rot" onPointerDown={startHandle("rotate")} />
        </div>
      )}

      {/* Snap guides */}
      {guides.x.map((x, i) => (
        <div key={"gx" + i} className="wo-guide v" style={{ left: x }} />
      ))}
      {guides.y.map((y, i) => (
        <div key={"gy" + i} className="wo-guide h" style={{ top: y }} />
      ))}

      {marquee && (
        <div className="wo-marquee" style={{ left: marquee.l, top: marquee.t, width: marquee.w, height: marquee.h }} />
      )}

      {groupBox && (
        <div
          className="wo-group"
          style={{ left: Math.max(4, groupBox.l), top: Math.max(4, groupBox.t - 34) }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <span className="muted">{sel.length} selected</span>
          <button title="Align left" onClick={() => align("l")}>⇤</button>
          <button title="Align centres (x)" onClick={() => align("cx")}>⇔</button>
          <button title="Align right" onClick={() => align("r")}>⇥</button>
          <button title="Align top" onClick={() => align("t")}>⤒</button>
          <button title="Align middles (y)" onClick={() => align("cy")}>⇕</button>
          <button title="Align bottom" onClick={() => align("b")}>⤓</button>
          <button title="Distribute horizontally" onClick={() => distribute("x")}>⋯</button>
          <button title="Distribute vertically" onClick={() => distribute("y")}>⋮</button>
          <button title="Bring to front (paint last)" onClick={() => zOrder("front")}>▲</button>
          <button title="Send to back (paint first)" onClick={() => zOrder("back")}>▼</button>
        </div>
      )}
    </div>
  );
};
