import type { Project } from "../../../src/timeline/schema";
import { addProxy, makeProxy, proxyEligible, proxyName, removeProxy, setProxies } from "./proxies";

export type RenderMsg =
  | { type: "status"; message: string; durationInFrames?: number }
  | { type: "progress"; progress: number; rendered?: number; encoded?: number; total?: number; stage?: string }
  | { type: "done"; file: string; fileName: string }
  /** A browser console error forwarded from a render tab (also written to out/<render>.log). */
  | { type: "log"; message: string }
  | { type: "error"; message: string };

export interface RenderOptions {
  /** ProRes 4444 .mov with an alpha channel (background forced to none) — for DaVinci/Premiere. */
  transparent?: boolean;
  /** Drop the clip track and render only the overlays/VFX/titles (implies transparent). */
  overlaysOnly?: boolean;
  /** The project was already reduced to one wall clip client-side (wall-edit.ts#wallOnlyProject);
   *  the server only tags the output file name. */
  wallOnly?: boolean;
  /** Parallel render tabs. 0/undefined = all CPU cores. */
  concurrency?: number;
  /** Chromium GL backend: "angle" (GPU) · "swiftshader" (CPU) · "default". */
  gl?: string;
  /** H.264 quality (1–51, lower = higher quality). Default 16. */
  crf?: number;
  /** x264 speed preset. At the same CRF the faster presets keep the same visual quality and cost a
   *  somewhat larger file; "medium" is x264's default. Default "veryfast" (measured 17 % faster
   *  than "fast" on a 4K wall render). */
  x264Preset?: "ultrafast" | "superfast" | "veryfast" | "faster" | "fast" | "medium" | "slow";
  /** "full" (default) · "draft" = half resolution, lighter compression · "preview" = ~960 px wide,
   *  15 fps (the project is re-timed client-side), 8 tabs, fast — a quick look, not a master. */
  quality?: "full" | "draft" | "preview";
}

/** POST the project + render options to the dev-server endpoint and stream NDJSON progress. */
export async function renderVideo(
  project: Project,
  options: RenderOptions,
  onMsg: (m: RenderMsg) => void,
  signal?: AbortSignal,
): Promise<void> {
  // Aborting the fetch closes the request; the dev-server plugin cancels the render on close.
  const res = await fetch("/api/render", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project, options }),
    signal,
  });
  if (!res.body) {
    onMsg({ type: "error", message: "No response stream" });
    return;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let terminal = false; // saw done / error — otherwise the server ended the stream mid-render
  const emit = (t: string) => {
    try {
      const m = JSON.parse(t) as RenderMsg;
      if (m.type === "done" || m.type === "error") terminal = true;
      onMsg(m);
    } catch {
      /* ignore partial */
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (t) emit(t);
    }
  }
  if (buf.trim()) emit(buf.trim());
  // A stream that ends without a result is a failure, never "still running": the dev server
  // died, restarted, or dropped the render. Show it instead of a frozen status line.
  if (!terminal) onMsg({ type: "error", message: "The render server ended the stream without a result — check the wall.bat window and out/<render>.log, then try again." });
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

/** Assets + audio + the ref → proxy-ref map, in one call (also feeds the proxy store). */
export async function listMediaFull(project = ""): Promise<{ assets: string[]; audio: string[]; proxies: Record<string, string> }> {
  try {
    const res = await fetch(`/api/media${project ? `?project=${encodeURIComponent(project)}` : ""}`);
    const data = await res.json();
    const proxies = data.proxies && typeof data.proxies === "object" ? (data.proxies as Record<string, string>) : {};
    setProxies(proxies);
    return { assets: Array.isArray(data.assets) ? data.assets : [], audio: Array.isArray(data.audio) ? data.audio : [], proxies };
  } catch {
    return { assets: [], audio: [], proxies: {} };
  }
}

/** Upload a browser-made proxy for the stored file `storedRef` (e.g. "media/p/photo.jpg"); the
 *  server files it under that folder's _proxy/ and the proxy store learns the pair. */
export async function uploadProxy(storedRef: string, blob: Blob): Promise<string | null> {
  try {
    const parts = storedRef.split("/");
    const name = parts.pop()!;
    const project = parts.length === 2 ? parts[1] : "";
    const q = `name=${encodeURIComponent(proxyName(name))}&proxy=1${project ? `&project=${encodeURIComponent(project)}` : ""}`;
    const res = await fetch(`/api/upload?${q}`, { method: "POST", body: blob });
    const r = (await res.json()) as { ok: boolean; ref?: string };
    if (r.ok && r.ref) {
      addProxy(storedRef, r.ref);
      return r.ref;
    }
    return null;
  } catch {
    return null;
  }
}

/** Import a dropped/picked file into public/media/<project>/. Returns the ref (e.g.
 *  "media/my-wedding/photo.jpg"). With no project it lands in flat public/media/.
 *  A raster still bigger than PROXY_MAX_EDGE also gets an editor proxy right away (made in the
 *  browser, stored beside it) — every import path goes through here, so every path gets one. */
export async function uploadMedia(file: File, project = ""): Promise<{ ok: boolean; ref?: string; message?: string }> {
  try {
    const q = `name=${encodeURIComponent(file.name)}${project ? `&project=${encodeURIComponent(project)}` : ""}`;
    const res = await fetch(`/api/upload?${q}`, { method: "POST", body: file });
    const r = (await res.json()) as { ok: boolean; ref?: string; message?: string };
    if (r.ok && r.ref && proxyEligible(file.name)) {
      const px = await makeProxy(file, file.name).catch(() => null);
      if (px) await uploadProxy(r.ref, px);
    }
    return r;
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** Delete one imported file (+ its proxy) from public/media/. Root public/ assets are refused. */
export async function deleteMedia(ref: string): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch("/api/delete-media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref }),
    });
    const r = (await res.json()) as { ok: boolean; message?: string };
    if (r.ok) removeProxy(ref);
    return r;
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
