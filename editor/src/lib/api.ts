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

export async function listMedia(): Promise<string[]> {
  try {
    const res = await fetch("/api/media");
    const data = await res.json();
    return Array.isArray(data.assets) ? data.assets : [];
  } catch {
    return [];
  }
}
