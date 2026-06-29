import { useEditor } from "../store";

/** Folder/file-safe project name (matches the server's sanitiser closely enough to stay consistent). */
export const safeName = (raw: string): string =>
  (raw || "").trim().replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60);

/** Return the current project name, prompting for one (and storing it) if not set yet.
 *  Returns null if the user cancels — callers should abort the import in that case. */
export const ensureProjectName = (): string | null => {
  const current = useEditor.getState().projectName;
  if (current) return current;
  const input = window.prompt("Name this project — its imported media is stored in public/media/<name>/:", "my-wedding");
  const name = safeName(input || "");
  if (!name) return null;
  useEditor.getState().setProjectName(name);
  return name;
};
