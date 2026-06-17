import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Moveable from "react-moveable";
import type { PlayerRef } from "@remotion/player";
import { useEditor } from "../store";
import type { Overlay } from "../../../src/timeline/schema";
import { useCurrentPlayerFrame } from "../lib/useCurrentPlayerFrame";
import { scaleFactor, modelToBox, boxToModelXY, type Box } from "../lib/coords";

interface Props {
  boxRef: React.RefObject<HTMLDivElement | null>;
  playerRef: React.RefObject<PlayerRef | null>;
}

/** content signature — changes only when the rendered SIZE could change (not on transform edits). */
const sig = (o: Overlay) => `${o.type}|${o.text}|${o.fontSize}|${o.src}|${o.width}`;

/** fallback base size (composition px) when the live node isn't measurable yet. */
function estimateBase(o: Overlay): { w: number; h: number } {
  if (o.type === "image") {
    const w = o.width || 200;
    return { w, h: w * 0.66 };
  }
  const fs = o.fontSize || 80;
  const len = (o.text || "Text").length || 4;
  return { w: len * fs * 0.6, h: fs * 1.25 };
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** On-canvas selection + transform (drag / resize=scale / rotate), mapped to the composition.
 *  The transform semantics MATCH the Timeline: scale & rotation pivot on the element center,
 *  so resizing/rotating keeps x/y fixed; only dragging changes x/y. */
export const CanvasOverlay: React.FC<Props> = ({ boxRef, playerRef }) => {
  const { project, selection, select, patchOverlay } = useEditor();
  const overlays = project.overlays;
  const compW = project.width ?? 1920;
  const frame = useCurrentPlayerFrame(playerRef);

  const [boxSize, setBoxSize] = useState({ w: 0, h: 0 });
  const [override, setOverride] = useState<Box | null>(null);
  const [proxyEl, setProxyEl] = useState<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [measureTick, setMeasureTick] = useState(0);
  void measureTick; // bumped after measuring to refine estimated boxes

  const baseCache = useRef<Map<string, { w: number; h: number }>>(new Map());
  const geoRef = useRef<Box | null>(null);
  const baseRef = useRef<{ w: number; h: number } | null>(null);
  const scaleStartRef = useRef(1);

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
  const visible = overlays.map((o, i) => ({ o, i })).filter(({ o }) => isVisible(o));
  const visibleSig = visible.map((v) => v.i).join(",");
  const contentSig = useMemo(() => overlays.map(sig).join("||"), [overlays]);

  // Measure base (unscaled) content sizes from the live Remotion nodes and cache them.
  useLayoutEffect(() => {
    if (isPlaying || override) return;
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
  }, [visibleSig, boxSize.w, boxSize.h, isPlaying, contentSig, override]);

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
  const geoOf = (o: Overlay): Box => {
    const base = getBase(o);
    return modelToBox(
      { x: o.x ?? 50, y: o.y ?? 50, scale: o.scale ?? 1, rotation: o.rotation ?? 0 },
      base.w,
      base.h,
      boxSize.w,
      boxSize.h,
      k,
    );
  };

  const selIndex = selection?.kind === "overlay" ? selection.index : -1;
  const selOverlay = selIndex >= 0 ? overlays[selIndex] : null;
  const selVisible = selOverlay ? isVisible(selOverlay) : false;

  return (
    <div className="canvas-ovl" style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {/* click-to-select hit areas for the non-selected visible overlays */}
      {visible.map(({ o, i }) => {
        if (i === selIndex) return null;
        const g = geoOf(o);
        return (
          <div
            key={i}
            className="cv-hit"
            style={{
              position: "absolute",
              left: g.left,
              top: g.top,
              width: g.width,
              height: g.height,
              transform: `rotate(${g.rot}deg)`,
              pointerEvents: "auto",
            }}
            title={o.type === "text" ? o.text : o.src}
            onPointerDown={(e) => {
              e.stopPropagation();
              select({ kind: "overlay", index: i });
            }}
          />
        );
      })}

      {/* transform handles for the selected overlay */}
      {selOverlay && selVisible && (() => {
        const base = getBase(selOverlay);
        const g = override ?? geoOf(selOverlay);
        geoRef.current = g;
        baseRef.current = base;
        return (
          <>
            <div
              ref={setProxyEl}
              className="cv-proxy"
              style={{
                position: "absolute",
                left: g.left,
                top: g.top,
                width: g.width,
                height: g.height,
                transform: `rotate(${g.rot}deg)`,
                pointerEvents: "auto",
              }}
            />
            {proxyEl && (
              <Moveable
                target={proxyEl}
                draggable
                scalable
                rotatable
                keepRatio
                origin={false}
                renderDirections={["nw", "ne", "sw", "se"]}
                throttleDrag={0}
                throttleScale={0}
                throttleRotate={0}
                onDragStart={() => setOverride(geoRef.current)}
                onDrag={(e) => {
                  const cur = geoRef.current!;
                  const nb: Box = { ...cur, left: e.left, top: e.top };
                  setOverride(nb);
                  const { x, y } = boxToModelXY(nb, boxSize.w, boxSize.h);
                  patchOverlay(selIndex, { x: r1(x), y: r1(y) });
                }}
                onDragEnd={() => setOverride(null)}
                onScaleStart={() => {
                  setOverride(geoRef.current);
                  scaleStartRef.current = overlays[selIndex]?.scale ?? 1;
                }}
                onScale={(e) => {
                  // uniform scale around the center (matches the composition's transform-origin)
                  const cur = geoRef.current!;
                  const ns = Math.max(0.05, scaleStartRef.current * (e.scale[0] || 1));
                  const cx = cur.left + cur.width / 2;
                  const cy = cur.top + cur.height / 2;
                  const w = baseRef.current!.w * ns * k;
                  const h = baseRef.current!.h * ns * k;
                  setOverride({ left: cx - w / 2, top: cy - h / 2, width: w, height: h, rot: cur.rot });
                  patchOverlay(selIndex, { scale: r2(ns) });
                }}
                onScaleEnd={() => setOverride(null)}
                onRotateStart={() => setOverride(geoRef.current)}
                onRotate={(e) => {
                  const cur = geoRef.current!;
                  setOverride({ ...cur, rot: e.rotation });
                  patchOverlay(selIndex, { rotation: Math.round(e.rotation) });
                }}
                onRotateEnd={() => setOverride(null)}
              />
            )}
          </>
        );
      })()}
    </div>
  );
};
