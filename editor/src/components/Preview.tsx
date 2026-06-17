import React, { useLayoutEffect, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { Timeline } from "../../../src/timeline/Timeline";
import { useEditor } from "../store";
import { computeDuration } from "../lib/timeline-utils";
import { CanvasOverlay } from "./CanvasOverlay";

/** contain-fit: largest aw:ah box that fits the container -> exact composition aspect (no letterbox). */
function useContainFit(ref: React.RefObject<HTMLDivElement | null>, aw: number, ah: number) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      if (!width || !height) return;
      const s = Math.min(width / aw, height / ah);
      setBox({ w: Math.floor(aw * s), h: Math.floor(ah * s) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, aw, ah]);
  return box;
}

/** Pixel-exact live preview: the SAME Timeline composition that renders to MP4, driven by the
 *  editor's project state. The Player fills an exact composition-aspect box so the on-canvas
 *  transform tools (CanvasOverlay) can map screen px <-> composition coordinates 1:1. */
export const Preview: React.FC<{ playerRef: React.RefObject<PlayerRef | null> }> = ({ playerRef }) => {
  const project = useEditor((s) => s.project);
  const duration = computeDuration(project);
  const compW = project.width ?? 1920;
  const compH = project.height ?? 1080;
  const wrapRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const fit = useContainFit(wrapRef, compW, compH);

  return (
    <div className="preview-fit" ref={wrapRef}>
      <div className="comp-box" ref={boxRef} style={{ width: fit.w || undefined, height: fit.h || undefined }}>
        <Player
          ref={playerRef}
          component={Timeline as React.ComponentType<Record<string, unknown>>}
          inputProps={project as unknown as Record<string, unknown>}
          durationInFrames={duration}
          fps={project.fps ?? 30}
          compositionWidth={compW}
          compositionHeight={compH}
          style={{ width: "100%", height: "100%" }}
          clickToPlay={false}
        />
        {fit.w > 0 && <CanvasOverlay boxRef={boxRef} playerRef={playerRef} />}
      </div>
    </div>
  );
};
