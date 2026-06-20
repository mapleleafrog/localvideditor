import React, { useEffect, useMemo, useRef, useState } from "react";
import { Player } from "@remotion/player";
import { getAudioDurationInSeconds } from "@remotion/media-utils";
import { Timeline, audioEndFrames, computeTimelineDuration } from "../src/timeline/Timeline";
import type { Overlay, Project } from "../src/timeline/schema";
import { clampPct, resolveMediaUrl } from "./model";

export type OverlayGeom = Partial<Pick<Overlay, "x" | "y" | "scale" | "rotation">>;
type Drag = { kind: "move" | "scale" | "rotate"; i: number; startScale?: number; startDist?: number } | null;

/** Live preview via @remotion/player + draggable move / scale / rotate handles for overlays. */
export const Preview: React.FC<{
  project: Project;
  selectedOverlay: number | null;
  onSelectOverlay: (i: number) => void;
  onOverlayGeom: (i: number, patch: OverlayGeom) => void;
}> = ({ project, selectedOverlay, onSelectOverlay, onOverlayGeom }) => {
  const [audioFrames, setAudioFrames] = useState<Record<string, number>>({});
  const stageRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag>(null);

  // Audio file lengths aren't in the JSON — read them (in frames) so the song can drive duration.
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

  const centerOf = (o: Overlay) => {
    const r = stageRef.current!.getBoundingClientRect();
    return { r, cx: r.left + (r.width * o.x) / 100, cy: r.top + (r.height * o.y) / 100 };
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag || !stageRef.current) return;
    const o = project.overlays[drag.i];
    if (!o) return;
    if (drag.kind === "move") {
      const r = stageRef.current.getBoundingClientRect();
      const x = Math.round(clampPct(((e.clientX - r.left) / r.width) * 100) * 10) / 10;
      const y = Math.round(clampPct(((e.clientY - r.top) / r.height) * 100) * 10) / 10;
      onOverlayGeom(drag.i, { x, y });
    } else if (drag.kind === "scale") {
      const { cx, cy } = centerOf(o);
      const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
      const scale = Math.max(0.05, (drag.startScale ?? 1) * (dist / (drag.startDist || 1)));
      onOverlayGeom(drag.i, { scale: Math.round(scale * 100) / 100 });
    } else {
      const { cx, cy } = centerOf(o);
      const ang = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI + 90;
      onOverlayGeom(drag.i, { rotation: Math.round(ang) });
    }
  };

  const startDrag = (kind: "move" | "scale" | "rotate", i: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    onSelectOverlay(i);
    e.currentTarget.setPointerCapture(e.pointerId);
    const o = project.overlays[i];
    if (kind === "scale" && o && stageRef.current) {
      const { cx, cy } = centerOf(o);
      setDrag({ kind, i, startScale: o.scale, startDist: Math.hypot(e.clientX - cx, e.clientY - cy) || 1 });
    } else {
      setDrag({ kind, i });
    }
  };
  const endDrag = (e: React.PointerEvent) => {
    if (drag) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      setDrag(null);
    }
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
        <div className="stage-handles" onPointerMove={onMove} onPointerUp={endDrag}>
          {project.overlays.map((o, i) => (
            <button
              key={i}
              type="button"
              title={`Drag to move${o.type === "text" ? `: ${o.text}` : ""}`}
              className={`ov-handle ${selectedOverlay === i ? "sel" : ""}`}
              style={{ left: `${o.x}%`, top: `${o.y}%` }}
              onPointerDown={startDrag("move", i)}
            />
          ))}
          {selectedOverlay !== null && project.overlays[selectedOverlay] ? (
            <div
              className="ov-gizmo"
              style={{ left: `${project.overlays[selectedOverlay].x}%`, top: `${project.overlays[selectedOverlay].y}%` }}
            >
              <button type="button" className="giz rotate" title="Drag to rotate" onPointerDown={startDrag("rotate", selectedOverlay)} />
              <button type="button" className="giz scale" title="Drag to resize" onPointerDown={startDrag("scale", selectedOverlay)} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
