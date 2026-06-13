import { fade } from "@remotion/transitions/fade";
import { motions } from "./motions";
import { transitions } from "./transitions";
import type { MotionDef, TransitionDef } from "./types";

export * from "./types";
export { motions, transitions };
export { CATALOG } from "./catalog";
export { depthShadow, depthScale, bevel } from "./depth";
export { composeStyles } from "./compose";

const IDENTITY: NonNullable<MotionDef["style"]> = () => ({});

/** Resolve a motion's style fn. Unknown/todo -> identity (never throws). */
export const getMotion = (id: string): NonNullable<MotionDef["style"]> => {
  const m = motions[id];
  if (!m || m.status !== "ready" || !m.style) {
    console.warn(`[soranji-vfx] motion "${id}" not ready -> identity`);
    return IDENTITY;
  }
  return m.style;
};

/** Resolve a transition presentation. Unknown/todo -> fade (never throws). */
export const getTransitionPresentation = (id: string, params?: Record<string, unknown>) => {
  const t = transitions[id];
  if (!t || t.status !== "ready" || !t.presentation) {
    console.warn(`[soranji-vfx] transition "${id}" not ready -> fade`);
    return fade();
  }
  return t.presentation(params);
};

// Licenses that don't require a credits-file entry on their own.
const INFORMAL_LICENSES = ["MIT", "write-own", "technique", "asset", "simulated"];

/** Markdown listing every effect carrying a credit or an attribution license
 *  (the two BSD shaders, all credited gl-transitions authors, etc.). */
export const buildCreditsMarkdown = (): string => {
  const all = [...Object.values(motions), ...Object.values(transitions)];
  const lines = all
    .filter((e) => e.credit || (e.license && !INFORMAL_LICENSES.includes(e.license)))
    .map((e) => `- **${e.name}** (\`${e.id}\`) — ${e.license ?? "MIT"}${e.credit ? ` — ${e.credit}` : ""}`);
  return `# Credits & Licenses\n\nEffect sources requiring attribution:\n\n${lines.join("\n")}\n`;
};

/** Ready motions, for the EffectGallery showcase. */
export const readyMotions = (): MotionDef[] =>
  Object.values(motions).filter((m) => m.status === "ready" && Boolean(m.style));

/** Ready transitions. `previewSafe` drops engine:"webgl" (Chrome-flag) shaders. */
export const readyTransitions = (opts?: { previewSafe?: boolean }): TransitionDef[] =>
  Object.values(transitions).filter(
    (t) =>
      t.status === "ready" &&
      Boolean(t.presentation) &&
      (!opts?.previewSafe || t.engine !== "webgl"),
  );
