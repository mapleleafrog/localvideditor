import type { CSSProperties } from "react";

/**
 * Merge a stack of motion styles into one — the single source of truth for
 * "use multiple effects at once": `transform` strings concatenated, `filter`
 * strings concatenated, `opacity` multiplied, everything else last-wins.
 * Mirrored in the no-npm portal's inline JS `composeStyles`.
 */
export const composeStyles = (styles: CSSProperties[]): CSSProperties => {
  const out: Record<string, unknown> = {};
  const transforms: string[] = [];
  const filters: string[] = [];
  let opacity = 1;
  let hasOpacity = false;

  for (const s of styles) {
    for (const [k, v] of Object.entries(s)) {
      if (v == null) continue;
      if (k === "transform") {
        transforms.push(String(v));
      } else if (k === "filter") {
        if (v !== "none") filters.push(String(v));
      } else if (k === "opacity") {
        opacity *= Number(v);
        hasOpacity = true;
      } else {
        out[k] = v;
      }
    }
  }

  if (transforms.length) out.transform = transforms.join(" ");
  if (filters.length) out.filter = filters.join(" ");
  if (hasOpacity) out.opacity = opacity;
  return out as CSSProperties;
};
