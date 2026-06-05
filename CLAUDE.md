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
- ~60 motions implemented (Ken Burns/zoom, pan, path, physics, CSS pseudo-3D, CSS camera analogs, loop/idle, beat-reactive, **depth/2.5D**, **pixel-art**). `todo` stubs: cardStack, photoFloat3D, revolve3D, bassWarp (need Three.js / real audio).
- ~36 transitions implemented: 7 built-ins (fade/slide/wipe/flip/clockWipe/iris), ~22 custom CSS presentations, and 7 shipped HTML-in-canvas shader presentations (filmBurn, bookFlip, crossWarp, crossZoom, linearBlur, ripple, filmDissolve). Remaining GLSL-only warps/glitch/particle/3D effects are typed `todo` and safe-fallback to `fade`.

## Shader transitions caveat
The 7 shader presentations are `engine:"webgl"` (HTML-in-canvas). They **render correctly** via `npx remotion render` / Lambda, but their **Studio preview** needs Chrome 149+ with `chrome://flags/#canvas-draw-element` enabled. They are excluded from the preview-safe `TransitionGallery`. Everything else previews with no flags.

## Compositions
- `SoranjiSample` — the fixed 180-frame BPM demo (footage A→B + windowed sprites + beat flash).
- `MotionGallery` — every ready motion on a sprite, labeled (QA surface).
- `TransitionGallery` — a reel cycling clips through every preview-safe ready transition.

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
