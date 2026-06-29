import React, { useEffect, useRef, useState } from "react";
import type { PlayerRef } from "@remotion/player";
import { Preview } from "./components/Preview";
import { TimelinePanel } from "./components/TimelinePanel";
import { Library } from "./components/Library";
import { Inspector } from "./components/Inspector";
import { Topbar } from "./components/Topbar";
import { Storyboard } from "./components/Storyboard";
import { useEditor, useTemporal } from "./store";

const lsNum = (key: string, def: number) => {
  const v = Number(localStorage.getItem(key));
  return Number.isFinite(v) && v > 0 ? v : def;
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const App: React.FC = () => {
  const playerRef = useRef<PlayerRef>(null);
  const view = useEditor((s) => s.view);

  // Resizable panels — persisted so the layout sticks across reloads.
  const [railLeft, setRailLeft] = useState(() => lsNum("soranji.layout.left", 248));
  const [railRight, setRailRight] = useState(() => lsNum("soranji.layout.right", 320));
  const [timelineH, setTimelineH] = useState(() => lsNum("soranji.layout.timeline", 280));
  useEffect(() => localStorage.setItem("soranji.layout.left", String(railLeft)), [railLeft]);
  useEffect(() => localStorage.setItem("soranji.layout.right", String(railRight)), [railRight]);
  useEffect(() => localStorage.setItem("soranji.layout.timeline", String(timelineH)), [timelineH]);

  /** Generic edge-drag: tracks the pointer on window so it keeps working off the thin handle. */
  const onResize =
    (axis: "x" | "y", startVal: number, set: (n: number) => void, sign: 1 | -1, min: number, max: number) =>
    (e: React.PointerEvent) => {
      e.preventDefault();
      const origin = axis === "x" ? e.clientX : e.clientY;
      const el = e.currentTarget as HTMLElement;
      el.classList.add("active");
      const move = (ev: PointerEvent) => {
        const cur = axis === "x" ? ev.clientX : ev.clientY;
        set(clamp(startVal + sign * (cur - origin), min, max));
      };
      const up = () => {
        el.classList.remove("active");
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    };

  // Global shortcuts: undo/redo, delete selection, space = play/pause (suppressed while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) useTemporal.getState().redo();
        else useTemporal.getState().undo();
      } else if (mod && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        useTemporal.getState().redo();
      } else if (!typing && (e.key === "Delete" || e.key === "Backspace")) {
        if (useEditor.getState().selection) {
          e.preventDefault();
          useEditor.getState().removeSelected();
        }
      } else if (!typing && e.key === " ") {
        e.preventDefault();
        playerRef.current?.toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const appStyle = {
    "--rail-left": `${railLeft}px`,
    "--rail-right": `${railRight}px`,
    "--timeline-h": `${timelineH}px`,
  } as React.CSSProperties;

  return (
    <div className={"app" + (view === "storyboard" ? " app-board" : "")} style={appStyle}>
      <Topbar />

      {view === "storyboard" ? (
        <main className="board-main">
          <Storyboard />
        </main>
      ) : (
        <>
          <aside className="left panel left-rail">
            <Library />
            <div
              className="rail-resizer col on-right"
              title="Drag to resize"
              onPointerDown={onResize("x", railLeft, setRailLeft, 1, 200, 640)}
            />
          </aside>

          <main className="stage">
            <div className="player-wrap">
              <Preview playerRef={playerRef} />
            </div>
          </main>

          <aside className="right panel">
            <div className="panel-title">Inspector</div>
            <Inspector />
            <div
              className="rail-resizer col on-left"
              title="Drag to resize"
              onPointerDown={onResize("x", railRight, setRailRight, -1, 240, 680)}
            />
          </aside>

          <footer className="timeline">
            <div
              className="rail-resizer row"
              title="Drag to resize"
              onPointerDown={onResize("y", timelineH, setTimelineH, -1, 160, 620)}
            />
            <TimelinePanel playerRef={playerRef} />
          </footer>
        </>
      )}
    </div>
  );
};
