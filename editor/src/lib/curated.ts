// Tag-derived "shelves" for the Effect Browser — small hand-curated slices of the ready-motion
// registry so the wedding-MV workflow doesn't start from a flat 100+-row alphabet soup. Computed
// once at module load from the live registry (`readyMotions()`), so a motion that's later flipped
// from `todo` to `ready` (or renamed) is picked up automatically without touching this file.
import { readyMotions } from "./effects-bridge";

const MOTIONS = readyMotions();
const hasAnyTag = (tags: readonly string[], wanted: string[]): boolean => {
  const lower = tags.map((t) => t.toLowerCase());
  return wanted.some((w) => lower.includes(w));
};

/** Romantic / dreamy wedding-grade motions. */
export const weddingShelf: string[] = MOTIONS.filter((m) => hasAnyTag(m.tags, ["wedding", "romantic", "dreamy"])).map(
  (m) => m.id,
);

/** Tempo-locked / high-energy motions. */
export const beatShelf: string[] = MOTIONS.filter((m) => hasAnyTag(m.tags, ["bpm", "energetic"])).map((m) => m.id);

/** Pixel-art / retro motions. */
export const pixelShelf: string[] = MOTIONS.filter((m) => hasAnyTag(m.tags, ["pixel", "retro"])).map((m) => m.id);

// Hand-picked wedding-MV workhorses (verified against src/effects/catalog.ts). Filtered through
// the live ready registry below, so a candidate that's ever un-shipped just quietly drops out.
const RECOMMENDED_CANDIDATES = [
  "goldenHour",
  "dreamGlow",
  "weddingPetals",
  "bokehLights",
  "sakuraPetals",
  "kenBurns",
  "beatPulse",
  "romanticGlow",
  "softFocusBreath",
  "sparkleGlow",
  "confettiRain",
  "lightLeakWarm",
];

const readyIds = new Set(MOTIONS.map((m) => m.id));
export const RECOMMENDED: string[] = RECOMMENDED_CANDIDATES.filter((id) => readyIds.has(id));
