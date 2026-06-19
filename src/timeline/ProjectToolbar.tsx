import React, { useCallback, useRef, useState } from "react";
import { getRemotionEnvironment } from "remotion";
import { downloadProject, parseProject, readFileText } from "./projectIO";
import type { Project } from "./schema";

// ---------------------------------------------------------------------------
// A floating Save / Load toolbar for the Timeline composition.
//
// STUDIO-ONLY: it returns null during render (and in the Player), so it never
// shows up in exported MP4s — it's purely an authoring aid.
//
//  • Download  → serialize the current props to a render-ready JSON you drop
//                into `projects/` (then `remotion render Timeline --props=...`).
//  • Load      → pick a JSON, validate it against `projectSchema`, and push it
//                into the live Studio editor via `@remotion/studio`
//                (dynamically imported so it never enters the render bundle).
// ---------------------------------------------------------------------------

const COMPOSITION_ID = "Timeline";

const bar: React.CSSProperties = {
  position: "absolute",
  top: 16,
  left: 16,
  zIndex: 9999,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: "12px 14px",
  borderRadius: 10,
  background: "rgba(10,12,20,0.82)",
  border: "1px solid rgba(255,46,136,0.5)",
  boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
  fontFamily: "monospace",
  color: "#fff",
  backdropFilter: "blur(4px)",
};

const row: React.CSSProperties = { display: "flex", gap: 8, alignItems: "center" };

const btn: React.CSSProperties = {
  cursor: "pointer",
  fontFamily: "monospace",
  fontSize: 16,
  fontWeight: 700,
  color: "#fff",
  background: "rgba(255,46,136,0.18)",
  border: "1px solid rgba(255,46,136,0.7)",
  borderRadius: 8,
  padding: "8px 12px",
};

export const ProjectToolbar: React.FC<{ project: Project }> = ({ project }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const onDownload = useCallback(() => {
    try {
      downloadProject(project, "project.json");
      setStatus({ kind: "ok", msg: "Downloaded → save it into projects/" });
    } catch (e) {
      setStatus({ kind: "err", msg: (e as Error).message });
    }
  }, [project]);

  const onPick = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    const parsed = parseProject(await readFileText(file));
    if (!parsed.ok) {
      setStatus({ kind: "err", msg: parsed.error });
      return;
    }
    try {
      const { saveDefaultProps } = await import("@remotion/studio");
      await saveDefaultProps({ compositionId: COMPOSITION_ID, defaultProps: () => parsed.project });
      setStatus({ kind: "ok", msg: `Loaded "${file.name}" into the editor` });
    } catch (err) {
      setStatus({ kind: "err", msg: `Load failed: ${(err as Error).message}` });
    }
  }, []);

  // Authoring aid only — never render this into the actual video output.
  if (!getRemotionEnvironment().isStudio) return null;

  return (
    <div style={bar} data-testid="project-toolbar">
      <div style={{ fontSize: 13, opacity: 0.7, letterSpacing: 1 }}>PROJECT</div>
      <div style={row}>
        <button type="button" style={btn} onClick={onDownload}>
          💾 Download
        </button>
        <button type="button" style={btn} onClick={() => fileRef.current?.click()}>
          📂 Load
        </button>
      </div>
      <input ref={fileRef} type="file" accept="application/json,.json" onChange={onPick} style={{ display: "none" }} />
      {status ? (
        <div style={{ fontSize: 12, maxWidth: 280, color: status.kind === "ok" ? "#7CFFB2" : "#FF8A8A" }}>
          {status.msg}
        </div>
      ) : null}
    </div>
  );
};
