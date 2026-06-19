import React, { useEffect, useMemo, useRef, useState } from "react";
import { Player } from "@remotion/player";
import { getAudioDurationInSeconds } from "@remotion/media-utils";
import { Timeline, audioEndFrames, computeTimelineDuration } from "../src/timeline/Timeline";
import type { Project } from "../src/timeline/schema";
import { clampPct, resolveMediaUrl } from "./model";

/** Live preview via @remotion/player + draggable handles for positioning overlays. */
export const Preview: React.FC<{
  project: Project;
  selectedOverlay: number | null;
  onSelectOverlay: (i: number) => void;
  onMoveOverlay: (i: number, x: number, y: number) => void;
}> = ({ project, selectedOverlay, onSelectOverlay, onMoveOverlay }) => {
  // Audio file lengths aren't in the JSON — read them (in frames) so the song can drive duration.
  const [audioFrames, setAudioFrames] = useState<Record<string, number>>({});
  const stageRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const missing = project.audio.filter((a) => audioFrames[a.src] === undefined);
    if (!missing.length) return;
    Promise.all(
      missing.map(async (a) => {
        try {
          const secs = await getAudioDurationInSeconds(resolveMediaUrl(a.src));
          return [a.src, Math.round(secs * project.fps)] as const;
        } catch {
          return [a.src, 0] as const;
        }
      }),
    ).then((pairs) => {
      if (!cancelled) setAudioFrames((prev) => ({ ...prev, ...Object.fromEntries(pairs) }));
    });
    return () => {
      cancelled = true;
    };
  }, [project.audio, project.fps, audioFrames]);

  const durationInFrames = useMemo(() => {
    const audioEnd = audioEndFrames(project.audio, (src) => audioFrames[src]);
    return computeTimelineDuration(project, audioEnd);
  }, [project, audioFrames]);

  const moveFromEvent = (i: number, clientX: number, clientY: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const x = Math.round(clampPct(((clientX - rect.left) / rect.width) * 100) * 10) / 10;
    const y = Math.round(clampPct(((clientY - rect.top) / rect.height) * 100) * 10) / 10;
    onMoveOverlay(i, x, y);
  };

  return (
    <div className="preview-wrap">
      <div
        className="stage"
        ref={stageRef}
        style={{ width: "100%", aspectRatio: `${project.width} / ${project.height}`, position: "relative", maxHeight: "100%" }}
      >
        <Player
          component={Timeline}
          inputProps={project}
          durationInFrames={durationInFrames}
          compositionWidth={project.width}
          compositionHeight={project.height}
          fps={project.fps}
          controls
          loop
          acknowledgeRemotionLicense
          style={{ width: "100%", height: "100%" }}
        />
        <div className="stage-handles">
          {project.overlays.map((o, i) => (
            <button
              key={i}
              type="button"
              title={`Drag to move${o.type === "text" ? `: ${o.text}` : ""}`}
              className={`ov-handle ${selectedOverlay === i ? "sel" : ""}`}
              style={{ left: `${o.x}%`, top: `${o.y}%` }}
              onPointerDown={(e) => {
                e.stopPropagation();
                onSelectOverlay(i);
                e.currentTarget.setPointerCapture(e.pointerId);
                setDrag(i);
              }}
              onPointerMove={(e) => {
                if (drag === i) moveFromEvent(i, e.clientX, e.clientY);
              }}
              onPointerUp={(e) => {
                if (drag === i) {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                  setDrag(null);
                }
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
