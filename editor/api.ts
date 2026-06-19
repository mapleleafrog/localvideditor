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
