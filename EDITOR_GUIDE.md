# Soranji Studio — the drag-and-drop video editor

A real timeline video editor (Canva/CapCut-style) built on **`@remotion/player`**, living in `editor/`. The
live preview is the **exact same `Timeline` composition** that renders to MP4 — what you see is what you get.
It is registry-driven: any motion/transition you add to `src/effects` shows up here automatically, no editor
edits required.

> This is separate from **Remotion Studio** (`npm run dev`), which is a prop *form* on the same composition.
> Both edit the same `projects/*.json` schema and render with the same engine.

## Launch

```bash
npm run editor          # Vite dev server on http://localhost:5173 (opens automatically)
```

The dev server also exposes the in-app render + persistence endpoints (`/api/render`, `/api/save-project`,
`/api/media`) — see [render-plugin.ts](editor/render-plugin.ts).

## Layout

```
┌────────────────────────── Topbar ──────────────────────────┐
│ undo/redo · Save · Export · Import · Reset · ⏺ Render MP4    │
├──────────┬────────────────────────────────┬─────────────────┤
│ Library  │          Preview (Player)       │   Inspector     │
│ Effects  │   exact composition + on-canvas │  props of the   │
│ Transit. │   drag / scale / rotate handles │  selected item  │
│ Assets   │                                 │                 │
├──────────┴────────────────────────────────┴─────────────────┤
│  Timeline: clip track + one lane per overlay + playhead      │
└──────────────────────────────────────────────────────────────┘
```

- **Library** (left) — registry-driven. **Effects** (grouped by category) and **Transitions** read
  `readyMotions()` / `readyTransitions()`. **Assets** lists `public/` + `public/media/` files (`/api/media`).
  Click an item to apply it to the current selection.
- **Preview** (center) — the `<Player>` in an exact composition-aspect box. Click an element to select it;
  drag the body to move, corner handles to scale (uniform, around center), the top handle to rotate.
- **Inspector** (right) — every prop of the selected clip/overlay with friendly controls: timing, transform
  sliders (X/Y/scale/rotation/opacity/depth-z), text/color/glow/source, a motion **multi-select** (stack
  effects, removable chips), and a transition picker.
- **Timeline** (bottom) — clip track (sequential, with transition markers) + one lane per overlay. Drag a
  block to retime (`from`), drag its edges to resize (`durationInFrames`), drag the ruler to scrub. The
  per-lane ▲/▼ buttons reorder overlays = **compositing z-order**.

## Common workflows

| Goal | How |
|---|---|
| Add a photo/clip | **+ Clip** (timeline) or click an **Assets** item; set `src` in the Inspector (e.g. `media/photo.jpg`) |
| Add a title | **+ Text**, then edit text/font/color/glow in the Inspector |
| Add full-frame atmosphere | **+ FX** → a full-frame layer; stack Wedding motions (petals, bokeh, light-leaks) or scanlines on it. Renders on top of the clips and alpha-exports for compositing. |
| Retime an element | Drag its timeline block; drag edges to change duration |
| Move/scale/rotate on screen | Select it → drag / corner-handle / rotate-handle on the canvas |
| Stack effects | Select an overlay → click effects in the Library (or the Inspector "+ add effect") |
| Set a transition | Select a clip → pick one in the Library Transitions tab (or Inspector) |
| Layer order (z) | ▲/▼ on the overlay's timeline lane |
| Play / pause | Spacebar, or the ▶/⏸ button |
| Render the video | Pick a format (MP4 / ProRes-alpha / overlays-only) then **⏺ Render** (top right) → writes to `out/` with a live progress bar |
| Save the project | **💾 Save** → `projects/<name>.json` (round-trips with Studio + the CLI) |
| Back up / share | **⭳ Export** (download JSON) / **⭱ Import** (load JSON) |
| Start over | **⟲ Reset** (reloads the sample, clears autosave) |

The project **autosaves to `localStorage`** as you work and is restored on reload.

## Keyboard shortcuts

| Key | Action |
|---|---|
| `Space` | Play / pause |
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Shift + Z` / `Ctrl + Y` | Redo |
| `Delete` / `Backspace` | Delete the selected clip/overlay |

(Shortcuts are suppressed while typing in a field.)

## Rendering

**⏺ Render MP4** POSTs the current project to `/api/render`, which runs the same
`@remotion/bundler` + `@remotion/renderer` pipeline the CLI uses (`bundle` → `selectComposition` →
`renderMedia`) and writes `out/timeline-<timestamp>.mp4`. The result is identical to:

```bash
npx remotion render Timeline out/video.mp4 --props=./projects/your.json
```

Pick the output with the format dropdown next to the button:

| Mode | Output | Use |
|---|---|---|
| **Full video · MP4** | `out/timeline-video-<ts>.mp4` (H.264) | A finished, shareable cut |
| **Full video · ProRes (alpha)** | `out/timeline-alpha-<ts>.mov` | Whole comp on transparency (ProRes 4444, `yuva444p10le`) |
| **Overlays only · ProRes (alpha)** | `out/timeline-overlays-<ts>.mov` | **Just the animated overlays/VFX/titles** on alpha — layer over real footage in DaVinci/Premiere |

The alpha modes set `background: none` (and overlays-only also empties the clip track), then render
ProRes 4444 with PNG frames so the file carries a real alpha channel. **DaVinci workflow:** export
*Overlays only · ProRes*, layer the `.mov` over your footage, then cut to the beat / grade / mix in
the NLE — Remotion makes the elements, DaVinci makes the cut.

The composition is bundled once per dev session and reused; restart `npm run editor` after changing
composition/effect code to pick it up.

## Why it scales

Every picker reads the live effect registry (`src/effects` via [effects-bridge.ts](editor/src/lib/effects-bridge.ts)).
Add a motion to `portable.ts` + `catalog.ts` (and `npm run gen:portal`) and it appears in the editor, the
Studio form, the no-npm portal, **and** the render — with zero editor changes.

## Architecture (where things live)

```
editor/
  vite.config.ts        root=editor, publicDir=../public (staticFile), dedupe React, render-api plugin
  render-plugin.ts      /api/render (bundle+renderMedia, streamed) · /api/save-project · /api/media
  src/
    App.tsx             layout + global keyboard shortcuts
    store.ts            zustand + zundo (undo/redo) + localStorage autosave; seeded from projects/sample.json
    components/
      Topbar.tsx        render (streamed progress) · save/export/import/reset · undo/redo
      Preview.tsx       <Player component={Timeline}> in an exact-aspect box + CanvasOverlay
      CanvasOverlay.tsx react-moveable drag/scale/rotate + click-to-select, mapped to composition coords
      TimelinePanel.tsx ruler/scrub + clip track + overlay lanes (drag/resize) + lane reorder + play/pause
      Inspector.tsx     per-item prop editor incl. effect multi-select + transition picker
      Library.tsx       registry-driven Effects / Transitions / Assets browsers
    lib/
      effects-bridge.ts single import surface for the effect registry (auto-updating pickers)
      coords.ts         screen px <-> composition %/scale mapping
      timeline-utils.ts duration + clip start positions (mirrors calculateTimelineMetadata)
      api.ts            client for the dev-server render/save/media endpoints
```

Reuses, unchanged: `src/timeline/Timeline.tsx` (+ `calculateTimelineMetadata`), `src/timeline/schema.ts`,
`src/components/Layer.tsx`, the whole `src/effects` registry.

## Not yet built (Phase 2)

Multi-track grouping & marquee multi-select; keyframeable transforms; an `<Audio>` soundtrack with real
beat-sync (`@remotion/media-utils`); asset upload UI. The registry-driven design means new VFX/transitions
need **no** editor changes.
