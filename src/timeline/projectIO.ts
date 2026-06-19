// ---------------------------------------------------------------------------
// Project save / load — serialize a Timeline `project` config to (and from) the
// same JSON shape the render CLI consumes (`--props=./projects/your.json`).
//
// Framework-agnostic on purpose (no React) so it stays easy to test and reuse.
// The interactive Studio UI that calls these lives in `ProjectToolbar.tsx`.
// ---------------------------------------------------------------------------

import { projectSchema, type Project } from "./schema";

/** Pretty-print a project to the canonical, render-ready JSON (schema-normalized). */
export const serializeProject = (project: Project): string =>
  `${JSON.stringify(projectSchema.parse(project), null, 2)}\n`;

export type ParseResult =
  | { ok: true; project: Project }
  | { ok: false; error: string };

/** Parse + validate untrusted JSON text against `projectSchema`. Never throws. */
export const parseProject = (text: string): ParseResult => {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `Not valid JSON: ${(e as Error).message}` };
  }
  const result = projectSchema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first?.path.length ? ` at "${first.path.join(".")}"` : "";
    return { ok: false, error: `Invalid project${where}: ${first?.message ?? "schema mismatch"}` };
  }
  return { ok: true, project: result.data };
};

/** Read a picked File as UTF-8 text. */
export const readFileText = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsText(file);
  });

/** Trigger a browser download of `project` as `<filename>.json` (Studio/browser only). */
export const downloadProject = (project: Project, filename = "project.json"): void => {
  const name = filename.endsWith(".json") ? filename : `${filename}.json`;
  const blob = new Blob([serializeProject(project)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
