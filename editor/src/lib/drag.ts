import type React from "react";

export type Span = { from: number; durationInFrames: number };
export type DragMode = "move" | "left" | "right";
/** Frames to snap edges to (playhead, clip boundaries, 0, …) + the px pull radius. */
export type Snap = { targets: number[]; px: number };

/** Frame-accurate pointer drag for a timeline block. Calls onChange with snapped frames.
 *  When `snap` is given, the dragged edge(s) pull to the nearest target within `snap.px` pixels. */
export function startBlockDrag(
  e: React.PointerEvent,
  mode: DragMode,
  zoom: number,
  init: Span,
  onChange: (s: Span) => void,
  minDur = 1,
  snap?: Snap,
) {
  e.preventDefault();
  e.stopPropagation();
  const startX = e.clientX;
  // Nearest snap target to frame `f` (in px); `d` is the pixel distance (Infinity = no snap).
  const nearest = (f: number): { f: number; d: number } => {
    if (!snap) return { f, d: Infinity };
    let bf = f;
    let bd = snap.px + 1;
    for (const t of snap.targets) {
      const d = Math.abs((t - f) * zoom);
      if (d <= snap.px && d < bd) {
        bd = d;
        bf = t;
      }
    }
    return { f: bf, d: bf === f ? Infinity : bd };
  };
  const move = (ev: PointerEvent) => {
    const df = Math.round((ev.clientX - startX) / zoom);
    if (mode === "move") {
      const rawFrom = Math.max(0, init.from + df);
      // Snap whichever edge (left/right) pulls closer.
      const a = nearest(rawFrom);
      const b = nearest(rawFrom + init.durationInFrames);
      let from = rawFrom;
      if (a.d <= b.d) from = a.f;
      else from = b.f - init.durationInFrames;
      onChange({ from: Math.max(0, from), durationInFrames: init.durationInFrames });
    } else if (mode === "left") {
      const raw = Math.max(0, Math.min(init.from + init.durationInFrames - minDur, init.from + df));
      const nf = Math.max(0, Math.min(init.from + init.durationInFrames - minDur, nearest(raw).f));
      onChange({ from: nf, durationInFrames: init.durationInFrames - (nf - init.from) });
    } else {
      const rawEnd = init.from + Math.max(minDur, init.durationInFrames + df);
      const end = Math.max(init.from + minDur, nearest(rawEnd).f);
      onChange({ from: init.from, durationInFrames: end - init.from });
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

/** Drag/click on the ruler or playhead to scrub. Calls onSeek with the snapped frame.
 *  Left button only — right/middle-click must not teleport the playhead or attach listeners. */
export function startScrub(
  e: React.PointerEvent,
  zoom: number,
  originLeft: number,
  scrollLeft: number,
  maxFrame: number,
  onSeek: (frame: number) => void,
) {
  if (e.button !== 0) return;
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
