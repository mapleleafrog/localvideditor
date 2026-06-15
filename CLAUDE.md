# soranji-vfx — Project Context

## What this is
A Remotion (React → MP4) VFX pipeline for a wedding walk-in video set to "Soranji" (~120 BPM). HTML/CSS-authored animation, rendered frame-accurate to MP4. Output: 1920×1080, 30fps. Scaffolded directly into this folder (the project root holds `package.json`; the source specs live in `specs/`).

## Creative direction (locked)
2D animation that reads as having depth via **shadows, bevel, and z-mapping/parallax** — NOT real 3D. **Pixel-art** is a featured aesthetic (MapleStory-style sprites, stepped/quantized motion, CRT/scanline looks). True-3D effects (Three.js: card stack, turntable, 2.5D depth-map) are intentionally left as typed `todo` stubs.

## Stack (pinned, identical versions — no `^`)
- remotion + @remotion/cli + @remotion/transitions + @remotion/media-utils + @remotion/paths + @remotion/shapes + @remotion/gif — all **4.0.472**
- React 19, TypeScript. No UI/state libraries (Tailwind was stripped from the scaffold).
- `@remotion/media-utils` is installed for future audio-reactive work; NOT wired yet (beat is frame-derived).

## Architecture
- `src/effects/` is a data-driven registry grouped by category.
  - `catalog.ts` — the full ~110-effect catalog as metadata (the single source of truth). Every row starts `status:'todo'`.
  - `motions.ts` — single-layer animations; imports the catalog, overrides the implemented ids to `status:'ready'` with a `style(ctx) => CSSProperties`. Merges in the depth + pixel families.
  - `transitions.ts` — footage A→B; built-in presentations + custom CSS presentations + shipped shader presentations, the rest `todo`.
  - `depth.ts` — the 2.5D toolkit: `depthShadow(z)`, `depthScale(z)`, `bevel()` + depth motions.
  - `pixel.ts` — pixel-art motions (quantized/stepped).
  - `presentations.tsx` — custom CSS `TransitionPresentation` components (dip, flash, masks, zoom look-alikes, pixel reveals).
  - `index.ts` — `getMotion(id)` / `getTransitionPresentation(id, params)` (always safe-fallback, never throw) + `buildCreditsMarkdown()` + `readyMotions()` / `readyTransitions()`.
- Effects carry `tier` (Core/Ext/Adv), `engine` (css/canvas/webgl/three/either), `status` (ready/todo), `tags`, and `license`/`credit`.
- `Layer.tsx` is the single frame→ctx boundary: reads `useCurrentFrame()`/`useVideoConfig()`, computes `progress`/`t`/`beat`/`z`, mount-gates the layer, composes centering, and applies the motion's CSS.
- `Mushroom.tsx` renders animated GIF sprites via `@remotion/gif`'s `<Gif>` with crisp `pixelated` scaling.

## Conventions (non-negotiable)
- Frame-driven only. No @keyframes, setInterval, rAF, GSAP ticker, or R3F useFrame.
- Time-window layers by mount-gating in `Layer` (return null outside range). Do NOT wrap beat-reactive layers in a frame-rebasing `<Sequence>` — it desyncs the beat.
- `t` is ABSOLUTE composition seconds so loops + beat stay on the song grid.
- All assets via `staticFile()`. No remote URLs in components.
- BPM via `helpers.ts#beatKick` only. v1 derives beat from frame count; no audio analysis yet.
- New effects = catalog entry + (if ready) an implementation override. Scenes reference effects by id.
- Composition length must equal footage content (transitions overlap; total = ΣsequenceDurations − Σtransitions).

## Coverage this build
- ~80 motions implemented (Ken Burns/zoom, pan, path, physics, CSS pseudo-3D, CSS camera analogs, loop/idle, beat-reactive, **depth/2.5D** `depth.ts`, **pixel-art** `pixel.ts`, **Retro / FX** + **Backgrounds** `retro.ts` — neon, chroma, VHS, glitch, hologram, echo, CRT, flame, rainbow, power-up, synthwave grid, starfield, vignette). `todo` stubs: cardStack, photoFloat3D, revolve3D, bassWarp (need Three.js / real audio).
- ~41 transitions implemented: 7 built-ins (fade/slide/wipe/flip/clockWipe/iris), ~22 custom CSS presentations, 5 retro CSS transitions (crtOn, glitchCut, pixelDither, scanlineWipe, vhsRewind), and 7 shipped HTML-in-canvas shader presentations (filmBurn, bookFlip, crossWarp, crossZoom, linearBlur, ripple, filmDissolve). Remaining GLSL-only warps/glitch/particle/3D effects are typed `todo` and safe-fallback to `fade`.

## Shader transitions caveat
The 7 shader presentations are `engine:"webgl"` (HTML-in-canvas). They **render correctly** via `npx remotion render` / Lambda, but their **Studio preview** needs Chrome 149+ with `chrome://flags/#canvas-draw-element` enabled. They are excluded from the preview-safe `TransitionGallery`. Everything else previews with no flags.

## Compositions
- `Timeline` — the **generic, config-driven video composition** (the real video builder — see "Make a video").
- `SoranjiSample` — the fixed 180-frame BPM demo (footage A→B + windowed sprites + beat flash).
- `MotionGallery` — every ready motion on a sprite, labeled (QA surface).
- `TransitionGallery` — a reel cycling clips through every preview-safe ready transition.

## Make a video (Timeline)
The `Timeline` composition renders ANY video from a `project` config (Zod-schema'd props): a **clip track** (image/video clips joined by transitions) + positioned **overlays** (text/image with stacked effects) + a **background**. Effect ids resolve against `src/effects`, so new effects work immediately — one registry, exact preview, render-grade. Files: `src/timeline/schema.ts` (`projectSchema`, `SAMPLE_PROJECT`), `src/timeline/Timeline.tsx`; sample configs in `projects/`.
- **Edit:** `npm run dev` → Studio opens `Timeline` with a live props form + scrubber (or hand-edit a `projects/*.json`). Drop photos/clips in `public/media/`, reference as `media/<file>`.
- **Render:** `npm run render:timeline` (sample) or `npx remotion render Timeline out/video.mp4 --props=./projects/your.json`.
- Duration is computed from the config (`calculateTimelineMetadata`: Σclips − Σtransitions, covering overlays). Overlays take `motions: string[]`, composed via `composeStyles` (`src/effects/compose.ts`).
- Stage 2 (next): a `@remotion/player` drag-drop visual editor on the same schema + `<Audio>` soundtrack with real beat-sync.

## No-npm Retro Portal (`index.html`)
A self-contained synthwave/arcade playground at the project root — **double-click to open, no npm, no server**. It is a live preview/composer (CSS driven by `requestAnimationFrame`), NOT the render pipeline. **The portal's motion effects + `composeStyles` are SINGLE-SOURCED**: it loads `public/portal/effects.bundle.js` (generated from `src/effects/portable.ts` by `npm run gen:portal`) and drives its MOTIONS tab + stacking from `window.SoranjiEffects` — it declares zero motion formulas of its own, so a formula added to `portable.ts` shows up here and in the render with no hand-mirroring. `npm run check:portal` (or `check-portal.bat`) guards against a stale bundle, and `predev`/`prerender:timeline` regenerate it automatically. Stack multiple motions at once (transforms + filters concatenated, opacity multiplied). Tabs: MOTIONS (multi-select stacking), BACKDROP (synthGrid/starfield/CRT), TRANSITIONS (A↔B loop + "play all"). Sprite loads from `public/orange-mush.gif` (sibling), with an inlined base64 fallback. The TRANSITIONS tab keeps its own CSS approximations (⚡) inline (transitions are out of the single-source scope). (`.claude/launch.json` + `.claude/static-server.mjs` are a dev-only static server for previewing it.)

## Sprites
- Orange mushroom: maplestory.io mob 100004 (`public/orange-mush.gif`)
- Pixel mushroom: maplestory.io mob 9833390 (`public/pixel-mush.gif`)
- Replace with final wedding footage/sprites for production.

## Commands
- `npm run dev` — Remotion Studio
- `npm run build` / `npx remotion bundle` — bundle; `npm run typecheck` (`tsc`) for types
- `npm run render` — export SoranjiSample to `out/soranji-sample.mp4`
- `npm run credits` — regenerate CREDITS.md

## Stage roadmap
- Stage 2 (shader pipeline): wrap `makeHtmlInCanvasPresentation()` to ingest more gl-transitions GLSL. Remotion shader time is REVERSED vs gl-transitions — add `float progress = 1.0 - u_time;`. Keep license notices; run `npm run credits`.
- Stage 3: `@remotion/three` for the `todo` true-3D motions; wire `@remotion/media-utils` (`useAudioData`/`visualizeAudio`) for real audio-reactive beat.
