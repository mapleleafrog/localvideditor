// `getMotion` lives in its own module so `stack.ts` can be an actual LEAF.
//
// It used to be declared in `index.ts`, which also re-exports `stack.ts` — an import cycle that
// happened to work only because `getMotion` is never touched at module-evaluation time (it is a
// `const`, i.e. a TDZ binding, read solely inside `stackMotions`). Any future top-level use of it
// in `stack.ts`, or a bundler ordering that hoists `stack.ts` ahead of `index.ts`'s statements,
// would turn that into a ReferenceError at import time — a hard render failure.
//
// `index.ts` re-exports both names, so every existing `import { getMotion } from "../effects"`
// is unchanged.
import { motions } from "./motions";
import type { MotionDef } from "./types";

export const IDENTITY: NonNullable<MotionDef["style"]> = () => ({});

/** Resolve a motion's style fn. Unknown/todo -> identity (never throws). */
export const getMotion = (id: string): NonNullable<MotionDef["style"]> => {
  const m = motions[id];
  if (!m || m.status !== "ready" || !m.style) {
    console.warn(`[soranji-vfx] motion "${id}" not ready -> identity`);
    return IDENTITY;
  }
  return m.style;
};
