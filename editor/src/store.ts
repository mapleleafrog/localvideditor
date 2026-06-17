import { create } from "zustand";
import { temporal } from "zundo";
import type { Project, Clip, Overlay } from "../../src/timeline/schema";
import sampleProject from "../../projects/sample.json";

export type Selection = { kind: "clip" | "overlay"; index: number } | null;

export interface EditorState {
  project: Project;
  selection: Selection;
  playhead: number; // frame
  zoom: number; // px per frame
  view: "edit" | "storyboard";
  // mutations (project edits are tracked by zundo for undo/redo)
  setProject: (p: Project) => void;
  patchClip: (i: number, patch: Partial<Clip>) => void;
  patchOverlay: (i: number, patch: Partial<Overlay>) => void;
  addClip: (clip: Clip) => void;
  addOverlay: (o: Overlay) => void;
  removeSelected: () => void;
  reorderOverlay: (from: number, to: number) => void;
  reorderClip: (from: number, to: number) => void;
  // transient UI state (not undone)
  setView: (v: "edit" | "storyboard") => void;
  select: (s: Selection) => void;
  setPlayhead: (f: number) => void;
  setZoom: (z: number) => void;
}

export const SAMPLE_PROJECT = sampleProject as unknown as Project;
const LS_KEY = "soranji.editor.project";

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

const seed = loadSeed();

export const useEditor = create<EditorState>()(
  temporal(
    (set) => ({
      project: seed,
      selection: null,
      playhead: 0,
      zoom: 4,
      view: "edit",

      setProject: (project) => set({ project, selection: null }),

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

      setView: (view) => set({ view }),
      select: (selection) => set({ selection }),
      setPlayhead: (playhead) => set({ playhead }),
      setZoom: (zoom) => set({ zoom }),
    }),
    // Only project edits are undoable; selection/playhead/zoom are transient.
    { partialize: (s) => ({ project: s.project }), limit: 100 },
  ),
);

/** zundo temporal store (undo/redo). */
export const useTemporal = useEditor.temporal;

/** Debounced autosave of the project to localStorage (transient UI state is not persisted). */
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let lastSaved: Project | null = null;
useEditor.subscribe((s) => {
  if (s.project === lastSaved) return;
  lastSaved = s.project;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(useEditor.getState().project));
    } catch {
      /* quota / unavailable */
    }
  }, 400);
});

export const clearAutosave = () => {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
};
