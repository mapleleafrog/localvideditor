import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PlayerRef } from "@remotion/player";
import { useEditor } from "../store";
import type { Overlay } from "../../../src/timeline/schema";
import { useCurrentPlayerFrame } from "../lib/useCurrentPlayerFrame";
import { scaleFactor, modelToBox, type Box } from "../lib/coords";

interface Props {
  boxRef: React.RefObject<HTMLDivElement | null>;
  playerRef: React.RefObject<PlayerRef | null>;
}

/** content signature — changes only when the rendered SIZE could change (not on transform edits). */
const sig = (o: Overlay) => `${o.type}|${o.text}|${o.fontSize}|${o.src}|${o.width}`;

/** fallback base size (composition px) when the live node isn't measurable yet. */
function estimateBase(o: Overlay): { w: number; h: number } {
  if (o.type === "image") {
    const w = o.width || 600;
    return { w, h: w * 0.66 };
  }
  const fs = o.fontSize || 80;
  const len = (o.text || "Text").length || 4;
  return { w: len * fs * 0.6, h: fs * 1.25 };
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const clampPct = (v: number) => Math.max(-20, Math.min(120, v));

type Gesture = { kind: "move" | "scale" | "rotate"; sx: number; sy: number; cx: number; cy: number; startScale: number; startDist: number };

/** On-canvas selection + transform (drag / corner-scale / rotate), mapped to the composition.
 *  Custom pointer handlers (no external lib): scale = distance-from-center ratio, rotation =
 *  angle-from-center — both pivot on the element CENTER, matching the Timeline's transform-origin
 *  (so x/y stay put while scaling/rotating; only dragging the body moves it). */
export const CanvasOverlay: React.FC<Props> = ({ boxRef, playerRef }) => {
  const { project, selection, select, patchOverlay } = useEditor();
  const overlays = project.overlays;
  const compW = project.width ?? 1920;
  const frame = useCurrentPlayerFrame(playerRef);

  const [boxSize, setBoxSize] = useState({ w: 0, h: 0 });
  const [isPlaying, setIsPlaying] = useState(false);
  const [measureTick, setMeasureTick] = useState(0);
  void measureTick; // bumped after measuring to refine estimated boxes

  const baseCache = useRef<Map<string, { w: number; h: number }>>(new Map());
  const gestureRef = useRef<Gesture | null>(null);

  // Track the composition box's on-screen size (uniform aspect => uniform scale k).
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setBoxSize({ w: r.width, h: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [boxRef]);

  // Don't measure the DOM during playback (avoids per-frame reflow).
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    p.addEventListener("play", onPlay);
    p.addEventListener("pause", onPause);
    p.addEventListener("ended", onPause);
    return () => {
      p.removeEventListener("play", onPlay);
      p.removeEventListener("pause", onPause);
      p.removeEventListener("ended", onPause);
    };
  }, [playerRef]);

  const isVisible = (o: Overlay) => frame >= (o.from ?? 0) && frame < (o.from ?? 0) + o.durationInFrames;
  // fx layers are full-frame — no on-canvas handles (edit them in the Inspector).
  const canTransform = (o: Overlay) => o.type !== "fx";
  const visible = overlays.map((o, i) => ({ o, i })).filter(({ o }) => isVisible(o) && canTransform(o));
  const visibleSig = visible.map((v) => v.i).join(",");
  const contentSig = useMemo(() => overlays.map(sig).join("||"), [overlays]);

  // Measure base (unscaled) content sizes from the live Remotion nodes and cache them.
  useLayoutEffect(() => {
    if (isPlaying) return;
    const root = boxRef.current;
    if (!root) return;
    let changed = false;
    for (const { o, i } of visible) {
      const node = root.querySelector(`[data-ovl-index="${i}"]`) as HTMLElement | null;
      if (node && node.offsetWidth && node.offsetHeight) {
        const key = sig(o);
        const prev = baseCache.current.get(key);
        if (!prev || prev.w !== node.offsetWidth || prev.h !== node.offsetHeight) {
          baseCache.current.set(key, { w: node.offsetWidth, h: node.offsetHeight });
          changed = true;
        }
      }
    }
    if (changed) setMeasureTick((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleSig, boxSize.w, boxSize.h, isPlaying, contentSig]);

  // When selecting an overlay that's off its time-window, seek into it so handles appear.
  useEffect(() => {
    if (selection?.kind !== "overlay") return;
    const o = overlays[selection.index];
    const p = playerRef.current;
    if (!o || !p) return;
    const cur = p.getCurrentFrame();
    const from = o.from ?? 0;
    if (cur < from || cur >= from + o.durationInFrames) p.seekTo(from);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection?.kind, selection?.index]);

  if (!boxSize.w) return null;
  const k = scaleFactor(boxSize.w, compW);
  const getBase = (o: Overlay) => baseCache.current.get(sig(o)) ?? estimateBase(o);
  const geoOf = (o: Overlay): Box =>
    modelToBox({ x: o.x ?? 50, y: o.y ?? 50, scale: o.scale ?? 1, rotation: o.rotation ?? 0 }, getBase(o).w, getBase(o).h, boxSize.w, boxSize.h, k);

  const selIndex = selection?.kind === "overlay" ? selection.index : -1;
  const selOverlay = selIndex >= 0 ? overlays[selIndex] : null;
  const selVisible = selOverlay ? isVisible(selOverlay) && canTransform(selOverlay) : false;

  // --- custom transform gestures (center-pivot; pointer-capture keeps tracking off-element) ---
  const localPt = (e: React.PointerEvent) => {
    const r = boxRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const startGesture = (kind: Gesture["kind"]) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selOverlay) return;
    const g = geoOf(selOverlay);
    const cx = g.left + g.width / 2;
    const cy = g.top + g.height / 2;
    const p = localPt(e);
    gestureRef.current = {
      kind, sx: p.x, sy: p.y, cx, cy,
      startScale: selOverlay.scale ?? 1,
      startDist: Math.hypot(p.x - cx, p.y - cy) || 1,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const moveGesture = (e: React.PointerEvent) => {
    const d = gestureRef.current;
    if (!d || selIndex < 0) return;
    const p = localPt(e);
    if (d.kind === "move") {
      const ncx = d.cx + (p.x - d.sx);
      const ncy = d.cy + (p.y - d.sy);
      patchOverlay(selIndex, { x: r1(clampPct((ncx / boxSize.w) * 100)), y: r1(clampPct((ncy / boxSize.h) * 100)) });
    } else if (d.kind === "scale") {
      const dist = Math.hypot(p.x - d.cx, p.y - d.cy);
      patchOverlay(selIndex, { scale: r2(Math.max(0.05, (d.startScale * dist) / d.startDist)) });
    } else {
      const ang = Math.round((Math.atan2(p.y - d.cy, p.x - d.cx) * 180) / Math.PI + 90);
      const norm = (((ang + 180) % 360) + 360) % 360 - 180; // keep within the Inspector's [-180,180]
      patchOverlay(selIndex, { rotation: norm });
    }
  };
  const endGesture = (e: React.PointerEvent) => {
    if (!gestureRef.current) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    gestureRef.current = null;
  };
  const handle = (kind: Gesture["kind"]) => ({ onPointerDown: startGesture(kind), onPointerMove: moveGesture, onPointerUp: endGesture });

  const CORNERS: [string, number, number][] = [["nw", 0, 0], ["ne", 1, 0], ["sw", 0, 1], ["se", 1, 1]];

  return (
    <div className="canvas-ovl" style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}>
      {/* click-to-select hit areas for the non-selected visible overlays */}
      {visible.map(({ o, i }) => {
        if (i === selIndex) return null;
        const g = geoOf(o);
        return (
          <div
            key={i}
            className="cv-hit"
            style={{ position: "absolute", left: g.left, top: g.top, width: g.width, height: g.height, transform: `rotate(${g.rot}deg)`, pointerEvents: "auto" }}
            title={o.type === "text" ? o.text : o.src}
            onPointerDown={(e) => { e.stopPropagation(); select({ kind: "overlay", index: i }); }}
          />
        );
      })}

      {/* transform handles for the selected overlay */}
      {selOverlay && selVisible && (() => {
        const g = geoOf(selOverlay);
        return (
          <div
            className="cv-frame"
            style={{ position: "absolute", left: g.left, top: g.top, width: g.width, height: g.height, transform: `rotate(${g.rot}deg)`, pointerEvents: "none" }}
          >
            <div className="cv-body" style={{ position: "absolute", inset: 0, pointerEvents: "auto", cursor: "move" }} {...handle("move")} />
            {CORNERS.map(([n, fx, fy]) => (
              <div
                key={n}
                className="cv-corner"
                style={{ position: "absolute", left: `${fx * 100}%`, top: `${fy * 100}%`, transform: "translate(-50%, -50%)", pointerEvents: "auto" }}
                {...handle("scale")}
              />
            ))}
            <div
              className="cv-rot"
              style={{ position: "absolute", left: "50%", top: 0, transform: "translate(-50%, -160%)", pointerEvents: "auto" }}
              {...handle("rotate")}
            />
          </div>
        );
      })()}
    </div>
  );
};
