import type React from "react";

export type Span = { from: number; durationInFrames: number };
export type DragMode = "move" | "left" | "right";

/** Frame-accurate pointer drag for a timeline block. Calls onChange with snapped frames. */
export function startBlockDrag(
  e: React.PointerEvent,
  mode: DragMode,
  zoom: number,
  init: Span,
  onChange: (s: Span) => void,
  minDur = 1,
) {
  e.preventDefault();
  e.stopPropagation();
  const startX = e.clientX;
  const move = (ev: PointerEvent) => {
    const df = Math.round((ev.clientX - startX) / zoom);
    if (mode === "move") {
      onChange({ from: Math.max(0, init.from + df), durationInFrames: init.durationInFrames });
    } else if (mode === "left") {
      const nf = Math.max(0, Math.min(init.from + init.durationInFrames - minDur, init.from + df));
      onChange({ from: nf, durationInFrames: init.durationInFrames - (nf - init.from) });
    } else {
      onChange({ from: init.from, durationInFrames: Math.max(minDur, init.durationInFrames + df) });
    }
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    document.body.style.userSelect = "";
  };
  document.body.style.userSelect = "none";
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

/** Drag/click on the ruler or playhead to scrub. Calls onSeek with the snapped frame. */
export function startScrub(
  e: React.PointerEvent,
  zoom: number,
  originLeft: number,
  scrollLeft: number,
  maxFrame: number,
  onSeek: (frame: number) => void,
) {
  e.preventDefault();
  const toFrame = (clientX: number) =>
    Math.max(0, Math.min(maxFrame, Math.round((clientX - originLeft + scrollLeft) / zoom)));
  onSeek(toFrame(e.clientX));
  const move = (ev: PointerEvent) => onSeek(toFrame(ev.clientX));
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}
