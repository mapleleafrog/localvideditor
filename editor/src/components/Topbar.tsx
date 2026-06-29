import React, { useEffect, useRef, useState } from "react";
import { useEditor, useTemporal, SAMPLE_PROJECT, clearAutosave } from "../store";
import { renderVideo, saveProjectFile, deleteProject } from "../lib/api";
import { ensureProjectName, safeName } from "../lib/names";

type RenderState =
  | { phase: "idle" }
  | { phase: "running"; message: string; progress: number }
  | { phase: "done"; fileName: string }
  | { phase: "error"; message: string };

export const Topbar: React.FC = () => {
  const project = useEditor((s) => s.project);
  const setProject = useEditor((s) => s.setProject);
  const projectName = useEditor((s) => s.projectName);
  const setProjectName = useEditor((s) => s.setProjectName);
  const view = useEditor((s) => s.view);
  const setView = useEditor((s) => s.setView);
  const [render, setRender] = useState<RenderState>({ phase: "idle" });
  const [mode, setMode] = useState<"mp4" | "alpha" | "overlays">("mp4");
  const [note, setNote] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState(projectName);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setNameInput(projectName), [projectName]);
  const commitName = () => setProjectName(safeName(nameInput));

  const flash = (m: string) => {
    setNote(m);
    setTimeout(() => setNote((n) => (n === m ? null : n)), 3500);
  };

  const onRender = async () => {
    setRender({ phase: "running", message: "Starting…", progress: 0 });
    const options = { transparent: mode !== "mp4", overlaysOnly: mode === "overlays" };
    try {
      await renderVideo(project, options, (msg) => {
        if (msg.type === "status") setRender({ phase: "running", message: msg.message, progress: 0 });
        else if (msg.type === "progress")
          setRender({ phase: "running", message: "Rendering…", progress: msg.progress });
        else if (msg.type === "done") setRender({ phase: "done", fileName: msg.fileName });
        else if (msg.type === "error") setRender({ phase: "error", message: msg.message });
      });
    } catch (e) {
      setRender({ phase: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  const onSave = async () => {
    const name = ensureProjectName(); // uses the name field, or prompts if still unset
    if (!name) return;
    const r = await saveProjectFile(name, project);
    flash(r.ok ? `Saved → ${r.file}` : `Save failed: ${r.message}`);
  };

  const onDeleteProject = async () => {
    if (!projectName) return flash("No named project to delete yet.");
    if (!window.confirm(`Delete project "${projectName}" — its projects/${projectName}.json and public/media/${projectName}/ folder? This cannot be undone.`))
      return;
    const r = await deleteProject(projectName);
    if (!r.ok) return flash(`Delete failed: ${r.message}`);
    clearAutosave();
    setProject(structuredClone(SAMPLE_PROJECT));
    setProjectName("");
    flash(`Deleted project "${projectName}"`);
  };

  const onExport = () => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "soranji-project.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      setProject(JSON.parse(text));
      flash(`Imported ${file.name}`);
    } catch (err) {
      flash(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const onReset = () => {
    if (!window.confirm("Discard the current project and reload the sample?")) return;
    clearAutosave();
    setProject(structuredClone(SAMPLE_PROJECT));
    setProjectName("");
    flash("Reset to sample project");
  };

  return (
    <header className="topbar">
      <strong className="brand">Soranji&nbsp;Studio</strong>

      <span className="view-toggle">
        <button className={view === "edit" ? "on" : ""} onClick={() => setView("edit")}>Edit</button>
        <button className={view === "storyboard" ? "on" : ""} onClick={() => setView("storyboard")}>Storyboard</button>
      </span>

      <span className="sep" />
      <button onClick={() => useTemporal.getState().undo()} title="Undo (Ctrl+Z)">↶</button>
      <button onClick={() => useTemporal.getState().redo()} title="Redo (Ctrl+Shift+Z)">↷</button>

      <span className="sep" />
      <input
        className="proj-name"
        value={nameInput}
        placeholder="project name…"
        onChange={(e) => setNameInput(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => { if (e.key === "Enter") { commitName(); (e.target as HTMLInputElement).blur(); } }}
        title="Project name — sets projects/<name>.json and the public/media/<name>/ folder"
      />

      <span className="sep" />
      <button onClick={onSave} title="Save to projects/*.json">💾 Save</button>
      <button onClick={onExport} title="Download project JSON">⭳ Export</button>
      <button onClick={() => fileRef.current?.click()} title="Load project JSON">⭱ Import</button>
      <button onClick={onReset} title="Reset to sample">⟲ Reset</button>
      <button onClick={onDeleteProject} title="Delete this project's JSON + media folder">🗑 Delete</button>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onImportFile} />

      <div className="spacer" />

      {render.phase === "running" && (
        <span className="render-status">
          <span className="render-bar">
            <span className="render-fill" style={{ width: `${Math.round(render.progress * 100)}%` }} />
          </span>
          {render.message} {render.progress > 0 ? `${Math.round(render.progress * 100)}%` : ""}
        </span>
      )}
      {render.phase === "done" && <span className="render-ok">✓ out/{render.fileName}</span>}
      {render.phase === "error" && <span className="render-err" title={render.message}>✕ render failed</span>}
      {note && <span className="muted">{note}</span>}

      <select
        className="render-mode"
        value={mode}
        onChange={(e) => setMode(e.target.value as "mp4" | "alpha" | "overlays")}
        disabled={render.phase === "running"}
        title="Export format — ProRes carries an alpha channel for compositing in DaVinci"
      >
        <option value="mp4">Full video · MP4</option>
        <option value="alpha">Full video · ProRes (alpha)</option>
        <option value="overlays">Overlays only · ProRes (alpha)</option>
      </select>
      <button className="primary" onClick={onRender} disabled={render.phase === "running"}>
        {render.phase === "running" ? "Rendering…" : mode === "mp4" ? "⏺ Render MP4" : "⏺ Render .mov"}
      </button>
    </header>
  );
};
