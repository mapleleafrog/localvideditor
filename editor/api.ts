// Thin client for the Vite dev-server API (see editor/vite.config.mjs).
import type { Opt } from "./options";

export const listMedia = async (): Promise<string[]> => {
  const r = await fetch("/api/media");
  return (await r.json()).files ?? [];
};

export const listProjects = async (): Promise<string[]> => {
  const r = await fetch("/api/projects");
  return (await r.json()).files ?? [];
};

/** Upload a file into public/media/, returns the `media/<name>` src to reference. */
export const uploadMedia = async (file: File): Promise<string> => {
  const r = await fetch(`/api/upload?name=${encodeURIComponent(file.name)}`, {
    method: "POST",
    body: file,
  });
  const data = await r.json();
  if (!r.ok || !data.src) throw new Error(data.error ?? "upload failed");
  return data.src as string;
};

/** Write a project JSON into projects/<name>.json on disk. */
export const saveProjectToDisk = async (name: string, json: string): Promise<string> => {
  const r = await fetch(`/api/save?name=${encodeURIComponent(name)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: json,
  });
  const data = await r.json();
  if (!r.ok || !data.path) throw new Error(data.error ?? "save failed");
  return data.path as string;
};

export const loadProjectFromDisk = async (name: string): Promise<string> => {
  const r = await fetch(`/api/load?name=${encodeURIComponent(name)}`);
  const data = await r.json();
  if (!r.ok || typeof data.contents !== "string") throw new Error(data.error ?? "load failed");
  return data.contents as string;
};

export const toOpts = (names: string[]): Opt[] => names.map((n) => ({ value: n, label: n }));

/**
 * Render the project to out/<name>.mp4 server-side (spawns `remotion render`),
 * streaming the CLI log back. `onChunk` receives the accumulated log so far.
 * Returns the full log; look for "__DONE__ <file>" / "__FAILED__" markers.
 */
export const renderProject = async (
  name: string,
  json: string,
  onChunk: (log: string) => void,
): Promise<string> => {
  const r = await fetch(`/api/render?name=${encodeURIComponent(name)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: json,
  });
  if (!r.body) throw new Error("render stream unavailable");
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += dec.decode(value, { stream: true });
    onChunk(out);
  }
  return out;
};

export const outputUrl = (file: string) => `/api/output?name=${encodeURIComponent(file)}`;
