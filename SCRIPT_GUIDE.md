# soranji-vfx — Code Map

## src/effects/
- `types.ts` — MotionDef, TransitionDef, MotionCtx (incl. `z` depth), Engine/Tier/Status unions, CatalogEntry, license/credit fields.
- `helpers.ts` — clamp, lerp, smooth, easeInOutCubic/easeOutCubic, springy, bounceOut, elasticOut, beatKick/beatIndex, bez, quantize, stepTime, seededRandom. Pure maths, no React.
- `catalog.ts` — full ~110-effect catalog as data; single source of truth for metadata. Every row `status:'todo'`.
- `depth.ts` — 2.5D toolkit: `depthShadow(z)`, `depthScale(z)`, `bevel()`, and the depth motion styles (dropShadowLift, bevelEmboss, parallaxDepth, floatShadow, tiltShadow, popLayer).
- `pixel.ts` — pixel-art motion styles (pixelBob, spriteBlink, paletteCycle, pixelShake, crtScanlines, stepWalk).
- `retro.ts` — advanced-retro / FX styles: sprite (neonGlow, chromaPulse, vhsJitter, glitchSlice, hologram, echoTrail, crtTurnOn, flameFlicker, rainbowCycle, powerUp, arcadeHop, wobbleVHS), full-frame backgrounds (synthGrid, starfield, crtRoom), overlay (vignette).
- `motions.ts` — `motions` registry: stubs from catalog + ~80 ready CSS implementations + merged depth/pixel/retro families.
- `presentations.tsx` — custom CSS `TransitionPresentation` factories (dip/flash/lightLeak, zoom/whip/rgb look-alikes, clip/mask reveals, star wipe, pixel reveals). `cssPresentations` map.
- `transitions.ts` — `transitions` registry: stubs from catalog + 7 built-ins + 7 shipped shader presentations + the custom CSS presentations.
- `index.ts` — barrel + getMotion/getTransitionPresentation (safe fallback, never throw) + buildCreditsMarkdown + readyMotions/readyTransitions.
- `compose.ts` — `composeStyles(styles[])`: the stacking engine (concat transform + filter, multiply opacity, last-wins). Used by Layer; mirrored in the portal's JS.

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

## public/
- orange-mush.gif, pixel-mush.gif — sprites. clip-a.svg (warm), clip-b.svg (cool) — placeholder footage.

## root (no-npm portal)
- `index.html` — self-contained synthwave playground (double-click, no npm). Inline JS mirrors `src/effects` (helpers, MOTIONS, TRANSITIONS) + a `composeStyles()` stacking engine; rAF-driven live preview. Tabs: MOTIONS (multi-select stacking), BACKDROP, TRANSITIONS. Sprite from `public/orange-mush.gif` (+ base64 fallback). Shader transitions are CSS approximations (⚡).
- `.claude/static-server.mjs` + `.claude/launch.json` — dev-only static server for previewing `index.html`.

## Adding / promoting an effect
1. Metadata already lives in `catalog.ts`. To implement: override the entry to `status:'ready'` with a `style()` (motions.ts / depth.ts / pixel.ts / retro.ts) or a `presentation()` (transitions.ts / presentations.tsx).
2. Reference it in a scene by id. No scene-level animation code.
3. If it carries a license/credit, run `npm run credits`.
4. Depth-aware motions read `ctx.z`; pixel-stepped motions use `quantize`/`stepTime` from helpers.
5. To expose it in the no-npm portal, port the same formula into `index.html`'s MOTIONS/TRANSITIONS object (it can't import the TS without a build).
