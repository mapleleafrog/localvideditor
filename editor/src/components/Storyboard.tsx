import React, { useState } from "react";
import { useEditor } from "../store";
import type { Clip } from "../../../src/timeline/schema";
import { readyTransitions } from "../lib/effects-bridge";
import { fmtTime } from "../lib/timeline-utils";

const TRANSITIONS = readyTransitions().map((t) => ({ id: t.id, name: t.name }));

/** Vite serves the project's public/ at "/", so local clip srcs resolve there. */
const boardSrc = (src: string) => (/^https?:\/\//.test(src) ? src : "/" + src.replace(/^\/+/, ""));
const isVideo = (c: Clip) => c.type === "video" || /\.(mp4|webm|mov|m4v)$/i.test(c.src);

/** Same shape as TimelinePanel's newClip + the storyboard text fields. */
const newClip = (): Clip => ({
  type: "image", src: "clip-a.svg", durationInFrames: 60, motion: "none",
  transitionToNext: "none", transitionDurationInFrames: 20, trimBefore: 0, trimAfter: 0, volume: 1,
  label: "", note: "",
});

const Thumb: React.FC<{ clip: Clip }> = ({ clip }) => {
  const [err, setErr] = useState(false);
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
  const { project, selection, patchClip, addClip, reorderClip, select, removeSelected } = useEditor();
  const clips = project.clips;
  const fps = project.fps ?? 30;
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
                <Thumb clip={c} />
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
              <input
                className="sb-srcfield"
                placeholder="src — clip-a.svg or media/photo.jpg"
                value={c.src}
                onClick={stop}
                onChange={(e) => patchClip(i, { src: e.target.value })}
              />

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
