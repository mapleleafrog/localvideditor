import React, { useEffect, useRef } from "react";
import type { PlayerRef } from "@remotion/player";
import { Preview } from "./components/Preview";
import { TimelinePanel } from "./components/TimelinePanel";
import { Library } from "./components/Library";
import { Inspector } from "./components/Inspector";
import { Topbar } from "./components/Topbar";
import { useEditor, useTemporal } from "./store";

export const App: React.FC = () => {
  const playerRef = useRef<PlayerRef>(null);

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

  return (
    <div className="app">
      <Topbar />

      <aside className="left panel left-rail">
        <Library />
      </aside>

      <main className="stage">
        <div className="player-wrap">
          <Preview playerRef={playerRef} />
        </div>
      </main>

      <aside className="right panel">
        <div className="panel-title">Inspector</div>
        <Inspector />
      </aside>

      <footer className="timeline">
        <TimelinePanel playerRef={playerRef} />
      </footer>
    </div>
  );
};
