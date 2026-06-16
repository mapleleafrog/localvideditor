# Editing your video in Remotion Studio

`npm run dev` opens Studio. You build the video by editing the **`Timeline`** composition's **Props form** — no code required.

## 1. Pick the right composition
In the left **Compositions** list, click **`Timeline`**. That's the editable one.
- `SoranjiSample`, `MotionGallery`, `TransitionGallery` are fixed demos/showcases — they have no editable props (you'll just see the "add a schema" message on those, which is expected).

## 2. The Props panel (top-right) is your editor
With `Timeline` selected, the right **Props** tab shows a form generated from the project schema. This is where you edit everything. Three sections:

### `background`
- **type**: `motion` / `color` / `gradient` / `none`
- **motion**: dropdown — `synthGrid`, `starfield`, `crtRoom` (used when type = motion)
- **color** / **gradient**: used when type = color/gradient

### `clips` — the main track (plays in order)
Click **＋** to add a clip. Per clip:
- **type**: `image` or `video`
- **src**: a filename in `public/` (e.g. `clip-a.svg`) or `public/media/` (e.g. `media/photo1.jpg`)
- **durationInFrames**: how long it shows (**30 frames = 1 second** at 30fps)
- **motion**: dropdown of every effect (Ken Burns, slowZoomIn, panLR, …) applied over the clip — pick `none` for a still
- **transitionToNext**: dropdown — how it transitions into the next clip (crossfade, dreamyZoom, crtOn, …); `none` = hard cut
- **transitionDurationInFrames**: length of that transition
- **trimBefore / trimAfter / volume**: video only (trim in frames; `0` = no trim)

### `overlays` — things floating on top (titles, sprites)
Click **＋** to add. Per overlay:
- **type**: `text` or `image`
- **text** (text) or **src** (image — a file in `public/`/`public/media/`)
- **from**: start frame · **durationInFrames**: how long it stays
- **x / y**: position of its center, in % (50/50 = middle)
- **scale / rotation / opacity**
- **motions**: click **＋** to stack effects — each row is a dropdown; add several and they combine (e.g. `floatLoop` + `neonGlow`)
- text styling: **fontSize / color / glow**

> **Timings** are all in frames. The bottom **timeline strip** just *visualizes* your clips/overlays — you set the numbers in the Props form, the strip updates.

## 3. Add your own photos / clips
Drop files into **`public/media/`**, then reference them in a clip/overlay `src` as `media/<filename>` (e.g. `media/walk-in.mp4`). Restart isn't needed — Studio picks up `public/` files.

## 4. Save & render
- **Save** (top bar): writes your Props edits back into the code (`src/Root.tsx`) so they persist. (Works because the default props are inlined there.)
- **Render** (top-right) or `npm run render:timeline` → an MP4 in `out/`. You can also render a saved config: `npx remotion render Timeline out/video.mp4 --props=./projects/sample.json`.

## Gotchas
- **Clicking a `.gif` in the Assets tab shows `UnsupportedInputFormatError`.** That's just Studio's media *previewer* (it can't demux GIFs). It's harmless — the GIFs still animate in the video (they render via `@remotion/gif`). Just don't open GIFs in the Assets previewer.
- **Right-clicking the timeline / Assets** is for managing files, not for editing the comp — do your editing in the **Props** form.
- Want to *browse* the effects before picking? Scrub the **`MotionGallery`** composition (every motion, labeled), or open **`index.html`** (the no-npm portal) to play with combos.
- Effect/transition names in the dropdowns are the registry ids — full lists live in `src/effects/catalog.ts`.
