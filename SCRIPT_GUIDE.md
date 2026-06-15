# soranji-vfx — Code Map

## src/effects/
- `types.ts` — MotionDef, TransitionDef, MotionCtx (incl. `z` depth), Engine/Tier/Status unions, CatalogEntry, license/credit fields.
- `helpers.ts` — clamp, lerp, smooth, easeInOutCubic/easeOutCubic, springy, bounceOut, elasticOut, beatKick/beatIndex, bez, quantize, stepTime, seededRandom. Pure maths, no React.
- `portable.ts` — **the single source** of all 80 ready motion formulas (`MOTION_FORMULAS`), the depth math (`depthShadow`/`depthScale`/`bevel`), `composeStyles`, and `MOTION_META` (from catalog). Framework-neutral (no React/Remotion value imports). Consumed by the render side (family files) AND, via the esbuild bundle, by the portal — so a formula is written once.
- `catalog.ts` — full ~110-effect catalog as data; single source of truth for metadata. Every row `status:'todo'`.
- `depth.ts` / `pixel.ts` / `retro.ts` — thin catalog-wiring: each builds its `*Styles` record by picking its family's ids from `portable.ts`'s `MOTION_FORMULAS` (formula bodies no longer live here). `depth.ts` also re-exports the depth math from portable.
- `motions.ts` — `motions` registry: stubs from catalog, then wires each of the ~80 ready ids to its `portable.ts` formula (+ defaults) and merges the depth/pixel/retro families.
- `presentations.tsx` — custom CSS `TransitionPresentation` factories (dip/flash/lightLeak, zoom/whip/rgb look-alikes, clip/mask reveals, star wipe, pixel reveals). `cssPresentations` map.
- `transitions.ts` — `transitions` registry: stubs from catalog + 7 built-ins + 7 shipped shader presentations + the custom CSS presentations.
- `index.ts` — barrel + getMotion/getTransitionPresentation (safe fallback, never throw) + buildCreditsMarkdown + readyMotions/readyTransitions.
- `compose.ts` — re-exports `composeStyles` from `portable.ts` with a `CSSProperties`-typed alias (keeps `Layer.tsx`'s import stable).

## src/components/
- `Layer.tsx` — generic positioned layer; the frame→ctx boundary. Mount-gates `[from, from+duration)`, computes progress/t/beat/z, applies a single `motionId` OR a stacked `motionIds[]` (via composeStyles), folds in `scale`/`rotation` + `translate(-50%,-50%)` when `centered`. ALL frame reads happen here.
- `Mushroom.tsx` — sprite wrapper over Layer; `<Gif>` for animated GIFs (pixelated), `<Img>` fallback for PNGs. Default depth `z=0.4`.

## src/scenes/
- `SoranjiSample.tsx` — the fixed BPM demo: footage TransitionSeries (A→B, 180f total) + windowed sprite layers + beatFlash overlay. Layout/timing only.
- `MotionGallery.tsx` — walks every ready motion on a sprite, labeled. Exports `MOTION_GALLERY_FRAMES`.
- `TransitionGallery.tsx` — a TransitionSeries reel cycling clips through every preview-safe ready transition. Exports `TRANSITION_GALLERY_FRAMES`.

## src/timeline/ (the video builder)
- `schema.ts` — Zod `projectSchema` (clip track + positioned overlays + background) + `Project`/`Clip`/`Overlay` types + `SAMPLE_PROJECT`. Effect ids are plain strings resolved against `src/effects`. Sample configs live in `projects/*.json`; drop media in `public/media/` and reference as `media/<file>`.
- `Timeline.tsx` — generic config-driven composition: `ClipTrack` (TransitionSeries of image/video clips + transitions), `OverlayLayer` (stacked `motions[]` via the extended Layer), `BackgroundLayer`, and `calculateTimelineMetadata` (duration from the config).

## src/
- `Root.tsx` — registers Timeline (config-driven, schema + `SAMPLE_PROJECT`), SoranjiSample (180f), MotionGallery, TransitionGallery. Imports `index.css`.
- `index.ts` — registerRoot(RemotionRoot).
- `index.css` — minimal reset + `.pixelated` helper (no UI framework).

## scripts/
- `gen-credits.mjs` — scans catalog.ts text, emits CREDITS.md from license/credit fields.
- `gen-portal.mjs` — esbuild-bundles `src/effects/portable.ts` → `public/portal/effects.bundle.js` (browser IIFE `window.SoranjiEffects`). `--check` (`npm run check:portal`) fails if the committed bundle is stale. `gen-portal.bat` / `check-portal.bat` are double-clickable runners. Runs automatically via `predev` / `prerender:timeline`.

## public/
- orange-mush.gif, pixel-mush.gif — sprites. clip-a.svg (warm), clip-b.svg (cool) — placeholder footage.

## root (no-npm portal)
- `index.html` — self-contained synthwave playground (double-click, no npm). Loads `public/portal/effects.bundle.js` (generated from `portable.ts`) and drives its MOTIONS tab + stacking from `window.SoranjiEffects` — it declares ZERO motion formulas of its own. The TRANSITIONS tab keeps its own CSS approximations (⚡) inline. rAF-driven live preview; tabs: MOTIONS (multi-select stacking), BACKDROP, TRANSITIONS. Sprite from `public/orange-mush.gif` (+ base64 fallback).
- `public/portal/effects.bundle.js` — generated bundle (committed). Run `npm run gen:portal` after editing a formula; `npm run check:portal` guards against drift.
- `.claude/static-server.mjs` + `.claude/launch.json` — dev-only static server for previewing `index.html`.

## Adding / promoting a motion
1. Add the formula to `MOTION_FORMULAS` in `src/effects/portable.ts` (a `(ctx) => StyleObject` function), and add/flip its `catalog.ts` row to the right category. Wire the id in the relevant family file (motions.ts for core; depth.ts / pixel.ts / retro.ts for those families).
2. Run `npm run gen:portal` (or double-click `gen-portal.bat`). The no-npm portal picks it up automatically from the regenerated bundle — **no hand-mirroring**. `npm run check:portal` fails in CI/locally if you forget.
3. Reference it in a scene/timeline by id. No scene-level animation code. Depth-aware motions read `ctx.z`; pixel-stepped motions use `quantize`/`stepTime`.
4. If it carries a license/credit, run `npm run credits`.

## Adding a transition
Transitions are out of the single-source scope (render side ≠ portal CSS approximation). Add a `presentation()` in `transitions.ts` / `presentations.tsx` for the render, and — if you want it previewable in the portal — its CSS approximation in `index.html`'s TRANSITIONS object.
