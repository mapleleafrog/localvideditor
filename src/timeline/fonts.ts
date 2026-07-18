// Japanese display fonts for text overlays, loaded via @remotion/google-fonts.
//
// RENDER-SAFE (preview == MP4): loadFont() injects @font-face and gates each subset chunk on
// delayRender, so headless Chrome waits for the glyphs before it captures a frame — the editor
// <Player> and the MP4 render show the identical typeface.
//
// Loading is LAZY + memoized: a family's woff2 chunks are only fetched when a project actually
// resolves that font id during render (via resolveFontFamily below). So SoranjiSample and the QA
// galleries — which never set overlay.fontFamily — pay nothing, and merely importing this module
// (schema / Inspector need FONT_IDS / FONT_OPTIONS) loads no fonts. Google slices the CJK
// "japanese" subset into ~120 unicode-range chunks, so a *used* JP family still pulls many
// requests from fonts.gstatic.com — an accepted network dependency at render time (an offline
// render can't fetch them and falls back). We request only weight 700 (the text overlay renders
// bold) to keep that count in half.
import { loadFont as loadNotoSerifJP } from "@remotion/google-fonts/NotoSerifJP";
import { loadFont as loadZenMaruGothic } from "@remotion/google-fonts/ZenMaruGothic";
import { loadFont as loadShipporiMincho } from "@remotion/google-fonts/ShipporiMincho";
import { loadFont as loadNotoSansJP } from "@remotion/google-fonts/NotoSansJP";

// Options are inlined per call (not a shared const) so each font's weight/subset literal-union
// types check — a widened `string[]` const would not be assignable to `("400"|"700"|…)[]`.
const LOADERS: Record<string, () => string> = {
  notoSerifJP: () =>
    loadNotoSerifJP("normal", { weights: ["700"], subsets: ["japanese", "latin"], ignoreTooManyRequestsWarning: true }).fontFamily,
  zenMaruGothic: () =>
    loadZenMaruGothic("normal", { weights: ["700"], subsets: ["japanese", "latin"], ignoreTooManyRequestsWarning: true }).fontFamily,
  shipporiMincho: () =>
    loadShipporiMincho("normal", { weights: ["700"], subsets: ["japanese", "latin"], ignoreTooManyRequestsWarning: true }).fontFamily,
  notoSansJP: () =>
    loadNotoSansJP("normal", { weights: ["700"], subsets: ["japanese", "latin"], ignoreTooManyRequestsWarning: true }).fontFamily,
};

export const FONT_IDS = ["default", "notoSerifJP", "zenMaruGothic", "shipporiMincho", "notoSansJP"] as const;
export type FontId = (typeof FONT_IDS)[number];

export const FONT_OPTIONS: { id: FontId; label: string }[] = [
  { id: "default", label: "Default (monospace)" },
  { id: "notoSerifJP", label: "Noto Serif JP (serif)" },
  { id: "zenMaruGothic", label: "Zen Maru Gothic (rounded)" },
  { id: "shipporiMincho", label: "Shippori Mincho (mincho)" },
  { id: "notoSansJP", label: "Noto Sans JP (sans)" },
];

const cache = new Map<string, string>();

/** Resolve an overlay's fontFamily id to a CSS font-family string, lazily loading the Google Font
 *  on first use (memoized). Unset / "default" / unknown → "monospace" so existing projects render
 *  byte-identical. Safe on the server: loadFont() is a no-op there (no FontFace) and just returns
 *  the family name. */
export const resolveFontFamily = (id?: string): string => {
  if (!id || id === "default") return "monospace";
  const hit = cache.get(id);
  if (hit) return hit;
  const load = LOADERS[id];
  if (!load) return "monospace";
  const family = load();
  cache.set(id, family);
  return family;
};
