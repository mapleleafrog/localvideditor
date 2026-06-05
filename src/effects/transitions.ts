import type { TransitionDef } from "./types";
import { CATALOG } from "./catalog";
// Built-in presentations (verified import paths in 4.0.472).
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { flip } from "@remotion/transitions/flip";
import { clockWipe } from "@remotion/transitions/clock-wipe";
import { iris } from "@remotion/transitions/iris";
// Shipped HTML-in-canvas shader presentations. These render correctly via
// `remotion render` / Lambda everywhere, but their STUDIO PREVIEW needs
// Chrome 149+ with chrome://flags/#canvas-draw-element enabled. They are
// engine:"webgl" in the catalog and excluded from the preview-safe gallery.
import { filmBurn } from "@remotion/transitions/film-burn";
import { bookFlip } from "@remotion/transitions/book-flip";
import { crosswarp } from "@remotion/transitions/crosswarp";
import { crossZoom } from "@remotion/transitions/cross-zoom";
import { linearBlur } from "@remotion/transitions/linear-blur";
import { ripple } from "@remotion/transitions/ripple";
import { dissolve } from "@remotion/transitions/dissolve";
import { cssPresentations } from "./presentations";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dir = any;

// 1. Stub every transition row from the catalog (status stays 'todo').
const transitions: Record<string, TransitionDef> = {};
for (const e of CATALOG) if (e.kind === "transition") transitions[e.id] = { ...e };

// 2. Override implemented ids with status:'ready' + a presentation factory.
const ready = (id: string, presentation: NonNullable<TransitionDef["presentation"]>) => {
  if (!transitions[id]) throw new Error(`Transition "${id}" is implemented but missing from CATALOG`);
  transitions[id] = { ...transitions[id], status: "ready", presentation };
};

// --- Built-ins ---
ready("crossfade", () => fade());
ready("slidePush", (p) => slide({ direction: (p?.direction as Dir) ?? "from-right" }));
ready("slideOver", (p) => slide({ direction: (p?.direction as Dir) ?? "from-bottom" }));
ready("linearWipe", (p) => wipe({ direction: (p?.direction as Dir) ?? "from-left" }));
ready("clockWipe", (p) => clockWipe({ width: (p?.width as number) ?? 1920, height: (p?.height as number) ?? 1080 }));
ready("irisCircle", (p) => iris({ width: (p?.width as number) ?? 1920, height: (p?.height as number) ?? 1080 }));
ready("flip3D", (p) => flip({ direction: (p?.direction as Dir) ?? "from-left" }));

// --- Shipped shader presentations (engine:"webgl"; preview needs Chrome flag) ---
ready("filmBurn", () => filmBurn({}));
ready("bookFlip", () => bookFlip({}));
ready("crossWarp", () => crosswarp({}));
ready("crossZoom", () => crossZoom({}));
ready("linearBlur", () => linearBlur({}));
ready("ripple", () => ripple({}));
ready("filmDissolve", () => dissolve({}));

// --- Custom CSS presentations (all preview-safe, no flags) ---
for (const [id, factory] of Object.entries(cssPresentations)) {
  ready(id, (p) => factory(p ?? {}));
}

export { transitions };
