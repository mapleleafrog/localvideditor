# soranji-vfx — Code Map

## src/effects/
- `types.ts` — MotionDef, TransitionDef, MotionCtx (incl. `z` depth), Engine/Tier/Status unions, CatalogEntry, license/credit fields.
- `helpers.ts` — clamp, lerp, smooth, easeInOutCubic/easeOutCubic, springy, bounceOut, elasticOut, beatKick/beatIndex, bez, quantize, stepTime, seededRandom. Pure maths, no React.
- `catalog.ts` — full ~110-effect catalog as data; single source of truth for metadata. Every row `status:'todo'`.
- `depth.ts` — 2.5D toolkit: `depthShadow(z)`, `depthScale(z)`, `bevel()`, and the depth motion styles (dropShadowLift, bevelEmboss, parallaxDepth, floatShadow, tiltShadow, popLayer).
- `pixel.ts` — pixel-art motion styles (pixelBob, spriteBlink, paletteCycle, pixelShake, crtScanlines, stepWalk).
- `motions.ts` — `motions` registry: stubs from catalog + ~60 ready CSS implementations + merged depth/pixel families.
- `presentations.tsx` — custom CSS `TransitionPresentation` factories (dip/flash/lightLeak, zoom/whip/rgb look-alikes, clip/mask reveals, star wipe, pixel reveals). `cssPresentations` map.
- `transitions.ts` — `transitions` registry: stubs from catalog + 7 built-ins + 7 shipped shader presentations + the custom CSS presentations.
- `index.ts` — barrel + getMotion/getTransitionPresentation (safe fallback, never throw) + buildCreditsMarkdown + readyMotions/readyTransitions.

## src/components/
- `Layer.tsx` — generic positioned layer; the frame→ctx boundary. Mount-gates `[from, from+duration)`, computes progress/t/beat/z, composes `translate(-50%,-50%)` when `centered`, applies a motion by id. ALL frame reads happen here.
- `Mushroom.tsx` — sprite wrapper over Layer; `<Gif>` for animated GIFs (pixelated), `<Img>` fallback for PNGs. Default depth `z=0.4`.

## src/scenes/
- `SoranjiSample.tsx` — the fixed BPM demo: footage TransitionSeries (A→B, 180f total) + windowed sprite layers + beatFlash overlay. Layout/timing only.
- `MotionGallery.tsx` — walks every ready motion on a sprite, labeled. Exports `MOTION_GALLERY_FRAMES`.
- `TransitionGallery.tsx` — a TransitionSeries reel cycling clips through every preview-safe ready transition. Exports `TRANSITION_GALLERY_FRAMES`.

## src/
- `Root.tsx` — registers compositions SoranjiSample (180f), MotionGallery, TransitionGallery (all 1920×1080, 30fps). Imports `index.css`.
- `index.ts` — registerRoot(RemotionRoot).
- `index.css` — minimal reset + `.pixelated` helper (no UI framework).

## scripts/
- `gen-credits.mjs` — scans catalog.ts text, emits CREDITS.md from license/credit fields.

## public/
- orange-mush.gif, pixel-mush.gif — sprites. clip-a.svg (warm), clip-b.svg (cool) — placeholder footage.

## Adding / promoting an effect
1. Metadata already lives in `catalog.ts`. To implement: override the entry to `status:'ready'` with a `style()` (motions.ts / depth.ts / pixel.ts) or a `presentation()` (transitions.ts / presentations.tsx).
2. Reference it in a scene by id. No scene-level animation code.
3. If it carries a license/credit, run `npm run credits`.
4. Depth-aware motions read `ctx.z`; pixel-stepped motions use `quantize`/`stepTime` from helpers.
