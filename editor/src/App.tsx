import React, { useEffect, useRef, useState } from "react";
import type { PlayerRef } from "@remotion/player";
import { Preview } from "./components/Preview";
import { TimelinePanel } from "./components/TimelinePanel";
import { Library } from "./components/Library";
import { Inspector } from "./components/Inspector";
import { Topbar } from "./components/Topbar";
import { Storyboard } from "./components/Storyboard";
import { ShortcutsModal, Toast } from "./components/ShortcutsModal";
import { ContextMenu } from "./components/ContextMenu";
import { EffectBrowser } from "./components/EffectBrowser";
import { useEditor, useTemporal } from "./store";
import { computeDuration } from "./lib/timeline-utils";
import { saveProjectFile } from "./lib/api";
import { ensureProjectName } from "./lib/names";

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

  // Global keyboard map — see ShortcutsModal for the full list. Mod = Ctrl/⌘.
  useEffect(() => {
    const saveProject = async () => {
      const name = ensureProjectName();
      if (!name) return;
      const r = await saveProjectFile(name, useEditor.getState().project);
      useEditor.getState().flash(r.ok ? `Saved → ${r.file}` : `Save failed: ${r.message}`);
    };

    const onKey = (e: KeyboardEvent) => {
      // The Effect Browser is a focused modal context: it owns Escape (closes itself) and
      // swallows every other key here (no Space-play, no Delete, no Ctrl+K/D/S/Z…) — typing in
      // its search field is naturally safe too since this guard returns before the rest fires.
      if (useEditor.getState().browser) {
        if (e.key === "Escape") {
          e.preventDefault();
          useEditor.getState().closeBrowser();
        }
        return;
      }

      const el = e.target as HTMLElement | null;
      const typing =
        !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      const mod = e.ctrlKey || e.metaKey;
      const st = useEditor.getState();
      const player = playerRef.current;
      const fps = st.project.fps ?? 30;
      const total = computeDuration(st.project);
      const cur = () => Math.round(player?.getCurrentFrame() ?? 0);
      const seek = (f: number) => player?.seekTo(Math.max(0, Math.min(total - 1, f)));

      // Esc closes the cheat sheet from anywhere.
      if (e.key === "Escape") {
        if (st.showShortcuts) {
          e.preventDefault();
          st.toggleShortcuts(false);
        }
        return;
      }

      // --- modifier combos (work even while a field is focused) ---
      if (mod && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) useTemporal.getState().redo();
        else useTemporal.getState().undo();
        return;
      }
      if (mod && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        useTemporal.getState().redo();
        return;
      }
      if (mod && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        void saveProject();
        return;
      }
      if (mod && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        st.duplicateSelected();
        return;
      }
      if (mod && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        st.splitSelected(cur());
        return;
      }
      // Copy/paste only when NOT typing (so text fields keep native copy/paste).
      if (mod && (e.key === "c" || e.key === "C") && !typing) {
        e.preventDefault();
        st.copySelected();
        return;
      }
      if (mod && (e.key === "v" || e.key === "V") && !typing) {
        e.preventDefault();
        st.pasteAt(cur());
        return;
      }

      if (typing || mod) return; // remaining shortcuts are single-key, no modifiers

      switch (e.key) {
        case " ":
          e.preventDefault();
          player?.toggle();
          break;
        case "Delete":
        case "Backspace":
          if (st.selection) {
            e.preventDefault();
            st.removeSelected();
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          seek(cur() - (e.shiftKey ? fps : 1));
          break;
        case "ArrowRight":
          e.preventDefault();
          seek(cur() + (e.shiftKey ? fps : 1));
          break;
        case "Home":
          e.preventDefault();
          seek(0);
          break;
        case "End":
          e.preventDefault();
          seek(total - 1);
          break;
        case "s":
        case "S":
          e.preventDefault();
          st.splitSelected(cur());
          break;
        case "+":
        case "=":
          e.preventDefault();
          st.setZoom(clamp(st.zoom + 1, 0.2, 40));
          break;
        case "-":
        case "_":
          e.preventDefault();
          st.setZoom(clamp(st.zoom - 1, 0.2, 40));
          break;
        case "?":
          e.preventDefault();
          st.toggleShortcuts();
          break;
        default:
          break;
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

      <ShortcutsModal />
      <Toast />
      <ContextMenu />
      <EffectBrowser />
    </div>
  );
};
