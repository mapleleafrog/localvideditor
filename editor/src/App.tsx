import React, { useEffect, useRef, useState } from "react";
import type { PlayerRef } from "@remotion/player";
import { Preview } from "./components/Preview";
import { TimelinePanel } from "./components/TimelinePanel";
import { Library } from "./components/Library";
import { Inspector } from "./components/Inspector";
import { Topbar } from "./components/Topbar";
import { Storyboard } from "./components/Storyboard";
import { WallView } from "./components/WallView";
import { WallInspector } from "./components/WallInspector";
import { WallScenes } from "./components/WallScenes";
import { ShortcutsModal, Toast } from "./components/ShortcutsModal";
import { ContextMenu } from "./components/ContextMenu";
import { EffectBrowser } from "./components/EffectBrowser";
import { useEditor, useTemporal } from "./store";
import { computeDuration } from "./lib/timeline-utils";
import { saveProjectFile } from "./lib/api";
import { ensureProjectName } from "./lib/names";
import { appendedScene, fitAll, wallOf } from "./lib/wall-edit";

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
      if (e.button !== 0) return;
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
      // Ctrl/⌘ combos the app normally suppresses must ALSO be preventDefault'd here, or the
      // browser's native actions fire while the modal is open (Ctrl+S save-page, Ctrl+D bookmark).
      // Plain keys are deliberately NOT prevented — typing in the search input must keep working.
      if (useEditor.getState().browser) {
        if (e.key === "Escape") {
          e.preventDefault();
          useEditor.getState().closeBrowser();
        } else if ((e.ctrlKey || e.metaKey) && ["s", "d", "k"].includes(e.key.toLowerCase())) {
          e.preventDefault();
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

      // Esc closes the cheat sheet from anywhere, and stops a Wall Live preview (back to Arrange).
      if (e.key === "Escape") {
        if (st.showShortcuts) {
          e.preventDefault();
          st.toggleShortcuts(false);
        } else if (st.view === "wall" && st.wallLive) {
          e.preventDefault();
          st.setWallLive(false);
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
      // In the Wall view the ONLY thing these may act on is a wall item. Every entry point into the
      // view leaves a `{kind:"clip"}` selection behind (the Topbar button, the timeline's + Wall and
      // double-click, the Storyboard and Inspector "Edit wall" buttons, the context menu), and both
      // ops have live clip branches — so an unguarded ⌘D there duplicated the whole wall clip and
      // ⌘C copied it, while the cheat sheet promises "Duplicate item" / "Copy item".
      const wallItemOnly = st.view === "wall" && st.selection?.kind !== "wallItem";
      if (mod && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        if (wallItemOnly) st.flash("Select an item on the wall to duplicate it");
        else st.duplicateSelected();
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
        if (wallItemOnly) st.flash("Select an item on the wall to copy it");
        else st.copySelected();
        return;
      }
      if (mod && (e.key === "v" || e.key === "V") && !typing) {
        e.preventDefault();
        st.pasteAt(cur());
        return;
      }

      if (typing || mod) return; // remaining shortcuts are single-key, no modifiers

      // --- Wall view map. Placed AFTER the Effect Browser guard and the Ctrl/⌘ combos (so
      // Ctrl+Z/⇧Z/Y/S/D/K/C/V fall through unchanged and act on the wall selection via the store's
      // wallItem branches) and BEFORE the Edit map, which it fully replaces: `s` must NOT reach
      // splitSelected here, since with nothing selected that would blade the clip under the
      // playhead while the user is arranging photos.
      //
      // Camera navigation (F / ⇧F / 1 / 0 / pan / zoom) writes only to the transient `wallCam`, so
      // it never enters undo history; item nudges and scene keyframes do.
      if (st.view === "wall") {
        // `wallClip` is the AUTHORITY, not the selection: the nav bar's wall-clip picker changes
        // the open wall without touching `selection`, so resolving the clip from a surviving
        // `selection.clip` silently pointed every keyboard op — nudge, [ / ], Delete, Enter's
        // "Set as scene" — at the wall the user just navigated away from. Both WallView and
        // WallOverlay already gate on `selection.clip === wallClip`; this now matches them.
        const ci = st.wallClip;
        const clip = ci != null ? st.project.clips?.[ci] : undefined;
        const wall = wallOf(clip);
        const sel = st.wallSel.length
          ? st.wallSel
          : st.selection?.kind === "wallItem" && st.selection.clip === ci
            ? [st.selection.index]
            : [];
        const items = wall.items ?? [];
        const compW = st.project.width ?? 1920;
        const compH = st.project.height ?? 1080;
        const nudge = (dx: number, dy: number) => {
          if (ci == null || !sel.length) return;
          sel.forEach((k) => {
            const it = items[k];
            if (it) st.patchWallItem(ci, k, { x: it.x + dx, y: it.y + dy });
          });
        };

        switch (e.key) {
          case " ":
            // In Live mode Space plays; while arranging it is the pan modifier the gesture layer
            // reads, so it is only swallowed here (never scrolls the page).
            e.preventDefault();
            if (st.wallLive) player?.toggle();
            break;
          case "f":
          case "F":
            e.preventDefault();
            st.setWallCam(
              fitAll(
                e.shiftKey && sel.length ? sel.map((k) => items[k]).filter(Boolean) : items,
                compW,
                compH,
                wall.fitPadding ?? 0.06,
              ),
            );
            break;
          case "1":
            e.preventDefault();
            st.setWallCam({ ...st.wallCam, zoom: 1 });
            break;
          case "0":
            e.preventDefault();
            st.setWallCam({ ...st.wallCam, rot: 0 });
            break;
          case "h":
          case "H":
            e.preventDefault();
            st.setWallHand(!st.wallHand);
            break;
          case "[":
            // Array order IS paint order — send backward / bring forward.
            e.preventDefault();
            if (ci != null && sel.length === 1 && sel[0] > 0) st.reorderWallItem(ci, sel[0], sel[0] - 1);
            break;
          case "]":
            e.preventDefault();
            if (ci != null && sel.length === 1 && sel[0] < items.length - 1) st.reorderWallItem(ci, sel[0], sel[0] + 1);
            break;
          case "ArrowLeft":
            e.preventDefault();
            nudge(-(e.shiftKey ? 10 : 1), 0);
            break;
          case "ArrowRight":
            e.preventDefault();
            nudge(e.shiftKey ? 10 : 1, 0);
            break;
          case "ArrowUp":
            e.preventDefault();
            nudge(0, -(e.shiftKey ? 10 : 1));
            break;
          case "ArrowDown":
            e.preventDefault();
            nudge(0, e.shiftKey ? 10 : 1);
            break;
          case "Enter":
            e.preventDefault();
            if (ci != null && clip?.type === "wall") {
              // Shift+Enter re-frames the SELECTED scene from the viewport (timing kept); Enter
              // appends a new one.
              const sel = (wall.scenes ?? []).findIndex((sc) => sc.id != null && sc.id === st.wallScene);
              if (e.shiftKey && sel >= 0) {
                st.patchWallScene(ci, sel, { x: st.wallCam.x, y: st.wallCam.y, zoom: st.wallCam.zoom, rotation: st.wallCam.rot });
                st.flash(`Scene ${sel + 1} re-framed from the viewport`);
              } else {
                st.addWallScene(ci, appendedScene(wall, st.wallCam));
                st.flash(`Scene ${(wall.scenes ?? []).length + 1} set`);
              }
            }
            break;
          case "Delete":
          case "Backspace":
            // WALL ITEMS ONLY — never a fall-through to removeSelected(). Every route into this
            // view leaves a `{kind:"clip"}` selection behind, and removeSelected's clip branch
            // deletes the entire wall clip: one Delete on the state the view opens in destroyed the
            // whole wall, with the cheat sheet promising "Delete selected item(s)".
            e.preventDefault();
            if (ci != null && sel.length) {
              // Descending, so each removal cannot shift the indices still to be removed.
              [...sel].sort((a, b) => b - a).forEach((k) => st.removeWallItem(ci, k));
            } else {
              st.flash("Select an item on the wall to delete it");
            }
            break;
          case "PageUp":
          case "PageDown": {
            // Step the selected scene card (footer strip) and jump the camera to it.
            e.preventDefault();
            const scenes = wall.scenes ?? [];
            if (!scenes.length) break;
            const cur = scenes.findIndex((sc) => sc.id != null && sc.id === st.wallScene);
            const next = e.key === "PageDown" ? Math.min(scenes.length - 1, cur + 1) : Math.max(0, cur < 0 ? 0 : cur - 1);
            const sc = scenes[next];
            st.setWallScene(sc.id ?? null);
            if (ci != null) st.select({ kind: "clip", index: ci });
            st.setWallCam({ x: sc.x, y: sc.y, zoom: sc.zoom, rot: sc.rotation });
            break;
          }
          case "?":
            e.preventDefault();
            st.toggleShortcuts();
            break;
          default:
            break;
        }
        return;
      }

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
        // Wall reuses the Edit shell exactly — same grid areas, same rail resizers, same persisted
        // widths — so muscle memory transfers: footer = time, right rail = properties.
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
              {view === "wall" ? <WallView playerRef={playerRef} /> : <Preview playerRef={playerRef} />}
            </div>
          </main>

          <aside className="right panel">
            <div className="panel-title">{view === "wall" ? "Wall" : "Inspector"}</div>
            {view === "wall" ? <WallInspector /> : <Inspector />}
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
            {view === "wall" ? <WallScenes /> : <TimelinePanel playerRef={playerRef} />}
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
