import React, { useEffect, useRef, useState } from "react";
import type { PlayerRef } from "@remotion/player";
import { useEditor } from "../store";
import type { AudioTrack, Clip, Overlay } from "../../../src/timeline/schema";
import { computeDuration, clipStarts, fmtTime } from "../lib/timeline-utils";
import { startBlockDrag, startScrub } from "../lib/drag";
import { useCurrentPlayerFrame } from "../lib/useCurrentPlayerFrame";
import { uploadMedia } from "../lib/api";
import { ensureProjectName } from "../lib/names";

const RULER_H = 24;
const LANE_H = 40;

const isAudioFile = (n: string) => /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(n);
const isVideoFile = (n: string) => /\.(mp4|webm|mov)$/i.test(n);
const audioTrack = (src: string): AudioTrack => ({ src, volume: 1, from: 0, trimBefore: 0, trimAfter: 0, loop: false });

const newClip = (src = "clip-a.svg", type: "image" | "video" = "image"): Clip => ({
  type, src, durationInFrames: 60, motion: "none",
  transitionToNext: "none", transitionDurationInFrames: 20, trimBefore: 0, trimAfter: 0, volume: 1,
  label: "", note: "",
});
const newOverlay = (type: "text" | "image" | "fx", from: number, width = 200): Overlay => ({
  type,
  text: type === "text" ? "New text" : "Title",
  src: "orange-mush.gif",
  from,
  durationInFrames: type === "fx" ? 120 : 60,
  x: 50, y: 50, scale: 1, rotation: 0, opacity: 1,
  // FX layers start with a romantic atmospheric so the new layer is visibly doing something.
  motions: type === "fx" ? ["weddingPetals"] : [],
  z: 0.4, windowInFrames: 30, enter: "none", exit: "none", enterDurationInFrames: 15, exitDurationInFrames: 15,
  fontSize: 80, color: "#ffffff", glow: "", width,
});

const Playhead: React.FC<{ playerRef: React.RefObject<PlayerRef | null>; zoom: number }> = ({ playerRef, zoom }) => {
  const frame = useCurrentPlayerFrame(playerRef);
  return (
    <div className="tl-playhead" style={{ left: frame * zoom }}>
      <div className="tl-playhead-head" />
    </div>
  );
};

/** Live current-time / total readout — subscribes to the player so only this span re-renders per tick. */
const TimeReadout: React.FC<{ playerRef: React.RefObject<PlayerRef | null>; total: number; fps: number }> = ({
  playerRef,
  total,
  fps,
}) => {
  const f = useCurrentPlayerFrame(playerRef);
  return (
    <span className="muted tl-readout" title="Current / total (mm:ss · frame)">
      {fmtTime(f, fps)} / {fmtTime(total, fps)} · {f}/{total}f
    </span>
  );
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const SNAP_PX = 8;

export const TimelinePanel: React.FC<{ playerRef: React.RefObject<PlayerRef | null> }> = ({ playerRef }) => {
  const { project, zoom, selection, select, patchClip, patchOverlay, addClip, addOverlay, addAudio, reorderOverlay, setZoom, splitSelected, duplicateSelected } =
    useEditor();
  const scrollRef = useRef<HTMLDivElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const fps = project.fps ?? 30;
  const total = computeDuration(project);
  const maxDur = project.durationInFrames && project.durationInFrames > 0 ? project.durationInFrames : Infinity;
  const capDur = (n: number) => Math.min(maxDur, n);
  const starts = clipStarts(project);
  const innerW = total * zoom + 80;
  const overlayCount = project.overlays.length;
  const [dropping, setDropping] = useState(false);

  // Snap-to-edge toggle (persisted). Magnet pulls dragged block edges to playhead / clip boundaries / 0.
  const [snapOn, setSnapOn] = useState(() => localStorage.getItem("soranji.tl.snap") !== "0");
  useEffect(() => localStorage.setItem("soranji.tl.snap", snapOn ? "1" : "0"), [snapOn]);

  // Live playhead frame, read on demand (no per-tick re-render of the whole panel).
  const phFrame = () => Math.round(playerRef.current?.getCurrentFrame() ?? 0);
  // Snap targets: 0, the timeline end, every clip boundary, and the current playhead.
  const snap = () => {
    if (!snapOn) return undefined;
    const pts = new Set<number>([0, total, phFrame()]);
    project.clips.forEach((c, i) => {
      pts.add(starts[i]);
      pts.add(starts[i] + c.durationInFrames);
    });
    return { targets: [...pts], px: SNAP_PX };
  };

  // Ctrl/⌘ + wheel = zoom the timeline, keeping the frame under the cursor anchored.
  // Native non-passive listener so preventDefault actually suppresses the page scroll.
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const z = zoomRef.current;
      const frameAt = (e.clientX - rect.left + el.scrollLeft) / z;
      const nz = clamp(z * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 0.2, 40);
      setZoom(nz);
      requestAnimationFrame(() => {
        el.scrollLeft = Math.max(0, frameAt * nz - (e.clientX - rect.left));
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setZoom]);

  const fitZoom = () => {
    const el = scrollRef.current;
    if (el && el.clientWidth > 0 && total > 0) setZoom(clamp((el.clientWidth - 24) / total, 0.2, 40));
  };

  // Drop media onto the timeline: video/image → a new clip; audio → a new soundtrack track.
  const onDropFiles = async (e: React.DragEvent) => {
    e.preventDefault();
    setDropping(false);
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;
    const proj = ensureProjectName();
    if (!proj) return;
    for (const f of files) {
      const r = await uploadMedia(f, proj);
      if (!r.ok || !r.ref) continue;
      if (isAudioFile(f.name)) addAudio(audioTrack(r.ref));
      else addClip(newClip(r.ref, isVideoFile(f.name) ? "video" : "image"));
    }
  };

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
  const reorderTo = (from: number, to: number) => {
    const clamped = Math.max(0, Math.min(overlayCount - 1, to));
    if (clamped === from) return;
    reorderOverlay(from, clamped);
    select({ kind: "overlay", index: clamped });
  };
  const moveOverlay = (i: number, dir: -1 | 1) => reorderTo(i, i + dir);

  // right-click layer menu + drag-to-reorder lanes
  const [menu, setMenu] = useState<{ x: number; y: number; index: number } | null>(null);
  const dragLane = useRef<number | null>(null);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);
  const onRulerDown = (e: React.PointerEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    startScrub(e, zoom, el.getBoundingClientRect().left, el.scrollLeft, total - 1, seek);
  };
  // Click/drag on empty lane background (or the inner gap) to move the playhead — like every NLE.
  const onBodyDown = (e: React.PointerEvent) => {
    const t = e.target as HTMLElement;
    if (t === e.currentTarget || t.classList.contains("tl-lane")) onRulerDown(e);
  };

  const seconds = Math.ceil(total / fps);

  return (
    <div className="tl">
      <div className="tl-toolbar">
        <button className="primary" onClick={() => playerRef.current?.toggle()} title="Play / Pause (Space)">
          {playing ? "⏸ Pause" : "▶ Play"}
        </button>
        <span className="sep" />
        <button onClick={() => addClip(newClip())} title="Append a clip to the track">+ Clip</button>
        <button onClick={() => addOverlay(newOverlay("text", phFrame()))} title="Add a text layer at the playhead">+ Text</button>
        <button onClick={() => addOverlay(newOverlay("image", phFrame(), Math.round((project.width ?? 1920) * 0.5)))} title="Add an image layer at the playhead">+ Image</button>
        <button onClick={() => addOverlay(newOverlay("fx", phFrame()))} title="Full-frame effect layer at the playhead (petals, bokeh, light-leaks…)">+ FX</button>
        <span className="sep" />
        <button onClick={() => splitSelected(phFrame())} disabled={!selection} title="Split at playhead (S)">✂ Split</button>
        <button onClick={duplicateSelected} disabled={!selection} title="Duplicate selection (Ctrl+D)">⎘ Duplicate</button>
        <span className="sep" />
        <button className={snapOn ? "on" : ""} onClick={() => setSnapOn((v) => !v)} title="Snap block edges to playhead / clip edges">🧲</button>
        <button onClick={() => setZoom(clamp(zoom - 1, 0.2, 40))} title="Zoom out">−</button>
        <span className="muted">zoom</span>
        <button onClick={() => setZoom(clamp(zoom + 1, 0.2, 40))} title="Zoom in">+</button>
        <button onClick={fitZoom} title="Zoom to fit (Ctrl+wheel to zoom on the timeline)">⤢ Fit</button>
        <span className="sep" />
        <TimeReadout playerRef={playerRef} total={total} fps={fps} />
      </div>

      <div className="tl-body">
        <div className="tl-gutter" ref={gutterRef}>
          <div className="tl-gutter-row tl-gutter-top" style={{ height: RULER_H }} />
          <div className="tl-gutter-row" style={{ height: LANE_H }}>CLIPS</div>
          {project.overlays.map((o, i) => (
            <div
              key={i}
              className={"tl-gutter-row clickable" + (selection?.kind === "overlay" && selection.index === i ? " on" : "")}
              style={{ height: LANE_H }}
              onClick={() => select({ kind: "overlay", index: i })}
              title="Click to select · drag to reorder · right-click for more"
              draggable
              onDragStart={(e) => {
                dragLane.current = i;
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (dragLane.current !== null) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragLane.current !== null && dragLane.current !== i) reorderTo(dragLane.current, i);
                dragLane.current = null;
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                select({ kind: "overlay", index: i });
                setMenu({ x: e.clientX, y: e.clientY, index: i });
              }}
            >
              <span className="ovl-label">
                {o.type === "text" ? "T" : o.type === "fx" ? "✦" : o.type === "video" ? "▶" : "▦"}{" "}
                {o.type === "text" ? (o.text || "text").slice(0, 8) : o.type === "fx" ? "fx" : o.type === "video" ? "video" : "image"}
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

        <div
          className={"tl-scroll" + (dropping ? " dropping" : "")}
          ref={scrollRef}
          onScroll={(e) => { if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop; }}
          onDragOver={(e) => { e.preventDefault(); if (!dropping) setDropping(true); }}
          onDragLeave={(e) => { if (e.currentTarget === e.target) setDropping(false); }}
          onDrop={onDropFiles}
        >
          <div className="tl-inner" style={{ width: innerW }} onPointerDown={onBodyDown}>
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
                        startBlockDrag(
                          e,
                          "right",
                          zoom,
                          { from: starts[i], durationInFrames: c.durationInFrames },
                          (s) => patchClip(i, { durationInFrames: capDur(s.durationInFrames) }),
                          1,
                          snap(),
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
                      startBlockDrag(
                        e,
                        "move",
                        zoom,
                        { from: o.from, durationInFrames: o.durationInFrames },
                        (s) => patchOverlay(i, { from: s.from }),
                        1,
                        snap(),
                      );
                    }}
                    title={`${o.type === "text" ? o.text : o.src} · from ${o.from}f · ${o.durationInFrames}f`}
                  >
                    <span
                      className="tl-handle left"
                      onPointerDown={(e) =>
                        startBlockDrag(
                          e,
                          "left",
                          zoom,
                          { from: o.from, durationInFrames: o.durationInFrames },
                          (s) => patchOverlay(i, { from: s.from, durationInFrames: capDur(s.durationInFrames) }),
                          1,
                          snap(),
                        )
                      }
                    />
                    <span className="tl-block-label">{o.type === "text" ? o.text || "text" : o.type === "fx" ? `fx · ${o.motions[0] ?? "empty"}` : o.src}</span>
                    <span
                      className="tl-handle right"
                      onPointerDown={(e) =>
                        startBlockDrag(
                          e,
                          "right",
                          zoom,
                          { from: o.from, durationInFrames: o.durationInFrames },
                          (s) => patchOverlay(i, { durationInFrames: capDur(s.durationInFrames) }),
                          1,
                          snap(),
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

      {menu && (
        <div className="ctx-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          <button disabled={menu.index === 0} onClick={() => { reorderTo(menu.index, 0); setMenu(null); }}>Move to top</button>
          <button disabled={menu.index === 0} onClick={() => { moveOverlay(menu.index, -1); setMenu(null); }}>Move up</button>
          <button disabled={menu.index === overlayCount - 1} onClick={() => { moveOverlay(menu.index, 1); setMenu(null); }}>Move down</button>
          <button disabled={menu.index === overlayCount - 1} onClick={() => { reorderTo(menu.index, overlayCount - 1); setMenu(null); }}>Move to bottom</button>
        </div>
      )}
    </div>
  );
};
