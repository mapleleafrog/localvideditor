import type { CSSProperties } from "react";
import { composeStyles as composeStylesPortable } from "./portable";

/**
 * The single-source `composeStyles` lives in `portable.ts` (framework-neutral).
 * Re-exported here with a `CSSProperties`-typed alias so existing importers
 * (e.g. `Layer.tsx` via the effects barrel) stay unchanged. Runtime is identical.
 */
export const composeStyles = composeStylesPortable as unknown as (
  styles: CSSProperties[],
) => CSSProperties;
