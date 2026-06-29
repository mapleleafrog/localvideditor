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

const fmt = (n: number) => String(Math.round(n * 10000) / 10000);
const lerpId = (v: number, id: number, s: number) => id + (v - id) * s;

// Scale every numeric arg of a transform function toward its identity (1 for scale*, 0 for
// translate/rotate/skew); matrix/perspective are left untouched.
const scaleTransform = (tf: string, s: number) =>
  tf.replace(/([a-zA-Z]+)\(([^)]*)\)/g, (m, fn: string, args: string) => {
    const f = fn.toLowerCase();
    const id = f.startsWith("scale") ? 1 : f.startsWith("translate") || f.startsWith("rotate") || f.startsWith("skew") ? 0 : null;
    if (id === null) return m;
    const scaled = args.split(",").map((tok) => tok.replace(/-?\d*\.?\d+/, (n) => fmt(lerpId(parseFloat(n), id, s))));
    return `${fn}(${scaled.join(",")})`;
  });

// Single-arg filters dialed toward identity; drop-shadow / unknown filters are left untouched.
const FILTER_ID: Record<string, number> = { blur: 0, "hue-rotate": 0, grayscale: 0, sepia: 0, invert: 0, brightness: 1, contrast: 1, saturate: 1, opacity: 1 };
const scaleFilter = (ff: string, s: number) =>
  ff.replace(/([a-z-]+)\(([^)]*)\)/gi, (m, fn: string, args: string) => {
    const id = FILTER_ID[fn.toLowerCase()];
    if (id === undefined) return m;
    return `${fn}(${args.replace(/-?\d*\.?\d+/, (n) => fmt(lerpId(parseFloat(n), id, s)))})`;
  });

/** Dial an effect's intensity: scale its transform / filter magnitudes and opacity toward identity
 *  (s=1 → unchanged, s=0 → no effect, s>1 → exaggerated). Generic, so it works on any motion's CSS
 *  output without per-formula changes. Props like backgroundColor are left as-is (won't scale). */
export const scaleStrength = (style: CSSProperties, s: number): CSSProperties => {
  if (s === 1) return style;
  const out: CSSProperties = { ...style };
  if (typeof out.transform === "string") out.transform = scaleTransform(out.transform, s);
  if (typeof out.filter === "string") out.filter = scaleFilter(out.filter, s);
  if (typeof out.opacity === "number") out.opacity = Math.max(0, Math.min(1, lerpId(out.opacity, 1, s)));
  return out;
};
