import React, { useState } from "react";
import type { Clip } from "../src/timeline/schema";
import { basename, isVideoSrc, resolveMediaUrl } from "./model";

/** The horizontal clip track: drag to reorder, click to select, × to delete. */
export const ClipTrack: React.FC<{
  clips: Clip[];
  selected: number | null;
  onSelect: (i: number) => void;
  onDelete: (i: number) => void;
  onReorder: (from: number, to: number) => void;
}> = ({ clips, selected, onSelect, onDelete, onReorder }) => {
  const [drag, setDrag] = useState<number | null>(null);

  if (!clips.length) {
    return (
      <div className="track">
        <div className="hint">No clips yet — import footage on the left, then click it to add a clip.</div>
      </div>
    );
  }

  return (
    <div className="track">
      {clips.map((c, i) => (
        <React.Fragment key={i}>
          <div
            className={`clip ${selected === i ? "selected" : ""}`}
            draggable
            onDragStart={() => setDrag(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (drag !== null && drag !== i) onReorder(drag, i);
              setDrag(null);
            }}
            onClick={() => onSelect(i)}
            style={{ width: Math.max(96, Math.round(c.durationInFrames * 0.9)) }}
          >
            <button
              type="button"
              className="x"
              title="Delete clip"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(i);
              }}
            >
              ×
            </button>
            {isVideoSrc(c.src) ? (
              <video className="clip-thumb" src={resolveMediaUrl(c.src)} muted preload="metadata" />
            ) : (
              <img className="clip-thumb" src={resolveMediaUrl(c.src)} alt="" />
            )}
            <div className="title">
              {i + 1}. {basename(c.src)}
            </div>
            <div className="meta">{c.durationInFrames}f{c.motion ? ` · ${c.motion}` : ""}</div>
          </div>
          {c.transitionToNext && i < clips.length - 1 ? (
            <div className="trans" title="Transition to next clip">
              ⇆ {c.transitionToNext.id}
            </div>
          ) : null}
        </React.Fragment>
      ))}
    </div>
  );
};
