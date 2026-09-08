// Wall mode — the LOOK. Pure constants and CSS builders: no React, no frame reads, no DOM.
//
// Everything here is a deterministic function of (item / paper preset / camera / seed), so the
// renderer, the editor's authoring viewport and the MP4 all produce identical pixels. The only
// imports are the effects registry's own `scaleStrength` (an honest reuse for filter strength)
// and `seededRandom` (the same deterministic hash the motion formulas use).
//
// SEEDS NEVER CARRY A FRAME TERM. A frame term in a seed is exactly what makes prints "boil"
// frame to frame; the editor writes a random `seed` at item creation so duplicating, reordering
// or dragging an item never re-rolls its tape angles.
import type { CSSProperties } from "react";
import { scaleStrength } from "../effects/compose";
import { seededRandom } from "../effects/helpers";
import type { Cam, Box, WallItemLike } from "./wall";

const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
/** Negative-safe modulo — the camera is never clamped and may sit at x = -400 000. */
const mod = (v: number, s: number) => (s <= 0 ? 0 : ((v % s) + s) % s);
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Stable integer seed from a string (src / text), for items created without an explicit seed. */
export const hashString = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h | 0);
};

/** The item's stable look seed. */
export const itemSeed = (it: { seed?: number; src?: string; text?: string }) =>
  typeof it.seed === "number" && Number.isFinite(it.seed) ? Math.abs(Math.round(it.seed)) : hashString(it.src || it.text || "");

// ---------------------------------------------------------------------------------------------
// Paper presets
// ---------------------------------------------------------------------------------------------

export interface PaperPreset {
  /** Base colour of the wall. Painted INSIDE the cover's blending group (see paperLowStyle). */
  base: string;
  /** Ink colour for hand-written captions on this paper. */
  ink: string;
  /** Shadow ink as an "r,g,b" triple, plus a per-preset opacity multiplier. */
  shadowInk: string;
  shadowK: number;
  /** Mount-board colour for the `matte` treatment — a shade off the paper. */
  matte: string;
  /** Finish vignette colour (already carries its alpha). */
  vignette: string;
  /** Dark presets flip the warm grade to a cool one. */
  dark?: boolean;
}

export type PaperId = "cream" | "kraft" | "white" | "night";

export const PAPER: Record<PaperId, PaperPreset> = {
  cream: { base: "#e6dbc6", ink: "#3a3226", shadowInk: "38,26,14", shadowK: 1.0, matte: "#d8cdb8", vignette: "rgba(24,14,4,.32)" },
  kraft: { base: "#c2a274", ink: "#43301c", shadowInk: "48,32,16", shadowK: 1.0, matte: "#a98c66", vignette: "rgba(28,16,4,.36)" },
  white: { base: "#f7f6f3", ink: "#2b2b2b", shadowInk: "44,40,36", shadowK: 1.0, matte: "#e6e4df", vignette: "rgba(20,20,20,.22)" },
  night: { base: "#171a22", ink: "#e8e2d4", shadowInk: "0,0,0", shadowK: 1.3, matte: "#2a2f38", vignette: "rgba(0,0,0,.50)", dark: true },
};

export const paperPreset = (id: string | undefined): PaperPreset => PAPER[(id ?? "cream") as PaperId] ?? PAPER.cream;

// ---------------------------------------------------------------------------------------------
// Infinite paper (design §4)
//
// One rotated cover SQUARE of side hypot(W,H)+8 covers the frame at ANY rotation, so the wrapper
// is rotation-independent and its DOM size never changes. Inside it (the camera's un-rotated
// frame) the wall->local map is a pure scale+translate:
//
//     local(p) = SPAN/2 + zoom*(p - cam)
//     size     = TILE * zoom
//     pos      = mod(SPAN/2 - cam*zoom, size)
//
// The modulo is EXACT, not an approximation: the tile is periodic with period exactly `size`, so
// shifting the offset by any integer multiple renders identical pixels. It exists only to keep
// the number in [0, size) so float precision never bites far from the origin.
//
// There is NO min-size clamp — `size` stays exact at all zooms and the fibre is FADED instead
// (a clamp would break the anchoring derivative at the threshold; a fade is continuous, and
// physically right: you stop seeing paper grain when you step back).
// ---------------------------------------------------------------------------------------------

/** Wall units of one fibre tile (the high band). */
export const TILE_FIBRE = 256;
/** Wall units of the low band. At zoom 0.4 that is still 819 screen px — orders of magnitude
 *  above Nyquist, so it can never moire, and it carries the "this is paper" read when pulled out. */
export const TILE_LOW = 2048;

export const paperSpan = (W: number, H: number) => Math.ceil(Math.hypot(W, H)) + 8;

/** `.wl-cover` — the rotated cover square. `isolation: isolate` makes it THE BLENDING GROUP, which
 *  is why the base colour has to live on a child (paperLowStyle) and not on an outer element:
 *  a `multiply` fibre inside the group would otherwise multiply against transparency and
 *  degenerate to normal compositing.
 *
 *  Deliberately NO `will-change: transform` (a deviation from Layer.tsx, which sets it correctly
 *  for overlays): `will-change` promotes to a composited layer rasterised at a FIXED scale, and
 *  zooming that resamples a cached bitmap — blurry and shimmery under a moving camera. */
export const paperCoverStyle = (cam: Cam, W: number, H: number): CSSProperties => {
  const span = paperSpan(W, H);
  return {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: span,
    height: span,
    marginLeft: -span / 2,
    marginTop: -span / 2,
    transform: `rotate(${(-cam.rot).toFixed(4)}deg)`,
    transformOrigin: "50% 50%",
    isolation: "isolate",
  };
};

// Every repeating stop is a RAMP, never a hard `0 1px, transparent 1px 4px` square wave — a
// square wave is infinite harmonics and is the classic moire generator.
const LOW_LAYERS = [
  "radial-gradient(38% 30% at 22% 18%, rgba(255,238,200,0.30), rgba(255,238,200,0) 70%)",
  "radial-gradient(44% 36% at 78% 82%, rgba(60,80,110,0.10), rgba(60,80,110,0) 72%)",
  "radial-gradient(58% 46% at 62% 36%, rgba(120,96,58,0.09), rgba(120,96,58,0) 76%)",
  "linear-gradient(96deg, rgba(0,0,0,0) 46%, rgba(0,0,0,0.045) 50%, rgba(0,0,0,0) 54%)",
].join(", ");

/** `.wl-paper-low` — the base colour plus the huge low band. NEVER fades. */
export const paperLowStyle = (paper: PaperPreset, cam: Cam, W: number, H: number): CSSProperties => {
  const span = paperSpan(W, H);
  // Rounded ONCE and reused: the browser tiles with the emitted (rounded) size, so reducing the
  // offset modulo the UNROUNDED size would leave a slow phase drift far from the origin that steps
  // discontinuously whenever the rounded size ticks — exactly the crawl §4.5 rule 1 forbids.
  const size = r3(TILE_LOW * cam.zoom);
  return {
    position: "absolute",
    inset: 0,
    backgroundColor: paper.base,
    backgroundImage: LOW_LAYERS,
    backgroundSize: `${size}px ${size}px`,
    backgroundPosition: `${r3(mod(span / 2 - cam.x * cam.zoom, size))}px ${r3(mod(span / 2 - cam.y * cam.zoom, size))}px`,
    backgroundRepeat: "repeat",
  };
};

/** Fibre visibility: a hand mip (full from zoom 0.50, gone below 0.15) times an anti-strobe term
 *  that fades the HIGHEST frequency as the camera accelerates. Paired with `bloomBoost`, the
 *  frame then SOFTENS rather than DIMS as it moves — which is what a real lens and a real eye do,
 *  and is far cheaper and far less destructive than a CSS blur() pass. */
export const fibreGain = (fibre: number, zoom: number, speed: number) =>
  clamp(fibre) * clamp((zoom - 0.15) / 0.35) * (1 - 0.5 * clamp(speed / 40));

/** Bloom is lifted by the same speed term the fibre is cut by. */
export const bloomBoost = (speed: number) => 1 + 0.25 * clamp(speed / 40);

/** `.wl-paper-fibre` — the high band, on its OWN element with its OWN opacity (packing both tiles
 *  into one element's backgroundImage list with backgroundBlendMode cannot express per-layer
 *  alpha, which is what made the `fibre` slider dead in an earlier design).
 *  Returns null when the gain is negligible — don't paint an invisible full-frame div. */
export const paperFibreStyle = (cam: Cam, W: number, H: number, fibre: number, speed: number): CSSProperties | null => {
  const g = fibreGain(fibre, cam.zoom, speed);
  if (g < 0.004) return null;
  const span = paperSpan(W, H);
  // Rounded ONCE and reused — see paperLowStyle.
  const size = r3(TILE_FIBRE * cam.zoom);
  return {
    position: "absolute",
    inset: 0,
    // The rule guards against a staticFile() CSS background, which is NOT delayRender-gated. This
    // is an INLINE data-URI (design §4.3): no network, nothing to gate, preview == render.
    // eslint-disable-next-line @remotion/no-background-image
    backgroundImage: `url(${PAPER_FIBRE_URI})`,
    backgroundSize: `${size}px ${size}px`,
    backgroundPosition: `${r3(mod(span / 2 - cam.x * cam.zoom, size))}px ${r3(mod(span / 2 - cam.y * cam.zoom, size))}px`,
    backgroundRepeat: "repeat",
    mixBlendMode: "multiply",
    opacity: r3(0.085 * g),
  };
};

// ---------------------------------------------------------------------------------------------
// Item looks (design §5.2 - §5.4)
// ---------------------------------------------------------------------------------------------

/** Dual shadows on ONE `lift` scalar, with OPPOSED terms: the contact term tightens AND lightens
 *  while the ambient spreads AND darkens. That opposition is the height cue; a single shadow that
 *  only gets blurrier is the code-template tell. Radii are in WALL units and scale with zoom for
 *  free, because position-only parallax makes the rendered size exactly `box * zoom`. */
export const dualShadow = (lift: number, ink: string, k = 1) => {
  const L = clamp(lift);
  return (
    `0 ${(1.5 + 3.5 * L).toFixed(1)}px ${(3 + 9 * L).toFixed(1)}px rgba(${ink},${((0.3 - 0.14 * L) * k).toFixed(3)}),` +
    ` 0 ${(8 + 30 * L).toFixed(1)}px ${(18 + 46 * L).toFixed(1)}px rgba(${ink},${((0.12 + 0.14 * L) * k).toFixed(3)})`
  );
};

export type FrameId = "none" | "polaroid" | "matte" | "taped" | "torn";

export const LIFT: Record<FrameId, number> = { none: 0.1, polaroid: 0.22, matte: 0.16, taped: 0.06, torn: 0.14 };

/** Wall units. >= 3 so a near-horizontal edge under a 0.22 deg breathing roll does not stair-step
 *  (design §4.5 rule 5 — no 1 px hard rims anywhere). */
export const CARD_RADIUS = 3;

/** A 14-point seeded deckle polygon for `torn`, as a `clip-path` value. Deterministic per seed.
 *
 *  It encloses ~0.81-0.88 of the box — a rounded RECTANGLE with a ragged edge, not a circle and
 *  emphatically not a diamond (check:wall group 13 pins both the area and the 45-degree reach,
 *  because an inverted exponent here is a silent visual bug that types fine).
 *
 *  It does NOT fully contain the `torn` window (inset 3%): the ragged inset reaches 3.5%, so a torn
 *  edge bites very slightly into the print at the corners. That is the point of a torn edge. */
export const tornPolygon = (seed: number) => {
  const N = 14;
  const pts: string[] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    // ~3% ragged inset around a rounded square, so the deckle reads as torn paper not as a circle.
    const j = 0.035 * seededRandom(seed + i * 7 + 1);
    const rx = 0.5 - j;
    const ry = 0.5 - 0.035 * seededRandom(seed + i * 13 + 5);
    // Superellipse exponent: the parametrisation is |cos|^(2/sq), so sq MUST be > 2 to push the
    // polygon OUT toward the corners. sq = 2 is the circle; anything below it pulls the points in
    // toward the axes and the deckle renders as a diamond instead of a torn rectangle.
    const sq = 4;
    const cx = 0.5 + Math.sign(Math.cos(a)) * Math.pow(Math.abs(Math.cos(a)), 2 / sq) * rx;
    const cy = 0.5 + Math.sign(Math.sin(a)) * Math.pow(Math.abs(Math.sin(a)), 2 / sq) * ry;
    pts.push(`${(cx * 100).toFixed(2)}% ${(cy * 100).toFixed(2)}%`);
  }
  return `polygon(${pts.join(", ")})`;
};

export interface FrameCss {
  /** `.wl-card` — the physical print. Carries the flip transform in Wall.tsx. */
  card: CSSProperties;
  /** `.wl-window` — the emulsion. Sets overflow:hidden + isolation:isolate so the `faded` wash's
   *  `screen` blend is contained. */
  window: CSSProperties;
  /** `.wl-shadow` — a SIBLING of `.wl-fx`, so the card sways and the shadow stays on the paper.
   *  For `torn` this is a blurred CLIPPED BACKING, never a drop-shadow on the clipped element
   *  (box-shadow is clipped away by clip-path, and filter:drop-shadow is computed BEFORE the clip
   *  and then clipped away too — paint order is filter -> clip -> mask -> opacity). */
  shadow: CSSProperties;
  /** Optional child of `.wl-shadow`, set ONLY by `torn`. The blur and the clip must live on two
   *  DIFFERENT elements: with both on one element the same filter -> clip paint order clips the
   *  blur halo away and the "soft" shadow renders as a hard-edged dark plate (measured: the falloff
   *  terminated in a 2 px, 43-level step). The child carries the polygon, the parent the blur, so
   *  the clip happens first and the blur then spreads freely outside it. */
  shadowInner?: CSSProperties;
  /** Tape strips, children of `.wl-card` (empty for every treatment but `taped`). */
  tapes: CSSProperties[];
  /** Caption block on the margin, or null when this treatment has no margin to write on.
   *  `fontFamily` is deliberately NOT set here — Wall.tsx resolves the hand font via fonts.ts. */
  caption: CSSProperties | null;
}

/**
 * All of an item's chrome, in WALL units (the camera scales it).
 *
 * TEXT ITEMS NEVER REACH THIS FUNCTION. Wall.tsx returns before calling it for `type: "text"`:
 * literal conformance to design §5.7's "treatments forced to none" would draw the `none`
 * treatment's keyline rectangle AND a cast shadow around free-standing handwriting, which is
 * wrong. Consequence for the editor (slice 4/5): `frame` and `caption` are live, defaulted schema
 * fields with NO effect on a text item, so the WallInspector must HIDE (not merely grey) those two
 * controls for text rather than let them be set to something the renderer ignores.
 *
 * @param box the treatment-inclusive OUTER box from wall.ts#itemBox — the same box the editor's
 *            selection handles use, so the handles hug the card for every treatment.
 */
export const frameCss = (it: WallItemLike, paper: PaperPreset, box: Box, seed: number): FrameCss => {
  const w = box.w;
  const id = ((it.frame ?? "none") as FrameId) in LIFT ? ((it.frame ?? "none") as FrameId) : "none";
  const lift = LIFT[id];
  const ink = paper.shadowInk;
  const k = paper.shadowK;
  const baseShadow: CSSProperties = {
    position: "absolute",
    inset: 0,
    borderRadius: CARD_RADIUS,
    boxShadow: dualShadow(lift, ink, k),
  };
  const capFont = 0.085 * w;

  const captionStyle = (top: number, height: number): CSSProperties => ({
    position: "absolute",
    left: 0.07 * w,
    right: 0.07 * w,
    top,
    height,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: paper.ink,
    fontSize: capFont,
    lineHeight: 1,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    opacity: 0.86,
    filter: "blur(0.18px)",
    transform: `rotate(${((seededRandom(seed + 41) - 0.5) * 2.4).toFixed(2)}deg)`,
    transformOrigin: "50% 50%",
    pointerEvents: "none",
  });

  if (id === "polaroid") {
    const pad = 0.05 * w;
    const L = 96 + (seededRandom(seed + 3) - 0.5) * 2.2; // seeded +-1.1 lightness
    return {
      card: {
        position: "absolute",
        inset: 0,
        background: `hsl(42 18% ${L.toFixed(2)}%)`,
        borderRadius: CARD_RADIUS,
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,.05), inset 0 1px 2px rgba(0,0,0,.06)",
      },
      window: {
        position: "absolute",
        left: pad,
        right: pad,
        top: pad,
        // == 0.90 * (w / aspect): the window height itemBox() budgeted, by construction.
        height: box.h - pad - 0.18 * w,
        overflow: "hidden",
        isolation: "isolate",
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,.09)",
      },
      shadow: baseShadow,
      tapes: [],
      caption: captionStyle(box.h - 0.18 * w, 0.18 * w),
    };
  }

  if (id === "matte") {
    const pad = 0.09 * w;
    return {
      card: {
        position: "absolute",
        inset: 0,
        background: paper.matte,
        borderRadius: CARD_RADIUS,
        boxShadow: "inset 0 0 0 2px rgba(0,0,0,.08), inset 0 2px 5px rgba(0,0,0,.18)",
      },
      window: {
        position: "absolute",
        left: pad,
        right: pad,
        top: pad,
        height: box.h - 2 * pad,
        overflow: "hidden",
        isolation: "isolate",
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,.12)",
      },
      shadow: baseShadow,
      tapes: [],
      caption: captionStyle(box.h - pad, pad),
    };
  }

  if (id === "taped") {
    const tw = 0.28 * w;
    const th = 0.075 * w;
    // Opposed signs so the two strips read as a pair, not as a pattern. Jagged ends, never a
    // clean rectangle — a torn-off strip of tape is the whole point.
    const tape = (i: number): CSSProperties => {
      const sgn = i === 0 ? 1 : -1;
      const deg = sgn * (8 + seededRandom(seed + 17 + i) * 6);
      return {
        position: "absolute",
        width: tw,
        height: th,
        top: -th * 0.45,
        left: i === 0 ? -tw * 0.18 : undefined,
        right: i === 1 ? -tw * 0.18 : undefined,
        background: "rgba(238,214,150,.58)",
        boxShadow: "0 1px 3px rgba(0,0,0,.12)",
        transform: `rotate(${deg.toFixed(2)}deg)`,
        transformOrigin: "50% 50%",
        clipPath: "polygon(3% 0%, 97% 4%, 100% 52%, 96% 100%, 4% 96%, 0% 48%)",
        pointerEvents: "none",
      };
    };
    return {
      card: { position: "absolute", inset: 0, borderRadius: CARD_RADIUS },
      window: {
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        isolation: "isolate",
        borderRadius: CARD_RADIUS,
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,.06)",
      },
      shadow: baseShadow,
      tapes: [tape(0), tape(1)],
      caption: null,
    };
  }

  if (id === "torn") {
    const clip = tornPolygon(seed);
    const pad = 0.03 * w;
    return {
      card: {
        position: "absolute",
        inset: 0,
        background: paper.base,
        clipPath: clip,
      },
      window: {
        position: "absolute",
        left: pad,
        right: pad,
        top: pad,
        height: box.h - 2 * pad,
        overflow: "hidden",
        isolation: "isolate",
      },
      // The clipped blurred BACKING, split across two elements (see FrameCss.shadowInner):
      // the OUTER blurs, the INNER carries the polygon.
      shadow: {
        position: "absolute",
        inset: 0,
        filter: "blur(14px)",
        transform: "translateY(7px) scale(1.012)",
        transformOrigin: "50% 50%",
      },
      shadowInner: {
        position: "absolute",
        inset: 0,
        background: `rgba(${ink},${(0.3 * k).toFixed(3)})`,
        clipPath: clip,
      },
      tapes: [],
      caption: null,
    };
  }

  return {
    card: { position: "absolute", inset: 0, borderRadius: CARD_RADIUS },
    window: {
      position: "absolute",
      inset: 0,
      overflow: "hidden",
      isolation: "isolate",
      borderRadius: CARD_RADIUS,
      // A keyline so a white-ish photo still has an edge, without a 1 px hard rim.
      boxShadow: "inset 0 0 0 1px rgba(0,0,0,.06)",
    },
    shadow: baseShadow,
    tapes: [],
    caption: null,
  };
};

// ---------------------------------------------------------------------------------------------
// Filter presets — an honest `scaleStrength` reuse.
//
// compose.ts's FILTER_ID map covers sepia / grayscale / hue-rotate / brightness / contrast /
// saturate, and its regex matches `hue-rotate`, so all six presets dial to a true no-op at s = 0
// with ZERO new code. The filter applies to the MEDIA element, not the card: the frame is the
// physical print, the photo is the emulsion — grading the card would sepia a polaroid's white
// margin and muddy the caption.
// ---------------------------------------------------------------------------------------------

export const FILTER_PRESETS: Record<string, string> = {
  none: "",
  sepia: "sepia(0.55) contrast(1.02) saturate(0.85) brightness(1.02)",
  faded: "saturate(0.72) contrast(0.88) brightness(1.06)",
  bw: "grayscale(1) contrast(1.08) brightness(1.02)",
  warm: "sepia(0.18) saturate(1.12) hue-rotate(-6deg) brightness(1.03)",
  cool: "saturate(0.94) hue-rotate(10deg) brightness(1.02) contrast(1.03)",
};
export const FILTER_IDS = ["none", "sepia", "faded", "bw", "warm", "cool"] as const;

export const filterCss = (id: string | undefined, strength = 1): string => {
  const preset = FILTER_PRESETS[id ?? "none"] ?? "";
  if (!preset) return "";
  const s = clamp(strength, 0, 1);
  return scaleStrength({ filter: preset }, s).filter ?? "";
};

/** `faded` additionally gets a lifted-black wash inside `.wl-window` — filter() can only crush
 *  blacks, never lift them, and lifting them IS the faded look. Null for every other preset. */
export const fadedWashStyle = (id: string | undefined, strength = 1): CSSProperties | null =>
  (id ?? "none") !== "faded"
    ? null
    : {
        position: "absolute",
        inset: 0,
        background: `rgba(244,234,214,${(0.14 * clamp(strength, 0, 1)).toFixed(3)})`,
        mixBlendMode: "screen",
        pointerEvents: "none",
      };

// ---------------------------------------------------------------------------------------------
// Finish — lens layers, OUTSIDE the camera, so they cannot swim or crawl by construction.
// Everything is multiplied by `finish`, so 0 gives a clean ungraded wall for compositing in
// DaVinci and 1 is the full look. (Grain is the 5th layer and lives in Wall.tsx: it is the one
// honest registry reuse, getMotion("grainLoop") with only `opacity` overridden.)
// ---------------------------------------------------------------------------------------------

const lens = (backgroundImage: string, mixBlendMode: CSSProperties["mixBlendMode"]): CSSProperties => ({
  position: "absolute",
  inset: 0,
  backgroundImage,
  mixBlendMode,
  pointerEvents: "none",
});

export const warmStyle = (paper: PaperPreset, finish: number): CSSProperties => {
  const f = clamp(finish);
  return paper.dark
    ? lens(`linear-gradient(0deg, rgba(150,180,255,${(0.09 * f).toFixed(3)}), rgba(150,180,255,0))`, "soft-light")
    : lens(
        `linear-gradient(0deg, rgba(255,206,140,${(0.1 * f).toFixed(3)}), rgba(255,236,208,${(0.05 * f).toFixed(3)}))`,
        "soft-light",
      );
};

export const toeStyle = (finish: number): CSSProperties =>
  lens(`radial-gradient(120% 100% at 50% 40%, transparent 55%, rgba(72,48,24,${(0.1 * clamp(finish)).toFixed(3)}))`, "multiply");

/** Lifted by camera speed (see fibreGain) so the frame softens rather than dims as it moves. */
export const bloomStyle = (finish: number, speed: number): CSSProperties =>
  lens(
    `radial-gradient(60% 45% at 22% 12%, rgba(255,238,200,${(0.28 * clamp(finish) * bloomBoost(speed)).toFixed(3)}), transparent 70%)`,
    "screen",
  );

/** Written locally on purpose: getMotion("vignette") returns a finished backgroundImage with a
 *  hardcoded rgba(0,0,0,0.72) and cannot be paper-tinted. */
export const vignetteStyle = (paper: PaperPreset, finish: number): CSSProperties => ({
  position: "absolute",
  inset: 0,
  backgroundImage: `radial-gradient(112% 92% at 50% 46%, transparent 52%, ${paper.vignette} 88%)`,
  opacity: clamp(finish),
  pointerEvents: "none",
});

// ---------------------------------------------------------------------------------------------
// The fibre tile.
//
// Generated by `node scripts/gen-fibre.mjs` (committed): a SEAMLESS ANISOTROPIC value-noise
// 128x128 8-bit greyscale PNG — periodic value noise, octaves (fx,fy) = (1,20) (2,40) (4,64) with
// amplitudes 0.5 / 0.3 / 0.2, quantised to 16 levels, mapped to grey 255*(1 - 0.35*n). Measured
// anisotropy 21.0:1 (mean |dy| 5.99 vs mean |dx| 0.285) — paper fibre is DIRECTIONAL and STATIC;
// film grain is isotropic and jitters, and that is a different layer.
//
// Inline, not staticFile(): a CSS background loaded from a file is NOT delayRender-gated, so the
// first frames of a render could paint without it. Local to this module, never exported from
// portable.ts, so public/portal/effects.bundle.js cannot go stale.
// ---------------------------------------------------------------------------------------------
export const PAPER_FIBRE_URI = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAAAAADmVT4XAAAFOklEQVR42sVbq5LjMBDs//+QQ4cWBQWFGAUZBQUZBS0KuqstJ7E06nnJcm3DrbVmRhr1PDTBLHDbcN+wvHDvQbHkTYqbcf3AV0MspqKRctWB6Qfij7MFvs5EcJFg/4TQUlNofR/1AusOWApcBqGRWh5BfbblLndrMhFDt4MVvoXHis3H33rUSnRIrwUXQtcL9RIM6d9sD9LSuc3tnfrZAcsHu3ZelS0uaHUNdalnibwP2AARXEs8rTjncPpAUf+jALfz1OI8GC9FcIogspIN1UR8vRATvEtWhbdcMOmuyLgHlLIo0Lun8Q04m0eJaThytIGDBIc8druGKSYJ7b7t08U36HKyhAdSDUoFiGWDmMa0faNinmhNR6HJ/HAbhjmA9qtRCnRn6xix2rLhseH7g0eZdi11AgR1qWoxgm8B+7/LdeuMSLfhO49GnL97qCqR6gQWC/FizKmWIFhyuytuYWTfMXqpCdGAMjVfNR4LEnSFuB0ONiUURi5ttGrDHTSohhMS5z6lmSLvMhQGNcOy+VDRanVMz2GnUKtBQe6uvHADYl8bjO5VdSz4paaO6y4wjitJF5zC5qT0UPDlVOwUr3npgaBK84FYW8tKLuYYZEISbYTVn+t2VQvwW1D3Ceck4mlZzFXSCowG9CieNL4zg4TIYQIt2Xs/SMKH5ZeB2aKqRU0sM7CIbkbioneWCcStmm75uHqLat/czLJN19fi29EgFN8g/KmZcYZbbI3SiLZ8aMfpL0fdhjKaA1QBz7qvLPhmhHeAnrCZxNnVQXME8ZTqc79o6do+OMyhjA4a37f8yYrW5w/a6lQykBFh0AjaURybFXNFpUUwUhsBIyQ+/KYBAv+zUL2eFfgZqNjWg9/Q2BeBVMlvBfjuqa2Iro7VYvgx+E7WJxnujNQmKy5VSxQKiFuluZZ3sO3nTw1wulqPHPK3An7vKWaiI1RPyRbPTYexElcJTMJzL/4JcA9bj8B3vzAMDYgmbye0ScAlskeAJc1LhmAZ4flqqMPMlkAbiU35BiNaiht1gdlZyHeKrf+kWQGCpV+8+Il2r/l7gfVJ7+yS/T24IQNKY+0jyYSpiHPfX5rLKwuHKoRuAUXUfGCTW5IVbKpotiORnnDjJVVBZ76EKyeSJMmpGPtCqBYA+jVMNuioQ8kDynQukTVcpXxydJF1802q+APlqozXpEqsfkyXzLCPvoe2rxvmSfkKRB2ceLf/ZBDxgcyrYM9gifd+BH+Wc9eomKIJVeA6ycfPc8dkGR+EMmZKW7MjrbcUzBdUWD0yd+l8q6zRBPHZMCnV7A6ap6b3CS0Xf+vwkf2nQqkEt5UD8SatPBerI8mbksxUGP3BPc/3qnR/tnw/YnNU72tovJjuHqpw3u1SVNwtzfsnhPgy6BNGbBJreDzQEXrcw1a+xtiJVt0EjXCRf3VRFe2KmogSvErmSgwLvJ+sk9X5ae7dQ9WKAvXyRw0bt7PlztjvAXPOwgcuvwy4sxvHDNVupZlWTyUHakKSWYUJrZPGpGefsvUW4Fa5QBnb8CykxFeItUudsjDpnosOhV3/rMgvLPil5L/bMgKeMt4oORcmVTYMoWhBSpuLRojyJx4+W5/41G21C8pc6dkPNHCEy2d/W4GrNryrzwDgy9VAhAn/AV8JTVwDZOs7PVD01XdIJxXpX/nY3x/wM58pRdRwB4LmRFSwejPkvjQK8BX7yg5t0lDuCgZNlkd+sUxHhZHoaI0YuWyWC3ZKkz3zxJsTtP58zHq67ylVcLOn7XY5QKhZPfhg0z70H5O+nn0QxlonAAAAAElFTkSuQmCC";
