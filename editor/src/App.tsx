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
import { selectedSceneIds, useEditor, useTemporal } from "./store";
import { computeDuration } from "./lib/timeline-utils";
import { listMediaFull, saveProjectFile } from "./lib/api";
import { ensureProjectName } from "./lib/names";
import { appendedScene, fitAll, insertedScene, scheduleWall, wallOf } from "./lib/wall-edit";

const lsNum = (key: string, def: number) => {
  const v = Number(localStorage.getItem(key));
  return Number.isFinite(v) && v > 0 ? v : def;
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** <input type>s that take typed text; everything else (checkbox/radio/range/color/button/file) is a
 *  one-shot control that must not swallow the editor's shortcuts. */
const TEXT_INPUT_TYPES = /^(text|number|search|email|url|tel|password|date|time|datetime-local|month|week)$/i;
/** One-shot controls give focus back after a change, so the next keypress is a shortcut again
 *  instead of re-toggling / re-stepping that control (Space re-ticks a checkbox, arrows step a
 *  select or slider). Delegated from `document` once, so every current and future control gets it. */
const releasesFocusOnChange = (el: EventTarget | null) => {
  if (!(el instanceof HTMLElement)) return false;
  if (el.tagName === "SELECT") return true;
  if (el.tagName !== "INPUT") return false;
  return /^(checkbox|radio|range|color)$/i.test((el as HTMLInputElement).type);
};

export const App: React.FC = () => {
  const playerRef = useRef<PlayerRef>(null);
  const view = useEditor((s) => s.view);
  // Load the image-proxy map for this project up front, so the Players use the downscaled copies
  // even before the Assets tab has been opened (lib/proxies.ts).
  const projectName = useEditor((s) => s.projectName);
  useEffect(() => {
    void listMediaFull(projectName);
  }, [projectName]);

  // Hand focus back after a checkbox / select / slider / colour change (see releasesFocusOnChange).
  useEffect(() => {
    const onChange = (e: Event) => {
      if (releasesFocusOnChange(e.target)) (e.target as HTMLElement).blur();
    };
    document.addEventListener("change", onChange, true);
    return () => document.removeEventListener("change", onChange, true);
  }, []);

  // A file dropped anywhere that is NOT a drop target (the strip, the inspector, the toolbar) made
  // Chrome navigate the tab to the image — losing undo history, the camera and any upload in
  // flight. Real drop targets call preventDefault in their own React handlers first; this only
  // catches the misses, and says where to drop instead.
  useEffect(() => {
    const isFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files");
    const over = (e: DragEvent) => {
      if (isFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!isFiles(e) || e.defaultPrevented) return;
      e.preventDefault();
      const st = useEditor.getState();
      st.flash(st.view === "wall" ? "Drop photos on the wall viewport (or the Assets tab) to import them" : "Drop media on the preview, the timeline or the Assets tab to import it");
    };
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, []);

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
      // "Typing" = a field that consumes KEYSTROKES as text: text/number-like inputs, textareas,
      // contentEditable. NOT checkboxes, radios, sliders, colour pickers or selects — counting those
      // as typing left every shortcut dead after one click on a checkbox, while Space (armed by the
      // Wall view's own listener) still toggled that checkbox on release: ticking "intro" then
      // Space-panning silently shifted every scene by the intro length. See also the blur-on-change
      // listener below.
      const typing =
        !!el &&
        (el.tagName === "TEXTAREA" ||
          el.isContentEditable ||
          (el.tagName === "INPUT" && TEXT_INPUT_TYPES.test((el as HTMLInputElement).type || "text")));
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

      // --- modifier combos ---
      // Undo/redo defer to a focused text field: the wall's number boxes commit on blur/Enter, so a
      // project undo there reverted some unrelated edit while the half-typed value still committed
      // on blur afterwards. In a field, Ctrl+Z is the field's own undo.
      if (mod && (e.key === "z" || e.key === "Z") && !typing) {
        e.preventDefault();
        if (e.shiftKey) useTemporal.getState().redo();
        else useTemporal.getState().undo();
        return;
      }
      if (mod && (e.key === "y" || e.key === "Y") && !typing) {
        e.preventDefault();
        useTemporal.getState().redo();
        return;
      }
      if (mod && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        // Commit whatever is being typed FIRST (commit-on-blur fields write the store synchronously),
        // so the saved file contains the value on screen.
        if (typing) (el as HTMLElement).blur();
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

      // Ctrl/⌘+Enter in the Wall view: insert the current framing as a new scene right AFTER the
      // selected one (the strip's "⊕ Insert after N"). Not while typing — a focused hold/glide box
      // commits on Enter and must not also insert a scene.
      if (mod && e.key === "Enter" && !typing && st.view === "wall" && !st.wallLive) {
        e.preventDefault();
        const ci = st.wallClip;
        const clip = ci != null ? st.project.clips?.[ci] : undefined;
        if (ci == null || clip?.type !== "wall") return;
        const w = wallOf(clip);
        const scenes = w.scenes ?? [];
        const sel = scenes.findIndex((sc) => sc.id != null && sc.id === st.wallScene);
        if (sel < 0) {
          st.flash("Select a scene card first — Ctrl+Enter inserts after it");
          return;
        }
        const at = sel + 1;
        const { scene, midpoint } = insertedScene(w, st.wallCam, at);
        st.addWallScene(ci, scene, at);
        if (midpoint) st.setWallCam({ x: scene.x, y: scene.y, zoom: scene.zoom, rot: scene.rotation });
        const shift = (scene.holdSeconds ?? 0) + (scene.glideSeconds ?? 0);
        st.flash(
          `Scene ${at + 1} inserted${midpoint ? " halfway between its neighbours — frame it, then ⟳ Re-frame" : " from the viewport"}` +
            (at < scenes.length ? ` · scenes after it start ${shift.toFixed(1)}s later` : ""),
        );
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

        // --- LIVE: a transport, not an editor. The edit layer is hidden in Live but the selection
        // survives, so the arrange map below would nudge / delete / add scenes on a wall you cannot
        // see (→ moved a hidden photo; Enter appended a scene at the stale arrange camera and
        // auto-fit grew the clip). Here the keys drive the Player instead, in the LIVE take's own
        // frames (liveWallProject puts the wall at Player frame 0, so sceneFrames are seek targets).
        if (st.wallLive) {
          if (!player) return;
          const sched = scheduleWall(wall, fps, compW, compH);
          const last = Math.max(0, sched.total - 1);
          const now = player.getCurrentFrame();
          const seek = (f: number) => player.seekTo(Math.max(0, Math.min(last, Math.round(f))));
          const starts = sched.sceneFrames;
          switch (e.key) {
            case " ":
              e.preventDefault();
              player.toggle();
              break;
            case "ArrowLeft":
            case "ArrowRight":
              e.preventDefault();
              player.pause();
              seek(now + (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? fps : 1));
              break;
            case "Home":
              e.preventDefault();
              seek(0);
              break;
            case "End":
              e.preventDefault();
              seek(last);
              break;
            case "PageUp":
            case "PageDown": {
              // Jump to the previous / next scene's arrival (a small back-off so PgUp from just
              // after an arrival goes to the scene BEFORE it, like a DAW's previous-marker).
              e.preventDefault();
              let k: number;
              if (e.key === "PageDown") {
                k = starts.findIndex((f) => f > now);
                if (k < 0) break;
              } else {
                k = -1;
                for (let j = starts.length - 1; j >= 0; j--) if (starts[j] < now - Math.round(fps / 3)) { k = j; break; }
                if (k < 0) k = 0;
              }
              seek(starts[k]);
              const sc = (wall.scenes ?? [])[k];
              if (sc?.id) st.setWallScene(sc.id);
              break;
            }
            default:
              // Everything else (nudges, Delete, Enter, F, [ ], …) is an EDIT and edits are off in
              // Live. Esc (stop preview) is handled above; Ctrl combos never reach here.
              break;
          }
          return;
        }

        switch (e.key) {
          case " ":
            // While arranging Space is the pan modifier the gesture layer reads, so it is only
            // swallowed here (never scrolls the page). Live's play/pause is in the Live block above.
            e.preventDefault();
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
            } else if (ci != null && selectedSceneIds(st).length) {
              // No photo selected but scene card(s) are: delete THOSE (one undo step). Photos are
              // never touched by a scene delete.
              const ids = selectedSceneIds(st);
              st.removeWallScenes(ci, ids);
              st.flash(`${ids.length} scene${ids.length === 1 ? "" : "s"} deleted (Ctrl+Z to undo)`);
            } else {
              st.flash("Select a photo on the wall, or a scene card, to delete it");
            }
            break;
          case "PageUp":
          case "PageDown": {
            // Step the selected scene card (footer strip) and jump the camera to it — the same
            // action as the strip's ‹ › buttons (store.ts#stepWallScene).
            e.preventDefault();
            st.stepWallScene(e.key === "PageDown" ? 1 : -1);
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
