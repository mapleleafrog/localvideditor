import React, { useCallback, useEffect, useState } from "react";
import { getVideoMetadata } from "@remotion/media-utils";
import type { AudioTrack, Background, Clip, Overlay, Project } from "../src/timeline/schema";
import { SAMPLE_PROJECT } from "../src/timeline/schema";
import { downloadProject, parseProject, readFileText, serializeProject } from "../src/timeline/projectIO";
import { listProjects, loadProjectFromDisk, outputUrl, renderProject, saveProjectToDisk } from "./api";
import { BG_MOTION_OPTIONS } from "./options";
import {
  basename,
  emptyProject,
  isVideoSrc,
  move,
  newAudioTrack,
  newClip,
  newImageOverlay,
  newTextOverlay,
  resolveMediaUrl,
  type Selection,
} from "./model";
import { useHistory } from "./useHistory";
import { Preview } from "./Preview";
import { MediaLibrary } from "./MediaLibrary";
import { AudioPanel } from "./AudioPanel";
import { ClipTrack } from "./ClipTrack";
import { ClipInspector, OverlayInspector } from "./Inspector";
import { ColorField, SelectField, TextField } from "./ui";

type Toast = { kind: "ok" | "err"; msg: string } | null;

const BackgroundEditor: React.FC<{ value: Background; onChange: (b: Background) => void }> = ({ value, onChange }) => (
  <div className="section">
    <h3>Background</h3>
    <SelectField
      label="type"
      value={value.type}
      options={[
        { value: "none", label: "none" },
        { value: "color", label: "color" },
        { value: "gradient", label: "gradient" },
        { value: "motion", label: "motion" },
      ]}
      onChange={(t) => onChange({ ...value, type: t as Background["type"] })}
    />
    {value.type === "color" ? (
      <ColorField label="color" value={value.color ?? "#000000"} onChange={(color) => onChange({ ...value, color })} />
    ) : null}
    {value.type === "gradient" ? (
      <TextField label="gradient" value={value.gradient ?? ""} onChange={(gradient) => onChange({ ...value, gradient })} />
    ) : null}
    {value.type === "motion" ? (
      <SelectField label="motion" value={value.motion ?? ""} options={BG_MOTION_OPTIONS} noneLabel="— pick —" onChange={(motion) => onChange({ ...value, motion: motion || undefined })} />
    ) : null}
  </div>
);

export const Editor: React.FC = () => {
  const { state: project, set: setProject, reset: resetProject, undo, redo, canUndo, canRedo } = useHistory<Project>(SAMPLE_PROJECT);
  const [sel, setSel] = useState<Selection>(null);
  const [name, setName] = useState("my-video");
  const [toast, setToast] = useState<Toast>(null);
  const [diskProjects, setDiskProjects] = useState<string[]>([]);
  const [rendering, setRendering] = useState(false);
  const [renderLog, setRenderLog] = useState("");
  const [renderOut, setRenderOut] = useState<string | null>(null);

  const notify = useCallback((kind: "ok" | "err", msg: string) => setToast({ kind, msg }), []);
  const refreshProjects = useCallback(() => {
    listProjects().then(setDiskProjects).catch(() => undefined);
  }, []);
  useEffect(refreshProjects, [refreshProjects]);

  // Undo/redo keyboard shortcuts (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // --- mutations ---
  const addClip = useCallback(
    (src: string) => {
      let index = 0;
      setProject((p) => {
        index = p.clips.length;
        setSel({ kind: "clip", index });
        return { ...p, clips: [...p.clips, newClip(src)] };
      });
      // Auto-set duration from the actual video length (images keep the default).
      if (isVideoSrc(src)) {
        getVideoMetadata(resolveMediaUrl(src))
          .then((m) =>
            setProject((p) => ({
              ...p,
              clips: p.clips.map((c, i) =>
                i === index && c.src === src
                  ? { ...c, durationInFrames: Math.max(1, Math.round(m.durationInSeconds * p.fps)) }
                  : c,
              ),
            })),
          )
          .catch(() => undefined);
      }
    },
    [setProject],
  );
  const addImageOverlay = useCallback(
    (src: string) => {
      setProject((p) => {
        setSel({ kind: "overlay", index: p.overlays.length });
        return { ...p, overlays: [...p.overlays, newImageOverlay(src)] };
      });
    },
    [setProject],
  );
  const addTextOverlay = useCallback(() => {
    setProject((p) => {
      setSel({ kind: "overlay", index: p.overlays.length });
      return { ...p, overlays: [...p.overlays, newTextOverlay()] };
    });
  }, [setProject]);

  const updateClip = (i: number, c: Clip) =>
    setProject((p) => ({ ...p, clips: p.clips.map((x, idx) => (idx === i ? c : x)) }));
  const deleteClip = (i: number) => {
    setProject((p) => ({ ...p, clips: p.clips.filter((_, idx) => idx !== i) }));
    setSel(null);
  };
  const reorderClips = (from: number, to: number) => {
    setProject((p) => ({ ...p, clips: move(p.clips, from, to) }));
    setSel({ kind: "clip", index: to });
  };

  const updateOverlay = (i: number, o: Overlay) =>
    setProject((p) => ({ ...p, overlays: p.overlays.map((x, idx) => (idx === i ? o : x)) }));
  const moveOverlay = (i: number, x: number, y: number) =>
    setProject((p) => ({ ...p, overlays: p.overlays.map((o, idx) => (idx === i ? { ...o, x, y } : o)) }));
  const deleteOverlay = (i: number) => {
    setProject((p) => ({ ...p, overlays: p.overlays.filter((_, idx) => idx !== i) }));
    setSel(null);
  };

  const addAudio = useCallback((src: string) => setProject((p) => ({ ...p, audio: [...p.audio, newAudioTrack(src)] })), [setProject]);
  const updateAudio = (i: number, a: AudioTrack) =>
    setProject((p) => ({ ...p, audio: p.audio.map((x, idx) => (idx === i ? a : x)) }));
  const deleteAudio = (i: number) =>
    setProject((p) => ({ ...p, audio: p.audio.filter((_, idx) => idx !== i) }));

  // --- project io ---
  const onNew = () => {
    resetProject(emptyProject());
    setSel(null);
    notify("ok", "New empty project");
  };
  const onDownload = () => {
    try {
      downloadProject(project, `${name}.json`);
      notify("ok", `Downloaded ${name}.json`);
    } catch (e) {
      notify("err", (e as Error).message);
    }
  };
  const onSaveDisk = async () => {
    try {
      const path = await saveProjectToDisk(name, serializeProject(project));
      notify("ok", `Saved → ${path}`);
      refreshProjects();
    } catch (e) {
      notify("err", (e as Error).message);
    }
  };
  const applyJson = (text: string, label: string) => {
    const parsed = parseProject(text);
    if (!parsed.ok) return notify("err", parsed.error);
    resetProject(parsed.project);
    setSel(null);
    notify("ok", `Loaded ${label}`);
  };
  const onLoadDisk = async (file: string) => {
    if (!file) return;
    setName(file.replace(/\.json$/, ""));
    try {
      applyJson(await loadProjectFromDisk(file), file);
    } catch (e) {
      notify("err", (e as Error).message);
    }
  };
  const onLoadFile = async (f: File | undefined) => {
    if (!f) return;
    setName(f.name.replace(/\.json$/, ""));
    applyJson(await readFileText(f), f.name);
  };

  const onRender = async () => {
    setRendering(true);
    setRenderLog("");
    setRenderOut(null);
    try {
      const log = await renderProject(name, serializeProject(project), setRenderLog);
      const done = log.match(/__DONE__ (.+\.mp4)/);
      if (done) {
        setRenderOut(done[1].trim());
        notify("ok", "Render complete");
      } else {
        notify("err", "Render failed — see log");
      }
    } catch (e) {
      notify("err", (e as Error).message);
    } finally {
      setRendering(false);
    }
  };

  const selClip = sel?.kind === "clip" ? project.clips[sel.index] : undefined;
  const selOverlay = sel?.kind === "overlay" ? project.overlays[sel.index] : undefined;

  return (
    <div className="app">
      <div className="topbar">
        <span className="brand">SORANJI ◆ EDITOR</span>
        <input style={{ width: 150 }} value={name} onChange={(e) => setName(e.target.value)} title="Project name" />
        <button className="ghost" type="button" onClick={onNew}>
          New
        </button>
        <button className="ghost" type="button" onClick={undo} disabled={!canUndo} title="Undo (Ctrl/Cmd+Z)">
          ↶
        </button>
        <button className="ghost" type="button" onClick={redo} disabled={!canRedo} title="Redo (Ctrl/Cmd+Shift+Z)">
          ↷
        </button>
        <select value="" onChange={(e) => onLoadDisk(e.target.value)} style={{ width: "auto" }} title="Open from projects/">
          <option value="">Open…</option>
          {diskProjects.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <label className="chip" style={{ cursor: "pointer" }}>
          Import .json
          <input type="file" accept="application/json,.json" style={{ display: "none" }} onChange={(e) => onLoadFile(e.target.files?.[0])} />
        </label>
        <div className="grow" />
        <button className="ghost" type="button" onClick={onDownload}>
          ⬇ Download
        </button>
        <button className="ghost" type="button" onClick={onSaveDisk}>
          💾 Save
        </button>
        <button className="primary" type="button" onClick={onRender} disabled={rendering}>
          {rendering ? "⏳ Rendering…" : "🎬 Render MP4"}
        </button>
      </div>

      <div className="layout">
        <div className="col left">
          <MediaLibrary onAddClip={addClip} onAddImageOverlay={addImageOverlay} notify={notify} />
          <div className="section">
            <h3>Overlays</h3>
            <div className="btnrow" style={{ marginBottom: 8 }}>
              <button type="button" onClick={addTextOverlay}>
                + Text
              </button>
            </div>
            {project.overlays.map((o, i) => (
              <div
                key={i}
                className={`ov-item ${sel?.kind === "overlay" && sel.index === i ? "selected" : ""}`}
                onClick={() => setSel({ kind: "overlay", index: i })}
              >
                <span className="grow">{o.type === "text" ? `“${o.text}”` : basename(o.src)}</span>
                <button
                  className="ghost"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteOverlay(i);
                  }}
                >
                  ×
                </button>
              </div>
            ))}
            {!project.overlays.length ? <div className="hint">No overlays. Shift-click media to add an image overlay.</div> : null}
          </div>
          <AudioPanel tracks={project.audio} onAdd={addAudio} onUpdate={updateAudio} onDelete={deleteAudio} notify={notify} />
          {toast ? <div className={`toast ${toast.kind}`}>{toast.msg}</div> : null}
        </div>

        <div className="col center">
          <Preview
            project={project}
            selectedOverlay={sel?.kind === "overlay" ? sel.index : null}
            onSelectOverlay={(i) => setSel({ kind: "overlay", index: i })}
            onMoveOverlay={moveOverlay}
          />
          <ClipTrack
            clips={project.clips}
            selected={sel?.kind === "clip" ? sel.index : null}
            onSelect={(i) => setSel({ kind: "clip", index: i })}
            onDelete={deleteClip}
            onReorder={reorderClips}
          />
        </div>

        <div className="col right">
          {selClip && sel?.kind === "clip" ? (
            <ClipInspector clip={selClip} isLast={sel.index === project.clips.length - 1} onChange={(c) => updateClip(sel.index, c)} />
          ) : null}
          {selOverlay && sel?.kind === "overlay" ? (
            <OverlayInspector overlay={selOverlay} onChange={(o) => updateOverlay(sel.index, o)} />
          ) : null}
          {!sel ? <div className="hint">Select a clip or overlay to edit it. Drag overlay handles on the preview to reposition.</div> : null}
          <BackgroundEditor value={project.background} onChange={(background) => setProject((p) => ({ ...p, background }))} />
          <div className="section">
            <h3>Render</h3>
            {renderLog ? <pre className="renderlog">{renderLog.slice(-1600)}</pre> : null}
            {renderOut ? (
              <a className="chip" href={outputUrl(renderOut)} download>
                ⬇ Download {renderOut}
              </a>
            ) : (
              <div className="hint">
                “🎬 Render MP4” renders server-side to <code>out/{name}.mp4</code>. Or run:
                <br />
                <code>npx remotion render Timeline out/{name}.mp4 --props=./projects/{name}.json</code>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
