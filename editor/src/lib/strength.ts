// Detects whether a motion's CSS output actually changes when strength is dialed away from 1 —
// so the Inspector can grey out the per-effect Strength slider for effects that ignore it (e.g.
// backgroundColor-type / non-transform-non-filter-non-opacity motions — see scaleStrength's
// comment in src/effects/compose.ts for what it can and can't dial).
import { getMotion, scaleStrength } from "./effects-bridge";
import { beatKick } from "../../../src/effects/helpers";

const cache = new Map<string, boolean>();

/** Dense-sampled (46 frames across a 120bpm-ish window) so a motion whose transform/filter/opacity
 *  only diverges from identity at certain phases (e.g. a beat kick, a loop wrap) isn't missed by a
 *  single sample point. Cached per id — the check is pure given a fixed sample set. */
export function respondsToStrength(id: string): boolean {
  const hit = cache.get(id);
  if (hit !== undefined) return hit;
  const style = getMotion(id);
  let responds = false;
  for (let f = 0; f <= 45 && !responds; f++) {
    const t = f / 30;
    const s = style({ progress: f / 45, frame: f, fps: 30, t, beat: beatKick(t, 120, 6, 0), z: 0.4, params: {} });
    const scaled = scaleStrength(s, 0.4);
    for (const k of new Set([...Object.keys(s), ...Object.keys(scaled)])) {
      if ((s as Record<string, unknown>)[k] !== (scaled as Record<string, unknown>)[k]) {
        responds = true;
        break;
      }
    }
  }
  cache.set(id, responds);
  return responds;
}
