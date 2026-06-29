import type { Project } from "../../../src/timeline/schema";

export type RenderMsg =
  | { type: "status"; message: string; durationInFrames?: number }
  | { type: "progress"; progress: number }
  | { type: "done"; file: string; fileName: string }
  | { type: "error"; message: string };

export interface RenderOptions {
  /** ProRes 4444 .mov with an alpha channel (background forced to none) — for DaVinci/Premiere. */
  transparent?: boolean;
  /** Drop the clip track and render only the overlays/VFX/titles (implies transparent). */
  overlaysOnly?: boolean;
  /** Parallel render tabs. 0/undefined = all CPU cores. */
  concurrency?: number;
  /** Chromium GL backend: "angle" (GPU) · "swiftshader" (CPU) · "default". */
  gl?: string;
  /** H.264 quality (1–51, lower = higher quality). Default 16. */
  crf?: number;
}

/** POST the project + render options to the dev-server endpoint and stream NDJSON progress. */
export async function renderVideo(
  project: Project,
  options: RenderOptions,
  onMsg: (m: RenderMsg) => void,
): Promise<void> {
  const res = await fetch("/api/render", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project, options }),
  });
  if (!res.body) {
    onMsg({ type: "error", message: "No response stream" });
    return;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      try {
        onMsg(JSON.parse(t) as RenderMsg);
      } catch {
        /* ignore partial */
      }
    }
  }
}

export async function saveProjectFile(name: string, project: Project): Promise<{ ok: boolean; file?: string; message?: string }> {
  const res = await fetch("/api/save-project", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, project }),
  });
  return res.json();
}

const mediaList = async (project: string, key: "assets" | "audio"): Promise<string[]> => {
  try {
    const res = await fetch(`/api/media${project ? `?project=${encodeURIComponent(project)}` : ""}`);
    const data = await res.json();
    return Array.isArray(data[key]) ? data[key] : [];
  } catch {
    return [];
  }
};

/** Visual assets: root public/ + flat public/media/ + this project's folder. */
export const listMedia = (project = ""): Promise<string[]> => mediaList(project, "assets");

/** Import a dropped/picked file into public/media/<project>/. Returns the ref (e.g.
 *  "media/my-wedding/photo.jpg"). With no project it lands in flat public/media/. */
export async function uploadMedia(file: File, project = ""): Promise<{ ok: boolean; ref?: string; message?: string }> {
  try {
    const q = `name=${encodeURIComponent(file.name)}${project ? `&project=${encodeURIComponent(project)}` : ""}`;
    const res = await fetch(`/api/upload?${q}`, { method: "POST", body: file });
    return await res.json();
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** Delete a project's JSON + its media folder. */
export async function deleteProject(name: string): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch("/api/delete-project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    return await res.json();
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** Audio files for the soundtrack picker (same scoping as listMedia). */
export const listAudio = (project = ""): Promise<string[]> => mediaList(project, "audio");
