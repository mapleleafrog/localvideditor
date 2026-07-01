import { create } from "zustand";
import { temporal } from "zundo";
import type { Project, Clip, Overlay, AudioTrack } from "../../src/timeline/schema";
import sampleProject from "../../projects/sample.json";
import { clipStarts } from "./lib/timeline-utils";

export type Selection = { kind: "clip" | "overlay"; index: number } | null;
/** Cut/copied item, held in memory for paste (transient — not undone or persisted). */
export type Clipboard = { kind: "clip"; item: Clip } | { kind: "overlay"; item: Overlay } | null;

export interface EditorState {
  project: Project;
  /** Current project name — used for projects/<name>.json AND its public/media/<name>/ folder. */
  projectName: string;
  selection: Selection;
  playhead: number; // frame
  zoom: number; // px per frame
  view: "edit" | "storyboard";
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
  // transient UI state (not undone)
  clipboard: Clipboard;
  /** Transient status toast (keyboard ops, save). `n` forces a re-fire of the same message. */
  toast: { msg: string; n: number } | null;
  flash: (msg: string) => void;
  /** Keyboard cheat-sheet overlay. */
  showShortcuts: boolean;
  toggleShortcuts: (v?: boolean) => void;
  setView: (v: "edit" | "storyboard") => void;
  select: (s: Selection) => void;
  setPlayhead: (f: number) => void;
  setZoom: (z: number) => void;
}

export const SAMPLE_PROJECT = sampleProject as unknown as Project;
const LS_KEY = "soranji.editor.project";
const LS_NAME = "soranji.editor.projectName";

/** Seed from the last autosaved project (localStorage), falling back to the sample. */
function loadSeed(): Project {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as Project;
  } catch {
    /* ignore corrupt/absent */
  }
  return SAMPLE_PROJECT;
}

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

      setProject: (project) => set({ project, selection: null }),
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

      removeSelected: () =>
        set((s) => {
          if (!s.selection) return {};
          if (s.selection.kind === "clip") {
            return {
              project: { ...s.project, clips: s.project.clips.filter((_, i) => i !== s.selection!.index) },
              selection: null,
            };
          }
          return {
            project: { ...s.project, overlays: s.project.overlays.filter((_, i) => i !== s.selection!.index) },
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
          if (sel.kind === "clip") {
            const c = s.project.clips[sel.index];
            if (!c) return {};
            const clips = [...s.project.clips];
            clips.splice(sel.index + 1, 0, { ...c });
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
          if (sel.kind === "clip") {
            const c = s.project.clips[sel.index];
            return c ? { clipboard: { kind: "clip", item: { ...c } }, toast: { msg: "Copied clip", n: ++toastN } } : {};
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
          // Clips are sequential — paste appends to the end of the track.
          if (cb.kind === "clip") {
            const clips = [...s.project.clips, { ...cb.item }];
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

      setView: (view) => set({ view }),
      select: (selection) => set({ selection }),
      setPlayhead: (playhead) => set({ playhead }),
      setZoom: (zoom) => set({ zoom }),
    }),
    // Only project edits are undoable; selection/playhead/zoom are transient.
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
