import { create } from "zustand";
import { temporal } from "zundo";
import type { Project, Clip, Overlay, AudioTrack, Wall, WallItem, WallScene } from "../../src/timeline/schema";
import type { Cam } from "../../src/timeline/wall";
import sampleProject from "../../projects/sample.json";
import { clipStarts } from "./lib/timeline-utils";
import {
  IDENTITY_CAM,
  clearSceneRefs,
  duplicatedItem,
  fitDurationPatch,
  insertAt,
  mapAt,
  moveAt,
  removeAt,
  uniqueSceneId,
  withSceneIds,
  withWall,
} from "./lib/wall-edit";

const AUTOFIT_KEY = "soranji.wall.autofit";
const readAutoFit = (): boolean => {
  try {
    return localStorage.getItem(AUTOFIT_KEY) !== "0";
  } catch {
    return true;
  }
};
/** Auto-fit: after a SCHEDULE edit (scene added/changed/removed, intro/outro toggled), size the wall
 *  clip to exactly what the camera needs — inside the SAME store update, so it lands in the same
 *  undo step as the edit that caused it and never fights the timeline's resize handle (which is a
 *  different action). Off = the manual "⟲ Fit clip duration" buttons only. */
const withFit = (project: Project, ci: number, auto: boolean): Project => {
  if (!auto) return project;
  const p = fitDurationPatch(project, ci);
  if (!p || project.clips[ci]?.durationInFrames === p.durationInFrames) return project;
  return { ...project, clips: project.clips.map((c, k) => (k === ci ? { ...c, ...p } : c)) };
};

/** A wall item is addressed by BOTH its clip and its index — the wall lives inside one clip, so a
 *  bare index would be ambiguous the moment a project has two wall clips. */
export type Selection =
  | { kind: "clip"; index: number }
  | { kind: "overlay"; index: number }
  | { kind: "wallItem"; clip: number; index: number }
  | null;
/** Cut/copied item, held in memory for paste (transient — not undone or persisted). */
export type Clipboard =
  | { kind: "clip"; item: Clip }
  | { kind: "overlay"; item: Overlay }
  | { kind: "wallItem"; item: WallItem }
  | null;

/** What a right-click context menu is anchored to. Assignable to Selection — `openCtxMenu` selects
 *  its target, so the two unions must stay in step. */
export type CtxTarget =
  | { kind: "clip"; index: number }
  | { kind: "overlay"; index: number }
  | { kind: "wallItem"; clip: number; index: number };
/** Transient right-click menu state. `frame` is captured by the caller BEFORE selecting (selecting
 *  an overlay can auto-seek the player — see CanvasOverlay — which would corrupt "split at playhead"). */
export type CtxMenuState = { x: number; y: number; frame: number; target: CtxTarget };

/** What the pop-up Effect Browser is picking for. */
export type BrowserTarget =
  | { mode: "overlay-add"; index: number }
  | { mode: "clip-motion"; index: number }
  | { mode: "clip-transition"; index: number }
  | { mode: "wall-item-add"; clip: number; index: number };

/** A one-shot seek/play request for the Player, consumed by Preview (`n` re-fires the same frame).
 *  TRANSIENT: it is a message, not state — never undone, never autosaved. */
export type SeekRequest = { frame: number; play: boolean; until?: number; n: number };

export type WallOverscan = 1 | 1.6 | 2.5;

export interface EditorState {
  project: Project;
  /** Current project name — used for projects/<name>.json AND its public/media/<name>/ folder. */
  projectName: string;
  selection: Selection;
  playhead: number; // frame
  zoom: number; // px per frame
  view: "edit" | "storyboard" | "wall";
  // mutations (project edits are tracked by zundo for undo/redo)
  setProject: (p: Project) => void;
  setProjectName: (name: string) => void;
  /** Merge top-level project fields (bpm, beatOffsetInFrames, background, …). */
  patchProject: (patch: Partial<Project>) => void;
  patchClip: (i: number, patch: Partial<Clip>) => void;
  patchOverlay: (i: number, patch: Partial<Overlay>) => void;
  addClip: (clip: Clip) => void;
  addOverlay: (o: Overlay) => void;
  /** Append several overlays in one undo step (batch photo-arrange helpers). */
  addOverlays: (list: Overlay[]) => void;
  // soundtrack tracks
  addAudio: (track: AudioTrack) => void;
  patchAudio: (i: number, patch: Partial<AudioTrack>) => void;
  removeAudio: (i: number) => void;
  removeSelected: () => void;
  reorderOverlay: (from: number, to: number) => void;
  reorderClip: (from: number, to: number) => void;
  /** Blade: split the selected item (or the clip under the playhead) at `frame`. */
  splitSelected: (frame: number) => void;
  /** Copy the selection right after itself (a new lane for overlays). */
  duplicateSelected: () => void;
  /** Stash the selection on the clipboard. */
  copySelected: () => void;
  /** Paste the clipboard — overlays land at `frame`, clips append to the track. */
  pasteAt: (frame: number) => void;

  // --- wall clips (undoable; every op is an immutable rebuild at EVERY level, because zundo's
  // handleSet AND the localStorage autosave both compare `project` by reference) ---
  /** Merge wall globals (paper, breathing, intro/outro, fitPadding, …). */
  patchWall: (ci: number, patch: Partial<Wall>) => void;
  addWallItem: (ci: number, item: WallItem) => void;
  /** Append several items in ONE undo step (a multi-file drop / batch arrange). */
  addWallItems: (ci: number, items: WallItem[]) => void;
  patchWallItem: (ci: number, i: number, patch: Partial<WallItem>) => void;
  removeWallItem: (ci: number, i: number) => void;
  /** Array order IS paint order — this is the z-order control. */
  reorderWallItem: (ci: number, from: number, to: number) => void;
  duplicateWallItem: (ci: number, i: number) => void;
  addWallScene: (ci: number, scene: WallScene, at?: number) => void;
  patchWallScene: (ci: number, i: number, patch: Partial<WallScene>) => void;
  removeWallScene: (ci: number, i: number) => void;
  reorderWallScene: (ci: number, from: number, to: number) => void;

  // transient UI state (not undone)
  clipboard: Clipboard;
  /** Transient status toast (keyboard ops, save). `n` forces a re-fire of the same message. */
  toast: { msg: string; n: number } | null;
  flash: (msg: string) => void;
  /** Keyboard cheat-sheet overlay. */
  showShortcuts: boolean;
  toggleShortcuts: (v?: boolean) => void;
  /** Generic right-click context menu (timeline blocks/lanes, canvas nodes). */
  ctxMenu: CtxMenuState | null;
  openCtxMenu: (x: number, y: number, frame: number, target: CtxTarget) => void;
  closeCtxMenu: () => void;
  /** Pop-up Effect Browser (search/filter/shelves grid with live previews). */
  browser: BrowserTarget | null;
  openBrowser: (t: BrowserTarget) => void;
  closeBrowser: () => void;

  // --- Wall view, ALL transient (outside zundo's partialize, never autosaved, never in the JSON).
  // Camera navigation therefore never enters undo history at all; item drags and scene keyframes do.
  /** Clip index the Wall view is authoring. Re-validated on every render by the view itself. */
  wallClip: number | null;
  /** The authoring camera. Always in SCENE SPACE, so "Set as scene" is a copy, not a conversion. */
  wallCam: Cam;
  /** Multi-selected wall item indices (marquee / shift-click). */
  wallSel: number[];
  /** The scene card the footer strip has selected (by STABLE id, so a reorder/undo never
   *  re-targets it). The inspector shows that scene's timing while no item is selected. */
  wallScene: string | null;
  /** Seeing wall outside the recorded frame — applied as a COMPOSITION-SIZE change, never a zoom
   *  divide, so every zoom-dependent look term stays bit-identical to the render (design §0.4). */
  wallOverscan: WallOverscan;
  /** Play the real schedule instead of the frozen authoring pose. */
  wallLive: boolean;
  /** Sticky hand (pan) tool — `H`. */
  wallHand: boolean;
  /** Keep the wall clip's duration equal to its camera schedule after every schedule edit
   *  (persisted preference, default on). */
  wallAutoFit: boolean;
  setWallAutoFit: (v: boolean) => void;
  /** Which wall clip the view has already framed. Lives HERE and not in a component ref because the
   *  Wall view unmounts on every trip to Edit/Storyboard: a per-mount ref would re-frame scene 1 and
   *  throw away the framing being composed, with no undo (camera nav is deliberately not undoable). */
  wallFramed: number | null;
  setWallClip: (ci: number | null) => void;
  setWallFramed: (ci: number | null) => void;
  setWallCam: (cam: Cam) => void;
  setWallSel: (sel: number[]) => void;
  setWallScene: (id: string | null) => void;
  setWallOverscan: (k: WallOverscan) => void;
  setWallLive: (v: boolean) => void;
  setWallHand: (v: boolean) => void;
  /** One-shot player seek (Scenes strip "Play from here"). Consumed by Preview. */
  seekRequest: SeekRequest | null;
  requestSeek: (frame: number, opts?: { play?: boolean; until?: number }) => void;

  setView: (v: EditorState["view"]) => void;
  select: (s: Selection) => void;
  setPlayhead: (f: number) => void;
  setZoom: (z: number) => void;
}

export const SAMPLE_PROJECT = sampleProject as unknown as Project;
const LS_KEY = "soranji.editor.project";
const LS_NAME = "soranji.editor.projectName";

/**
 * Sanitiser for every project that arrives without going through `projectSchema.parse`: the
 * localStorage autosave AND the Topbar's Import (a hand-edited or foreign JSON file is the one path
 * that can actually bring a stale `clip.type` in from outside). No file on disk carries the deleted
 * `type: "montage"`, but a clip whose `type` has no matching <option> renders a blank select whose
 * first touch silently rewrites it to `image`, destroying the payload. This is the ONLY place
 * montage is mentioned any more.
 */
export const migrate = (p: Project): Project => ({
  ...p,
  clips: (p.clips ?? []).map((c) => {
    const { montage: _dropped, ...rest } = c as Clip & { montage?: unknown };
    if (!(["image", "video", "wall"] as readonly string[]).includes(rest.type)) return { ...rest, type: "image" } as Clip;
    // Scene ids (item `appearIn` / `leaveAfter` refs) are backfilled here, at the ONE load boundary,
    // never in the memoised read path — an id must be persisted, not invented per render.
    if (rest.type === "wall" && rest.wall) {
      const wall = withSceneIds(rest.wall);
      return wall === rest.wall ? (rest as Clip) : ({ ...rest, wall } as Clip);
    }
    return rest as Clip;
  }),
});

/** Seed from the last autosaved project (localStorage), falling back to the sample. */
function loadSeed(): Project {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return migrate(JSON.parse(raw) as Project);
  } catch {
    /* ignore corrupt/absent */
  }
  return SAMPLE_PROJECT;
}

/** Multi-selection bookkeeping for `wallSel` (transient): drop `i` and close the gap. */
const dropIndex = (sel: number[], i: number) => sel.filter((k) => k !== i).map((k) => (k > i ? k - 1 : k));
/** Where index `k` lands after moving `from` -> `to` in the same array. */
const remapMove = (k: number, from: number, to: number) => {
  if (k === from) return to;
  if (from < to) return k > from && k <= to ? k - 1 : k;
  if (from > to) return k >= to && k < from ? k + 1 : k;
  return k;
};

/**
 * The selection/wallSel invariant, in ONE place because two primitives write `selection`
 * (`select` and `openCtxMenu`) and nothing was keeping the multi-selection in step with them.
 *
 * The rule:
 *   * selecting anything that is not a wall item clears `wallSel` (an overlay selection must never
 *     leave a wall group armed for the keyboard's Delete);
 *   * selecting a wall item that is ALREADY in the group (same clip) leaves the group intact — this
 *     is what makes clicking one member of a marquee selection keep the group;
 *   * selecting any other wall item resets the group to just that item, so the transform handles,
 *     the inspector and Delete always agree about what is selected.
 */
const reconcileWallSel = (
  s: { selection: Selection; wallSel: number[] },
  selection: Selection,
): { selection: Selection; wallSel: number[] } => {
  if (selection?.kind !== "wallItem") return { selection, wallSel: [] };
  const sameClip = s.selection?.kind === "wallItem" ? s.selection.clip === selection.clip : false;
  const keep = sameClip && s.wallSel.includes(selection.index);
  return { selection, wallSel: keep ? s.wallSel : [selection.index] };
};

/** Deep-copy the wall payload on every clip copy. A bare `{...c}` would leave two wall clips sharing
 *  ONE `items` array — editing one would change the other, and neither would be undoable. */
const cloneClip = (c: Clip): Clip => (c.wall ? { ...c, wall: structuredClone(c.wall) } : { ...c });

function loadName(): string {
  try {
    return localStorage.getItem(LS_NAME) || "";
  } catch {
    return "";
  }
}

const seed = loadSeed();

// Monotonic nonce so re-flashing the SAME toast message still re-triggers its auto-dismiss timer.
let toastN = 0;
// Same idea for seek requests: asking for the frame you are already on must still re-fire.
let seekN = 0;

// Leading-edge throttle for zundo's history recording: a continuous gesture (canvas/timeline drag,
// slider scrub, fast typing) records ONE history entry (the pre-gesture state) per window instead
// of one per pointer-move — so Ctrl+Z reverts the whole motion, not a few pixels.
const throttleHandleSet = <F extends (...args: never[]) => void>(fn: F, wait: number): F => {
  let last = 0;
  return ((...args: Parameters<F>) => {
    const now = Date.now();
    if (now - last >= wait) {
      last = now;
      fn(...args);
    }
  }) as F;
};

export const useEditor = create<EditorState>()(
  temporal(
    (set) => ({
      project: seed,
      projectName: loadName(),
      selection: null,
      playhead: 0,
      zoom: 4,
      view: "edit",
      clipboard: null,
      toast: null,
      showShortcuts: false,
      ctxMenu: null,
      browser: null,
      wallClip: null,
      wallCam: { ...IDENTITY_CAM },
      wallSel: [],
      wallScene: null,
      wallOverscan: 1.6,
      wallLive: false,
      wallHand: false,
      wallAutoFit: readAutoFit(),
      wallFramed: null,
      seekRequest: null,

      // Import / Reset / Delete replace the whole project, so every index-bearing transient goes
      // with it — a stale wallClip would otherwise point into a different clip list.
      setProject: (project) =>
        set({ project, selection: null, wallClip: null, wallSel: [], wallScene: null, wallFramed: null }),
      setProjectName: (projectName) => set({ projectName }),

      patchProject: (patch) => set((s) => ({ project: { ...s.project, ...patch } })),

      addAudio: (track) =>
        set((s) => ({ project: { ...s.project, audio: [...(s.project.audio ?? []), track] } })),

      patchAudio: (i, patch) =>
        set((s) => ({
          project: { ...s.project, audio: (s.project.audio ?? []).map((a, idx) => (idx === i ? { ...a, ...patch } : a)) },
        })),

      removeAudio: (i) =>
        set((s) => ({ project: { ...s.project, audio: (s.project.audio ?? []).filter((_, idx) => idx !== i) } })),

      patchClip: (i, patch) =>
        set((s) => ({
          project: { ...s.project, clips: s.project.clips.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) },
        })),

      patchOverlay: (i, patch) =>
        set((s) => ({
          project: { ...s.project, overlays: s.project.overlays.map((o, idx) => (idx === i ? { ...o, ...patch } : o)) },
        })),

      addClip: (clip) => set((s) => ({ project: { ...s.project, clips: [...s.project.clips, clip] } })),

      addOverlay: (o) =>
        set((s) => ({
          project: { ...s.project, overlays: [...s.project.overlays, o] },
          selection: { kind: "overlay", index: s.project.overlays.length },
        })),

      addOverlays: (list) =>
        set((s) => ({
          project: { ...s.project, overlays: [...s.project.overlays, ...list] },
          selection: list.length ? { kind: "overlay", index: s.project.overlays.length } : s.selection,
        })),

      // --- wall ops. Each one rebuilds project -> clips -> clip -> wall -> array -> element; a
      // single in-place mutation anywhere in that chain is invisible to undo AND never autosaves.
      // `withWall` returns null when clip `ci` is no longer a wall clip, and every op then no-ops
      // rather than writing onto an unrelated clip.
      patchWall: (ci, patch) =>
        set((s) => {
          const project = withWall(s.project, ci, (w) => ({ ...w, ...patch }));
          return project ? { project: withFit(project, ci, s.wallAutoFit) } : {};
        }),

      addWallItem: (ci, item) =>
        set((s) => {
          const base = (s.project.clips?.[ci]?.wall?.items ?? []).length;
          const project = withWall(s.project, ci, (w) => ({ ...w, items: [...(w.items ?? []), item] }));
          if (!project) return {};
          return { project, selection: { kind: "wallItem", clip: ci, index: base }, wallSel: [base] };
        }),

      addWallItems: (ci, list) =>
        set((s) => {
          if (!list.length) return {};
          const base = (s.project.clips?.[ci]?.wall?.items ?? []).length;
          const project = withWall(s.project, ci, (w) => ({ ...w, items: [...(w.items ?? []), ...list] }));
          if (!project) return {};
          const added = list.map((_, k) => base + k);
          return { project, selection: { kind: "wallItem", clip: ci, index: base + list.length - 1 }, wallSel: added };
        }),

      patchWallItem: (ci, i, patch) =>
        set((s) => {
          const project = withWall(s.project, ci, (w) =>
            i >= 0 && i < (w.items ?? []).length ? { ...w, items: mapAt(w.items ?? [], i, (it) => ({ ...it, ...patch })) } : w,
          );
          return project ? { project } : {};
        }),

      removeWallItem: (ci, i) =>
        set((s) => {
          const project = withWall(s.project, ci, (w) => ({ ...w, items: removeAt(w.items ?? [], i) }));
          if (!project) return {};
          const sel = s.selection;
          const selection: Selection =
            sel?.kind === "wallItem" && sel.clip === ci
              ? sel.index === i
                ? null
                : { kind: "wallItem", clip: ci, index: sel.index > i ? sel.index - 1 : sel.index }
              : sel;
          return { project, selection, wallSel: dropIndex(s.wallSel, i) };
        }),

      reorderWallItem: (ci, from, to) =>
        set((s) => {
          const project = withWall(s.project, ci, (w) => ({ ...w, items: moveAt(w.items ?? [], from, to) }));
          if (!project) return {};
          const sel = s.selection;
          const selection: Selection =
            sel?.kind === "wallItem" && sel.clip === ci
              ? { kind: "wallItem", clip: ci, index: remapMove(sel.index, from, to) }
              : sel;
          return { project, selection, wallSel: s.wallSel.map((k) => remapMove(k, from, to)) };
        }),

      duplicateWallItem: (ci, i) =>
        set((s) => {
          const src = s.project.clips?.[ci]?.wall?.items?.[i];
          if (!src) return {};
          const project = withWall(s.project, ci, (w) => ({ ...w, items: insertAt(w.items ?? [], i + 1, duplicatedItem(src)) }));
          if (!project) return {};
          return {
            project,
            selection: { kind: "wallItem", clip: ci, index: i + 1 },
            wallSel: [i + 1],
            toast: { msg: "Duplicated wall item", n: ++toastN },
          };
        }),

      addWallScene: (ci, scene, at) =>
        set((s) => {
          // A duplicated scene arrives with the ORIGINAL's id; it gets a fresh one so `appearIn`
          // refs stay unambiguous. The new scene becomes the strip's selection.
          let id = scene.id;
          const project = withWall(s.project, ci, (w) => {
            id = uniqueSceneId(w, scene.id);
            const sc = { ...scene, id };
            const scenes = w.scenes ?? [];
            return { ...w, scenes: at == null ? [...scenes, sc] : insertAt(scenes, at, sc) };
          });
          return project ? { project: withFit(project, ci, s.wallAutoFit), wallScene: id ?? null } : {};
        }),

      patchWallScene: (ci, i, patch) =>
        set((s) => {
          const project = withWall(s.project, ci, (w) =>
            i >= 0 && i < (w.scenes ?? []).length ? { ...w, scenes: mapAt(w.scenes ?? [], i, (sc) => ({ ...sc, ...patch })) } : w,
          );
          return project ? { project: withFit(project, ci, s.wallAutoFit) } : {};
        }),

      removeWallScene: (ci, i) =>
        set((s) => {
          // Items that appeared in / left after the deleted scene fall back to "always on the wall"
          // in the SAME rebuild, so one Ctrl+Z restores both the scene and the refs.
          const gone = s.project.clips?.[ci]?.wall?.scenes?.[i]?.id;
          const project = withWall(s.project, ci, (w) => ({
            ...w,
            scenes: removeAt(w.scenes ?? [], i),
            items: clearSceneRefs(w.items ?? [], gone),
          }));
          if (!project) return {};
          return { project: withFit(project, ci, s.wallAutoFit), wallScene: s.wallScene === gone ? null : s.wallScene };
        }),

      reorderWallScene: (ci, from, to) =>
        set((s) => {
          const project = withWall(s.project, ci, (w) => ({ ...w, scenes: moveAt(w.scenes ?? [], from, to) }));
          return project ? { project: withFit(project, ci, s.wallAutoFit) } : {};
        }),

      removeSelected: () =>
        set((s) => {
          const sel = s.selection;
          if (!sel) return {};
          if (sel.kind === "wallItem") {
            const project = withWall(s.project, sel.clip, (w) => ({ ...w, items: removeAt(w.items ?? [], sel.index) }));
            return project ? { project, selection: null, wallSel: dropIndex(s.wallSel, sel.index) } : {};
          }
          if (sel.kind === "clip") {
            return {
              project: { ...s.project, clips: s.project.clips.filter((_, i) => i !== sel.index) },
              selection: null,
            };
          }
          return {
            project: { ...s.project, overlays: s.project.overlays.filter((_, i) => i !== sel.index) },
            selection: null,
          };
        }),

      reorderOverlay: (from, to) =>
        set((s) => {
          const arr = [...s.project.overlays];
          const [moved] = arr.splice(from, 1);
          arr.splice(to, 0, moved);
          return { project: { ...s.project, overlays: arr } };
        }),

      reorderClip: (from, to) =>
        set((s) => {
          const arr = [...s.project.clips];
          const [moved] = arr.splice(from, 1);
          arr.splice(to, 0, moved);
          return { project: { ...s.project, clips: arr } };
        }),

      splitSelected: (frame) =>
        set((s) => {
          const sel = s.selection;
          // A wall item has no timeline of its own — it is always on the wall; time is the camera's
          // job. Nothing to split, and falling through would blade whatever sits under the playhead.
          if (sel?.kind === "wallItem") return {};
          // Overlay: split the timed lane at the absolute playhead frame.
          if (sel?.kind === "overlay") {
            const o = s.project.overlays[sel.index];
            if (!o) return {};
            const rel = frame - (o.from ?? 0);
            if (rel <= 0 || rel >= o.durationInFrames) return {};
            const first: Overlay = { ...o, durationInFrames: rel, exit: "none" };
            const second: Overlay = {
              ...o,
              from: (o.from ?? 0) + rel,
              durationInFrames: o.durationInFrames - rel,
              enter: "none",
              motions: [...(o.motions ?? [])],
              motionParams: o.motionParams ? o.motionParams.map((p) => ({ ...p })) : undefined,
            };
            const overlays = [...s.project.overlays];
            overlays.splice(sel.index, 1, first, second);
            return {
              project: { ...s.project, overlays },
              selection: { kind: "overlay", index: sel.index + 1 },
              toast: { msg: "Split layer", n: ++toastN },
            };
          }
          // Clip: split the selected clip, else whichever clip sits under the playhead.
          const starts = clipStarts(s.project);
          let ci = sel?.kind === "clip" ? sel.index : -1;
          if (ci < 0)
            ci = s.project.clips.findIndex((c, i) => frame > starts[i] && frame < starts[i] + c.durationInFrames);
          const c = s.project.clips[ci];
          if (!c) return {};
          if (c.type === "wall")
            return { toast: { msg: "Can't split a wall clip — both halves would restart the camera schedule.", n: ++toastN } };
          const rel = frame - starts[ci];
          if (rel <= 0 || rel >= c.durationInFrames) return {};
          // No transition between the two halves; the second half inherits the original outgoing one.
          const first: Clip = { ...c, durationInFrames: rel, transitionToNext: "none" };
          const second: Clip = {
            ...c,
            durationInFrames: c.durationInFrames - rel,
            // Video continues from where the first half left off; images ignore trim.
            trimBefore: c.type === "video" ? (c.trimBefore || 0) + rel : c.trimBefore,
          };
          const clips = [...s.project.clips];
          clips.splice(ci, 1, first, second);
          return {
            project: { ...s.project, clips },
            selection: { kind: "clip", index: ci + 1 },
            toast: { msg: "Split clip", n: ++toastN },
          };
        }),

      duplicateSelected: () =>
        set((s) => {
          const sel = s.selection;
          if (!sel) return {};
          if (sel.kind === "wallItem") {
            const src = s.project.clips?.[sel.clip]?.wall?.items?.[sel.index];
            if (!src) return {};
            const project = withWall(s.project, sel.clip, (w) => ({
              ...w,
              items: insertAt(w.items ?? [], sel.index + 1, duplicatedItem(src)),
            }));
            if (!project) return {};
            return {
              project,
              selection: { kind: "wallItem", clip: sel.clip, index: sel.index + 1 },
              wallSel: [sel.index + 1],
              toast: { msg: "Duplicated wall item", n: ++toastN },
            };
          }
          if (sel.kind === "clip") {
            const c = s.project.clips[sel.index];
            if (!c) return {};
            const clips = [...s.project.clips];
            clips.splice(sel.index + 1, 0, cloneClip(c));
            return {
              project: { ...s.project, clips },
              selection: { kind: "clip", index: sel.index + 1 },
              toast: { msg: "Duplicated clip", n: ++toastN },
            };
          }
          const o = s.project.overlays[sel.index];
          if (!o) return {};
          const copy: Overlay = {
            ...o,
            motions: [...(o.motions ?? [])],
            motionParams: o.motionParams ? o.motionParams.map((p) => ({ ...p })) : undefined,
          };
          const overlays = [...s.project.overlays];
          overlays.splice(sel.index + 1, 0, copy);
          return {
            project: { ...s.project, overlays },
            selection: { kind: "overlay", index: sel.index + 1 },
            toast: { msg: "Duplicated layer", n: ++toastN },
          };
        }),

      copySelected: () =>
        set((s) => {
          const sel = s.selection;
          if (!sel) return {};
          if (sel.kind === "wallItem") {
            const it = s.project.clips?.[sel.clip]?.wall?.items?.[sel.index];
            return it
              ? { clipboard: { kind: "wallItem", item: structuredClone(it) }, toast: { msg: "Copied wall item", n: ++toastN } }
              : {};
          }
          if (sel.kind === "clip") {
            const c = s.project.clips[sel.index];
            return c ? { clipboard: { kind: "clip", item: cloneClip(c) }, toast: { msg: "Copied clip", n: ++toastN } } : {};
          }
          const o = s.project.overlays[sel.index];
          return o
            ? {
                clipboard: {
                  kind: "overlay",
                  item: { ...o, motions: [...(o.motions ?? [])], motionParams: o.motionParams ? o.motionParams.map((p) => ({ ...p })) : undefined },
                },
                toast: { msg: "Copied layer", n: ++toastN },
              }
            : {};
        }),

      pasteAt: (frame) =>
        set((s) => {
          const cb = s.clipboard;
          if (!cb) return {};
          // Wall items paste into a wall the user can actually SEE, offset +24/+24 wall units so
          // the copy is visibly on top of its original. Resolution order, most explicit first:
          //   1. the selected wall item's own clip;
          //   2. a selected/right-clicked WALL clip (the timeline block's own Paste — it used to
          //      fall through to `wallClip` and drop the item into a different wall entirely);
          //   3. the wall the Wall view has open, but only while that view is showing.
          // Anything else says so instead of appending an item nothing on screen will draw.
          if (cb.kind === "wallItem") {
            const selClip =
              s.selection?.kind === "clip" && s.project.clips?.[s.selection.index]?.type === "wall"
                ? s.selection.index
                : null;
            const ci =
              s.selection?.kind === "wallItem"
                ? s.selection.clip
                : (selClip ?? (s.view === "wall" ? s.wallClip : null));
            if (ci == null)
              return { toast: { msg: "Select a wall clip (or open the Wall view) to paste a wall item", n: ++toastN } };
            const base = (s.project.clips?.[ci]?.wall?.items ?? []).length;
            const project = withWall(s.project, ci, (w) => ({ ...w, items: [...(w.items ?? []), duplicatedItem(cb.item)] }));
            if (!project) return {};
            // Selecting the pasted item only makes sense where it can be seen — outside the Wall
            // view a wallItem selection would arm Delete for an item nothing on screen draws.
            const inWall = s.view === "wall";
            return {
              project,
              ...(inWall ? { selection: { kind: "wallItem" as const, clip: ci, index: base }, wallSel: [base] } : {}),
              toast: { msg: inWall ? "Pasted wall item" : `Pasted wall item into clip ${ci + 1}`, n: ++toastN },
            };
          }
          // Clips are sequential — paste appends to the end of the track.
          if (cb.kind === "clip") {
            const clips = [...s.project.clips, cloneClip(cb.item)];
            return {
              project: { ...s.project, clips },
              selection: { kind: "clip", index: clips.length - 1 },
              toast: { msg: "Pasted clip", n: ++toastN },
            };
          }
          // Overlays are free-floating — paste at the playhead on a fresh lane.
          const copy: Overlay = {
            ...cb.item,
            from: Math.max(0, frame),
            motions: [...(cb.item.motions ?? [])],
            motionParams: cb.item.motionParams ? cb.item.motionParams.map((p) => ({ ...p })) : undefined,
          };
          const overlays = [...s.project.overlays, copy];
          return {
            project: { ...s.project, overlays },
            selection: { kind: "overlay", index: overlays.length - 1 },
            toast: { msg: "Pasted layer", n: ++toastN },
          };
        }),

      flash: (msg) => set({ toast: { msg, n: ++toastN } }),
      toggleShortcuts: (v) => set((s) => ({ showShortcuts: v ?? !s.showShortcuts })),

      // Opening a context menu also selects its target (so menu actions operate on it) — the
      // caller must capture `frame` from the live player BEFORE calling this, since selecting an
      // overlay can auto-seek the player (CanvasOverlay).
      // It also goes through the SAME selection reconciliation `select` does (it writes `selection`,
      // so it owns the same invariant): right-clicking item 5 while items 0-2 were marquee-selected
      // must not leave `wallSel = [0,1,2]` for the next Delete to act on while the inspector and the
      // transform handles are showing item 5.
      openCtxMenu: (x, y, frame, target) =>
        set((s) => ({ ctxMenu: { x, y, frame, target }, ...reconcileWallSel(s, target) })),
      closeCtxMenu: () => set({ ctxMenu: null }),

      openBrowser: (browser) => set({ browser }),
      closeBrowser: () => set({ browser: null }),

      // Wall view — transient only. Camera navigation is deliberately NOT undoable (the shortcuts
      // modal says so); scene keyframes and item drags are.
      //
      // Switching wall clips drops a selection that belonged to the OLD wall: `wallClip` is the
      // authority for every wall action, and a surviving `{kind:"wallItem", clip: <old>}` would
      // otherwise leave the inspector and the handles showing nothing while the keyboard still
      // nudged, reordered and deleted items on the wall the user just navigated away from.
      setWallClip: (wallClip) =>
        set((s) => ({
          wallClip,
          wallSel: [],
          wallScene: s.wallClip === wallClip ? s.wallScene : null,
          selection: s.selection?.kind === "wallItem" && s.selection.clip !== wallClip ? null : s.selection,
        })),
      setWallFramed: (wallFramed) => set({ wallFramed }),
      setWallCam: (wallCam) => set({ wallCam }),
      setWallSel: (wallSel) => set({ wallSel }),
      setWallScene: (wallScene) => set({ wallScene }),
      setWallOverscan: (wallOverscan) => set({ wallOverscan }),
      setWallLive: (wallLive) => set({ wallLive }),
      setWallHand: (wallHand) => set({ wallHand }),
      setWallAutoFit: (v) => {
        try {
          localStorage.setItem(AUTOFIT_KEY, v ? "1" : "0");
        } catch {
          /* private mode etc. — the in-memory flag still works for this session */
        }
        // Turning it ON fits the open wall clip right away, so the toggle has a visible effect.
        set((s) => ({ wallAutoFit: v, project: v && s.wallClip != null ? withFit(s.project, s.wallClip, true) : s.project }));
      },
      requestSeek: (frame, opts) =>
        set({ seekRequest: { frame: Math.max(0, Math.round(frame)), play: !!opts?.play, until: opts?.until, n: ++seekN } }),

      // Leaving the Wall view drops a wall-scoped selection. `removeSelected`/`duplicateSelected`/
      // `splitSelected` all have live wallItem branches, so a surviving one let Delete / ⎘ Duplicate
      // / ⌘D mutate a wall the Edit view does not draw — nothing on screen changed, and the edit was
      // still real. (`setProject` clears the same fields for the same reason.)
      setView: (view) =>
        set((s) =>
          view === "wall"
            ? { view }
            : { view, selection: s.selection?.kind === "wallItem" ? null : s.selection, wallSel: [], wallScene: null },
        ),
      // `select` OWNS the selection/wallSel invariant — see reconcileWallSel.
      select: (selection) => set((s) => reconcileWallSel(s, selection)),
      setPlayhead: (playhead) => set({ playhead }),
      setZoom: (zoom) => set({ zoom }),
    }),
    // Only project edits are undoable; selection/playhead/zoom AND all wall view state
    // (wallClip/wallCam/wallSel/wallOverscan/wallLive/wallHand/seekRequest) are transient.
    {
      partialize: (s) => ({ project: s.project }),
      limit: 100,
      // Coalesce rapid changes (drags/scrubs/typing) into one undo step.
      handleSet: (handleSet) => throttleHandleSet(handleSet, 600),
    },
  ),
);

/** zundo temporal store (undo/redo). */
export const useTemporal = useEditor.temporal;

/** Debounced autosave of the project to localStorage (transient UI state is not persisted). */
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let lastSaved: Project | null = null;
let lastName: string | null = null;
useEditor.subscribe((s) => {
  if (s.project === lastSaved && s.projectName === lastName) return;
  lastSaved = s.project;
  lastName = s.projectName;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const st = useEditor.getState();
      localStorage.setItem(LS_KEY, JSON.stringify(st.project));
      localStorage.setItem(LS_NAME, st.projectName);
    } catch {
      /* quota / unavailable */
    }
  }, 400);
});

export const clearAutosave = () => {
  try {
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem(LS_NAME);
  } catch {
    /* ignore */
  }
};
