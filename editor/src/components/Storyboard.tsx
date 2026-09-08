import React, { useState } from "react";
import { useEditor } from "../store";
import type { Clip } from "../../../src/timeline/schema";
import { readyTransitions } from "../lib/effects-bridge";
import { fmtTime } from "../lib/timeline-utils";
import { fitDurationPatch, wallFitStatus, wallOf, wallSummary } from "../lib/wall-edit";
import { WallMiniMap } from "./WallMiniMap";

const TRANSITIONS = readyTransitions().map((t) => ({ id: t.id, name: t.name }));

/** Vite serves the project's public/ at "/", so local clip srcs resolve there. */
const boardSrc = (src: string) => (/^https?:\/\//.test(src) ? src : "/" + src.replace(/^\/+/, ""));
/** Checked AFTER isWall — this regex would misfire on a leftover `.mp4` src on a converted clip. */
const isVideo = (c: Clip) => c.type === "video" || /\.(mp4|webm|mov|m4v)$/i.test(c.src);
const isWall = (c: Clip) => c.type === "wall";

/** Same shape as TimelinePanel's newClip + the storyboard text fields. */
const newClip = (): Clip => ({
  type: "image", src: "clip-a.svg", durationInFrames: 60, motion: "none",
  transitionToNext: "none", transitionDurationInFrames: 20, trimBefore: 0, trimAfter: 0, volume: 1,
  label: "", note: "",
});

const Thumb: React.FC<{ clip: Clip; W: number; H: number; fps: number }> = ({ clip, W, H, fps }) => {
  const [err, setErr] = useState(false);
  // Wall FIRST: it shows the whole wall AND where scene 1 looks, in one small SVG with no Player —
  // and a wall clip's `src` is empty (or stale), which the checks below would render as "no footage".
  if (isWall(clip)) {
    return (
      <div className="sb-thumb sb-thumb-wall">
        <WallMiniMap wall={wallOf(clip)} W={W} H={H} fps={fps} width={220} height={124} highlight={0} showScenes />
        <span className="sb-badge">🧱 wall</span>
      </div>
    );
  }
  const src = clip.src ? boardSrc(clip.src) : "";
  if (!src || err) {
    return <div className="sb-thumb placeholder">{clip.label || "no footage"}</div>;
  }
  if (isVideo(clip)) {
    return <video className="sb-thumb" muted preload="metadata" src={src + "#t=0.1"} onError={() => setErr(true)} />;
  }
  return <img className="sb-thumb" src={src} alt={clip.label || clip.src} onError={() => setErr(true)} />;
};

/** Clip-tied storyboard: each card IS a clip on the timeline. Reorder / add / delete / label / annotate
 *  here and it changes the real edit; effects, titles and overlays are layered in the Edit tab. */
export const Storyboard: React.FC = () => {
  const { project, selection, patchClip, addClip, reorderClip, select, removeSelected, setView, setWallClip } =
    useEditor();
  const clips = project.clips;
  const fps = project.fps ?? 30;
  const compW = project.width ?? 1920;
  const compH = project.height ?? 1080;
  const fits = wallFitStatus(project);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= clips.length) return;
    reorderClip(i, j);
    select({ kind: "clip", index: j });
  };
  const onDrop = (to: number) => {
    if (dragIndex !== null && dragIndex !== to) {
      reorderClip(dragIndex, to);
      select({ kind: "clip", index: to });
    }
    setDragIndex(null);
  };

  return (
    <div className="sb">
      <div className="sb-head">
        <strong>Storyboard</strong>
        <span className="muted">
          {clips.length} shot{clips.length === 1 ? "" : "s"} · cards are your clips — drag to reorder, label &amp;
          annotate. Effects, titles &amp; overlays live in the Edit tab.
        </span>
      </div>

      <div className="sb-grid">
        {clips.map((c, i) => {
          const sel = selection?.kind === "clip" && selection.index === i;
          const wall = isWall(c);
          const summary = wall ? wallSummary(wallOf(c), fps, compW, compH) : null;
          const fit = wall ? fits.find((f) => f.clip === i) ?? null : null;
          return (
            <div
              key={i}
              className={"sb-card" + (sel ? " on" : "") + (dragIndex === i ? " dragging" : "")}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(i)}
              onClick={() => select({ kind: "clip", index: i })}
            >
              <div className="sb-meta">
                <span className="sb-idx">{i + 1}</span>
                <span className="sb-move">
                  <button title="Move left" disabled={i === 0} onClick={(e) => { stop(e); move(i, -1); }}>◀</button>
                  <button title="Move right" disabled={i === clips.length - 1} onClick={(e) => { stop(e); move(i, 1); }}>▶</button>
                </span>
                <button
                  className="sb-del"
                  title="Delete shot"
                  onClick={(e) => { stop(e); select({ kind: "clip", index: i }); removeSelected(); }}
                >
                  ×
                </button>
              </div>

              {/* drag the picture to reorder — keeps the text fields freely editable */}
              <div
                className="sb-grab"
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragEnd={() => setDragIndex(null)}
                title="Drag to reorder"
              >
                <Thumb clip={c} W={compW} H={compH} fps={fps} />
              </div>

              <div className="sb-dur">
                <input
                  type="number"
                  min={1}
                  value={c.durationInFrames}
                  onClick={stop}
                  onChange={(e) => patchClip(i, { durationInFrames: Math.max(1, +e.target.value) })}
                />
                <span className="muted">f · {fmtTime(c.durationInFrames, fps)}</span>
              </div>

              <input
                className="sb-label"
                placeholder="Shot label…"
                value={c.label ?? ""}
                onClick={stop}
                onChange={(e) => patchClip(i, { label: e.target.value })}
              />
              <textarea
                className="sb-note"
                placeholder="Notes for this frame…"
                value={c.note ?? ""}
                onClick={stop}
                onChange={(e) => patchClip(i, { note: e.target.value })}
              />
              {/* A wall clip has no `src` — an editable path field there would invite typing
                  something nothing reads. It gets a read-only summary and its two real actions. */}
              {wall && summary ? (
                <div className="sb-wall" onClick={stop}>
                  <span className="muted">{summary.text}</span>
                  {fit && <span className={"wall-fit " + fit.state}>{fit.label}</span>}
                  <span className="sb-wall-actions">
                    <button
                      title="Arrange the wall and set camera scenes"
                      onClick={() => {
                        select({ kind: "clip", index: i });
                        setWallClip(i);
                        setView("wall");
                      }}
                    >
                      Edit wall
                    </button>
                    <button
                      title="Set the clip length to exactly what the camera schedule needs"
                      disabled={!fit || fit.state === "fit"}
                      // Shared patch — it applies project.durationInFrames' cap, like every other
                      // retime path in the app.
                      onClick={() => {
                        const p = fitDurationPatch(useEditor.getState().project, i);
                        if (p) patchClip(i, p);
                      }}
                    >
                      ⟲ Fit
                    </button>
                  </span>
                </div>
              ) : (
                <input
                  className="sb-srcfield"
                  placeholder="src — clip-a.svg or media/photo.jpg"
                  value={c.src}
                  onClick={stop}
                  onChange={(e) => patchClip(i, { src: e.target.value })}
                />
              )}

              {i < clips.length - 1 && (
                <div className="sb-trans" onClick={stop}>
                  <span className="muted">→ next</span>
                  <select value={c.transitionToNext} onChange={(e) => patchClip(i, { transitionToNext: e.target.value })}>
                    <option value="none">cut</option>
                    {TRANSITIONS.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          );
        })}

        <button className="sb-add" onClick={() => addClip(newClip())}>+ Add shot</button>
      </div>
    </div>
  );
};
