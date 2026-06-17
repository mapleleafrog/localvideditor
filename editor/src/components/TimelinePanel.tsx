import React, { useEffect, useRef, useState } from "react";
import type { PlayerRef } from "@remotion/player";
import { useEditor } from "../store";
import type { Clip, Overlay } from "../../../src/timeline/schema";
import { computeDuration, clipStarts, fmtTime } from "../lib/timeline-utils";
import { startBlockDrag, startScrub } from "../lib/drag";
import { useCurrentPlayerFrame } from "../lib/useCurrentPlayerFrame";

const RULER_H = 24;
const LANE_H = 40;

const newClip = (): Clip => ({
  type: "image", src: "clip-a.svg", durationInFrames: 60, motion: "none",
  transitionToNext: "none", transitionDurationInFrames: 20, trimBefore: 0, trimAfter: 0, volume: 1,
});
const newOverlay = (type: "text" | "image", from: number): Overlay => ({
  type, text: type === "text" ? "New text" : "Title", src: "orange-mush.gif",
  from, durationInFrames: 60, x: 50, y: 50, scale: 1, rotation: 0, opacity: 1,
  motions: [], z: 0.4, windowInFrames: 30, fontSize: 80, color: "#ffffff", glow: "", width: 200,
});

const Playhead: React.FC<{ playerRef: React.RefObject<PlayerRef | null>; zoom: number }> = ({ playerRef, zoom }) => {
  const frame = useCurrentPlayerFrame(playerRef);
  return <div className="tl-playhead" style={{ left: frame * zoom }} />;
};

export const TimelinePanel: React.FC<{ playerRef: React.RefObject<PlayerRef | null> }> = ({ playerRef }) => {
  const { project, zoom, selection, select, patchClip, patchOverlay, addClip, addOverlay, reorderOverlay, setZoom } =
    useEditor();
  const scrollRef = useRef<HTMLDivElement>(null);
  const fps = project.fps ?? 30;
  const total = computeDuration(project);
  const starts = clipStarts(project);
  const innerW = total * zoom + 80;
  const overlayCount = project.overlays.length;

  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    const on = () => setPlaying(true);
    const off = () => setPlaying(false);
    p.addEventListener("play", on);
    p.addEventListener("pause", off);
    p.addEventListener("ended", off);
    return () => {
      p.removeEventListener("play", on);
      p.removeEventListener("pause", off);
      p.removeEventListener("ended", off);
    };
  }, [playerRef]);

  const seek = (f: number) => playerRef.current?.seekTo(f);
  // reorder an overlay lane (= compositing z-order), keeping the selection on the moved item
  const moveOverlay = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= overlayCount) return;
    reorderOverlay(i, j);
    if (selection?.kind === "overlay") {
      if (selection.index === i) select({ kind: "overlay", index: j });
      else if (selection.index === j) select({ kind: "overlay", index: i });
    }
  };
  const onRulerDown = (e: React.PointerEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    startScrub(e, zoom, el.getBoundingClientRect().left, el.scrollLeft, total - 1, seek);
  };

  const seconds = Math.ceil(total / fps);

  return (
    <div className="tl">
      <div className="tl-toolbar">
        <button className="primary" onClick={() => playerRef.current?.toggle()} title="Play / Pause (Space)">
          {playing ? "⏸ Pause" : "▶ Play"}
        </button>
        <span className="sep" />
        <button onClick={() => addClip(newClip())}>+ Clip</button>
        <button onClick={() => addOverlay(newOverlay("text", 0))}>+ Text</button>
        <button onClick={() => addOverlay(newOverlay("image", 0))}>+ Image</button>
        <span className="sep" />
        <button onClick={() => setZoom(Math.max(1, zoom - 1))}>−</button>
        <span className="muted">zoom</span>
        <button onClick={() => setZoom(Math.min(20, zoom + 1))}>+</button>
        <span className="sep" />
        <span className="muted">{fmtTime(0, fps)} / {fmtTime(total, fps)} · {total}f</span>
      </div>

      <div className="tl-body">
        <div className="tl-gutter">
          <div className="tl-gutter-row" style={{ height: RULER_H }} />
          <div className="tl-gutter-row" style={{ height: LANE_H }}>CLIPS</div>
          {project.overlays.map((o, i) => (
            <div
              key={i}
              className={"tl-gutter-row clickable" + (selection?.kind === "overlay" && selection.index === i ? " on" : "")}
              style={{ height: LANE_H }}
              onClick={() => select({ kind: "overlay", index: i })}
              title="Click to select layer"
            >
              <span className="ovl-label">
                {o.type === "text" ? "T" : "▦"} {o.type === "text" ? (o.text || "text").slice(0, 8) : "image"}
              </span>
              <span className="ovl-reorder">
                <button
                  title="Bring forward (up)"
                  disabled={i === 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    moveOverlay(i, -1);
                  }}
                >
                  ▲
                </button>
                <button
                  title="Send backward (down)"
                  disabled={i === overlayCount - 1}
                  onClick={(e) => {
                    e.stopPropagation();
                    moveOverlay(i, 1);
                  }}
                >
                  ▼
                </button>
              </span>
            </div>
          ))}
        </div>

        <div className="tl-scroll" ref={scrollRef}>
          <div className="tl-inner" style={{ width: innerW }}>
            {/* ruler */}
            <div className="tl-ruler" style={{ height: RULER_H }} onPointerDown={onRulerDown}>
              {Array.from({ length: seconds + 1 }, (_, s) => (
                <div key={s} className="tl-tick" style={{ left: s * fps * zoom }}>
                  <span>{s}s</span>
                </div>
              ))}
            </div>

            {/* clip track (sequential) */}
            <div className="tl-lane" style={{ height: LANE_H }}>
              {project.clips.map((c, i) => {
                const sel = selection?.kind === "clip" && selection.index === i;
                return (
                  <div
                    key={i}
                    className={"tl-block clip" + (sel ? " on" : "")}
                    style={{ left: starts[i] * zoom, width: c.durationInFrames * zoom }}
                    onPointerDown={() => select({ kind: "clip", index: i })}
                    title={`${c.src} · ${c.durationInFrames}f` + (c.transitionToNext !== "none" ? ` · →${c.transitionToNext}` : "")}
                  >
                    <span className="tl-block-label">{c.src}</span>
                    {c.transitionToNext !== "none" && <span className="tl-trans">⇥</span>}
                    <span
                      className="tl-handle right"
                      onPointerDown={(e) =>
                        startBlockDrag(e, "right", zoom, { from: 0, durationInFrames: c.durationInFrames }, (s) =>
                          patchClip(i, { durationInFrames: s.durationInFrames }),
                        )
                      }
                    />
                  </div>
                );
              })}
            </div>

            {/* overlay lanes */}
            {project.overlays.map((o, i) => {
              const sel = selection?.kind === "overlay" && selection.index === i;
              return (
                <div key={i} className="tl-lane" style={{ height: LANE_H }}>
                  <div
                    className={"tl-block overlay" + (sel ? " on" : "")}
                    style={{ left: o.from * zoom, width: o.durationInFrames * zoom }}
                    onPointerDown={(e) => {
                      select({ kind: "overlay", index: i });
                      startBlockDrag(e, "move", zoom, { from: o.from, durationInFrames: o.durationInFrames }, (s) =>
                        patchOverlay(i, { from: s.from }),
                      );
                    }}
                    title={`${o.type === "text" ? o.text : o.src} · from ${o.from}f · ${o.durationInFrames}f`}
                  >
                    <span
                      className="tl-handle left"
                      onPointerDown={(e) =>
                        startBlockDrag(e, "left", zoom, { from: o.from, durationInFrames: o.durationInFrames }, (s) =>
                          patchOverlay(i, { from: s.from, durationInFrames: s.durationInFrames }),
                        )
                      }
                    />
                    <span className="tl-block-label">{o.type === "text" ? o.text || "text" : o.src}</span>
                    <span
                      className="tl-handle right"
                      onPointerDown={(e) =>
                        startBlockDrag(e, "right", zoom, { from: o.from, durationInFrames: o.durationInFrames }, (s) =>
                          patchOverlay(i, { durationInFrames: s.durationInFrames }),
                        )
                      }
                    />
                  </div>
                </div>
              );
            })}

            <Playhead playerRef={playerRef} zoom={zoom} />
          </div>
        </div>
      </div>
    </div>
  );
};
