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
│ Edit | Storyboard | Wall · undo/redo · ⌨ · Save · Export · ⏺ Render │
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
  block to retime (`from`), drag its edges to resize (`durationInFrames`) — edges **snap** to the playhead /
  clip boundaries (🧲 toggle). Drag the ruler **or click any empty lane** to scrub; the per-lane ▲/▼ buttons
  reorder overlays = **compositing z-order**. Toolbar adds **✂ Split** / **⎘ Duplicate**, a snap toggle, a
  live current/total time readout, and **⤢ Fit** (`Ctrl`+wheel zooms at the cursor). New text/image/FX
  layers are added **at the playhead**.

## Storyboard tab

Toggle **Edit | Storyboard** in the top bar. The Storyboard is a **card board of your clips** — each card
*is* a clip on the timeline, so it's a planning surface that becomes the actual video. Per card: the footage
thumbnail (image / video first-frame, or a dashed placeholder for shots not filmed yet), an editable
**duration**, a **Label**, a **Notes** textarea, and the clip **source**. Drag the picture to reorder (or use
◀ ▶), set the **→ next** transition between shots, **+ Add shot** to append, **×** to delete, and click a card
to select that clip (it carries into the Edit tab). Changes here are the same data as the Edit timeline —
arrange + annotate your shots in Storyboard, then switch to Edit to layer effects/titles/transitions and render.
(Overlays/titles/fx are edited in the Edit tab, not shown as storyboard cards.)

## Wall mode

Toggle **Edit | Storyboard | Wall** in the top bar (the button reads **+ Create a wall clip** until the
project has one), or press **＋ New wall** to start a *separate* project that is only a wall (its own
`projects/<name>.json` + media folder — compose the wall on its own, render it with **Wall only**, and cut it into
the wedding timeline later). A **wall clip** (`clip.type: "wall"`) is a free-growing collage wall: photos, props and
hand-font text pinned anywhere on unbounded paper, walked by a **keyframed camera**. Everything on the wall is
there for the whole clip by default — the movement *is* the camera, timed in seconds (holds + glides), not beats.
Think PowerPoint + Morph: each scene is a slide, the glide between them is the morph, and any object can be told
to **appear in** a scene with an entrance (and **leave after** one with an exit).

**The viewport is the renderer.** The centre panel mounts a real `<Player component={Timeline}>` on a derived
project whose wall carries one synthetic scene at your authoring camera — so the pixels under the drag handles
are produced by the shipping renderer. **Overscan** (`1× / 1.6× / 2.5×`) lets you see the wall around the shot;
it enlarges the Player's *composition size*, never the camera zoom, so the recorded frame is exactly the bright
centred rectangle and every zoom-dependent look (paper fibre, shadow lift) is identical to the MP4.

| Panel | What it is |
|---|---|
| Left rail | The usual **Library**, opened on **Assets** (a tile click adds a *wall item* at the frame centre; the Effects tab still stacks motions on the selected item). |
| Centre | Nav bar (**⤢ Fit all** · **⤡ Fit selection** · hand · overscan · **⟳ Motion** · **▶ Live** · wall-clip picker · **+ Photos…** · live camera readout), the Player, the gesture/handle overlay, and the always-on **minimap** (items by depth, numbered scene frusta, the real glide paths). Roll / 1:1 live under **Wall settings** (Alt-drag and `1` still work). |
| Right rail | **Wall inspector** — **Scene N** (when a card is selected: hold + glide-in **seconds**, easing, arc, speed chip, re-frame / play / duplicate / delete), then for the selected item **Photo** (source, width, rotation, opacity, frame, caption, filter), **Appear** (appears in scene · delay · entrance · leaves after scene · exit), **Effects** (stacked motions — they run from the appear frame), **Advanced** (aspect, position, depth, mirror, pixelated, paint order), and **Wall settings** (camera globals, paper, fibre, finish, viewfinder, hand font). |
| Footer | **Scenes strip** — a slide sorter: one card per scene (thumb · name · an inline **hold** seconds box · `+N` objects appearing), with an **arrow connector between cards holding the glide seconds** into the next scene and its speed dot (click the dot to apply the suggested duration). The strip toolbar's **defaults: hold · glide** boxes are wall-wide: every new scene takes them, and **Apply to all**
rewrites every existing scene's hold and glide in one undo step. **⟳ Re-frame N** next to it overwrites the selected scene's framing with the current viewport (timing kept; `Shift+Enter`). **▶ Preview all** plays the whole schedule in Live mode — and Live shows *just the wall* (the wall clip alone, with the song), never the surrounding footage or overlays; intro/outro are off by default on a new wall (tick them in the strip toolbar if you want the pull-out). **Click a card to select it** and jump the camera; drag to reorder. |

**The loop.** ① Pan/zoom/roll until the recorded frame holds what you want. ② Drop photos (OS drag, **+ Photos…**,
or an Assets tile) and arrange them — drag, corner-scale, rotate, `Shift`-marquee for a group, align/distribute.
③ **⊕ Set as scene** (or `Enter`) appends a camera keyframe with a glide duration a motion designer would sign
off. ④ Pan to the next area and repeat. ⑤ **⟲ Fit clip duration** makes the clip exactly as long as the schedule.

Click a scene card and the inspector's **Scene N** section shows its **Hold** and **Glide in** in seconds, the
easing, the arc, and a **colour-banded px/frame speed chip** — *"● 35 px/f → 1.8s"*, click to apply the suggested
glide. **⟳ Re-frame** updates the pose from the viewport *keeping the timing*, **▸ Play** plays that scene in Live
mode, **⧉** duplicates, **×** deletes (objects that appeared there go back to always-on). **‹ N / M ›** on the
strip toolbar (or `PgUp`/`PgDn`) steps to the previous / next scene — selects it, jumps the camera, and scrolls
the strip so its card is in view, which matters once the strip is wider than the window. **▶ Live in the nav bar
starts at the selected scene** and plays to the end (its label reads `▶ Live from N`); the strip's **▶ Preview
all** always plays from the top; the Scene panel's **▸ Play** plays just that one scene.

**Seamless flow.** Tick **flow** in the strip toolbar and the camera never stops: each hold drifts at a steady pace
(hover amount = how fast) and every glide is re-shaped to depart at the previous hold's drift speed and land at the
next one's — fast in the middle, decelerating straight into the slow drift, no stop at either end. The wall-wide **land %**
box in the `defaults:` group (greyed until flow is on, default 35 %) is the share of every glide spent slowing from travel
pace into the next scene's drift *before* the scene point: the fast part ends early and the camera eases the rest of the way
in slowly. Raise it to settle earlier (but the same distance in less time makes the fast part *faster*). **Negative land is a
lead**: the glide lands that share of the hop *short* of the scene point and the hold's slow drift carries the camera the rest
of the way through it — the fast part covers less distance in the same time, so it is *slower*, and the authored framing is
passed mid-drift instead of being the start of the drift. Try −20 % to −30 % for a lazier, more continuous feel. **Neither
sign changes the scene cycle** (hold + glide stays what you typed) — they only move where the arrival *reads*: positive
settles early (the dwell feels longer), negative arrives late (the scene point comes part-way through the hold). If you cut
scenes to the beat, keep the cycle and place the beat where the framing lands. Land overrides the glide easings (a still hold
still meets its glide at zero). In flow the hold's drift is a gentle **bend**, not a straight line: it lands heading the way
the glide came in and leaves heading the way the next glide goes, so a 90° turn between scenes reads as one continuous
curve through the scene (it cuts the corner slightly) instead of a sideways kink at the landing; the zoom likewise keeps
changing at one steady rate through the landing rather than stopping early and restarting. This is the "fast arrive, slow
glide across, fast leave" profile; off is the classic stop-and-go.

**The "never quite stops" feel.** Three layers, all in seconds: (1) **Hover** — in the Scene section, a slow eased
drift across the hold (**creep toward the next scene** — the default on new scenes, it anticipates the glide — or push
in / pull out / drift left·right·up·down, + amount), (2) the **glide** between scenes (the arrow box on the strip; 1 s by default, `smooth` easing ramps up and
lands with zero velocity and zero acceleration, `gentle` lingers even longer at both ends; easing + arc live in the Scene
section — arc bows the travel path sideways, 0 is a straight line), — **click the arrow between two cards** to open the destination scene's "→ Transition into this scene" group —
and (3) **Breathing** under
Wall settings — the random handheld tremor on top of everything, shown in Live only. Hover and breathing are separate
on purpose: hover is a deliberate move you author per scene, breathing is texture.

**Appear (PowerPoint-style object timing).** Select a photo or prop → **Appear**. *Appears in scene* hides it until
the camera arrives at that scene, then plays the **Entrance** (fade / slide / zoom / pop / rotate / spin / blur /
flash / wipe / iris / typewriter, in seconds, with an easing) — add a *Delay* to stagger a cluster. *Leaves after
scene* hides it once that scene's hold ends, with an **Exit**. Stacked **Effects** (springPop, bounceIn,
monogramBlurReveal…) also start when the object appears, so the whole motion library doubles as an entrance
library. Unset = always on the wall (the reference-video look). While a scene card is selected, objects that are
not on the wall during it show a hatched outline in the viewport.

**Camera navigation is not undoable** (pan/zoom/roll is transient); item edits and scene keyframes are.

**Soundtrack.** The inspector's **Soundtrack** section (Wall view) has **🎵 Add soundtrack…** — it imports the file
and adds a track that starts exactly when the wall does; every track in the project is listed with a **start song at**
box (seconds INTO the song — 30 means the wall opens at 0:30 of the track), an **⇤ align to wall** button when it
starts elsewhere on the timeline, and a volume slider; ▶ Live and Wall-only renders play it.
The Library's Audio tab still edits trim / offset / BPM for every track in the project.

**Rendering a wall.** Opening the Wall view switches the render picker to **Wall only** (what the view previews); the
quality picker offers **Draft** (half resolution) and **Preview** (~960 px wide, 15 fps for wall-only renders, 8 browser
tabs — starts and finishes fast, looks like the editor preview), and **✕ Cancel** stops a
running render. The render picker has **Wall only · MP4** and **Wall only · ProRes 4444 (master)** — just
the wall clip, with any overlays/audio that overlap it shifted onto it. The paper is opaque, so the ProRes variant
is a quality master rather than an alpha export.

Outside the Wall view a wall clip shows up as: a `🧱 Wall · N items · M scenes` timeline block (double-click to
open, drop photos on it to add items, right-click for **Edit wall… / Fit duration to scenes / Fit camera to all
items / Add photos…**), a minimap card in the **Storyboard**, and a **Wall** section in the Edit **Inspector**.
Flip and Split are greyed for a wall clip (no media element to mirror; both halves would restart the schedule)
and the clip **Motion** section is hidden — the wall has its own camera. A **fit badge** (`✓ fit` /
`⚠ cuts the camera short by 15f` / `ⓘ holds the last framing for 40f`) appears on every wall block, the
Storyboard card and the strip header; fitting is always a manual button, never automatic.

Fastest start: import a folder of photos in **Assets** → choose **🧱 Wall** in the arrange prompt. That scatters
them into clusters, generates one scene per cluster with suggested glide timings, appends a fitted wall clip and
opens it.

## Common workflows

| Goal | How |
|---|---|
| Plan the shot order | **Storyboard** tab → drag cards to sequence, set each shot's duration, label + note it |
| Build a collage wall | **+ Wall** on the timeline (or **Wall** in the topbar) → drop photos → arrange → **⊕ Set as scene** per area → **⟲ Fit clip duration**. Or import photos in **Assets** and pick **🧱 Wall**. |
| Add a photo/clip | **+ Clip** (timeline / Storyboard **+ Add shot**) or click an **Assets** item; set `src` in the Inspector (e.g. `media/photo.jpg`) |
| Add a title | **+ Text**, then edit text/font/color/glow in the Inspector |
| Add full-frame atmosphere | **+ FX** → a full-frame layer; stack Wedding motions (petals, bokeh, light-leaks) or scanlines on it. Renders on top of the clips and alpha-exports for compositing. |
| Add music / soundtrack | **Library → Audio** tab: drag an audio file onto it (or **+ Add audio files**) — it imports and becomes a track. Set BPM/offset there for beat-sync. (Dropping audio on the Assets panel or timeline also adds a track; audio never shows in the Assets grid.) |
| Retime an element | Drag its timeline block; drag edges to change duration (edges **snap** to the playhead / clip boundaries — toggle with the 🧲 button) |
| Split a clip/layer | Move the playhead, select the block, **✂ Split** (or press `S` / `Ctrl+K`) |
| Duplicate / copy-paste | **⎘ Duplicate** (`Ctrl+D`); or `Ctrl+C` then `Ctrl+V` (pastes at the playhead) |
| Move/scale/rotate on screen | Select it → drag / corner-handle / rotate-handle on the canvas |
| Stack effects | Select an overlay → click effects in the Library (or the Inspector "+ add effect") |
| Set a transition | Select a clip → pick one in the Library Transitions tab (or Inspector) |
| Layer order (z) | ▲/▼ on the overlay's timeline lane |
| Scrub / seek | Drag the ruler, **click any empty lane**, or step with `←/→` (`Shift` = 1 s, `Home`/`End` = ends) |
| Zoom the timeline | `+` / `−` buttons or keys · **⤢ Fit** · `Ctrl`+mouse-wheel to zoom at the cursor |
| Play / pause | Spacebar, or the ▶/⏸ button |
| Render the video | Pick a format (MP4 / ProRes-alpha / overlays-only) then **⏺ Render** (top right) → writes to `out/` with a live progress bar |
| Save the project | **💾 Save** → `projects/<name>.json` (round-trips with Studio + the CLI) |
| Back up / share | **⭳ Export** (download JSON) / **⭱ Import** (load JSON) |
| Start over | **⟲ Reset** (reloads the sample, clears autosave) |

The project **autosaves to `localStorage`** as you work and is restored on reload.

## Keyboard shortcuts

Press **`?`** (or the **⌨** button in the topbar) anytime for the in-app cheat sheet.

| Key | Action |
|---|---|
| `Space` | Play / pause |
| `←` / `→` | Step one frame (`Shift` = one second) |
| `Home` / `End` | Jump to start / end |
| `S` or `Ctrl/Cmd + K` | Split the selection at the playhead |
| `Ctrl/Cmd + D` | Duplicate the selection |
| `Ctrl/Cmd + C` / `V` | Copy / paste the selection (paste lands at the playhead) |
| `Delete` / `Backspace` | Delete the selected clip/overlay |
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Shift + Z` / `Ctrl + Y` | Redo |
| `Ctrl/Cmd + S` | Save the project to `projects/<name>.json` |
| `+` / `−` | Zoom the timeline in / out (`Ctrl`+wheel zooms at the cursor) |
| `?` | Toggle the shortcuts cheat sheet |

**Wall mode** replaces the single-key map above (so `S` can't blade the clip under the playhead while you are
arranging photos); the `Ctrl/Cmd` combos are unchanged.

| Key | Action (Wall) |
|---|---|
| `Space` | Hold to pan (in **Live** it plays / pauses) |
| `F` / `Shift + F` | Fit all items / fit the selection |
| `1` / `0` | Zoom 1:1 / reset camera roll |
| `H` | Sticky hand (pan) tool |
| `[` / `]` | Send backward / bring forward (array order *is* paint order) |
| `←↑→↓` | Nudge the selection 1 wall unit (`Shift` = 10) |
| `Enter` | Set the current framing as a scene |
| `Alt` | Hold to disable snapping while dragging |
| `Delete` | Delete the selected item(s) |

(Single-key shortcuts are suppressed while typing in a field; `Ctrl/Cmd` combos still work, except copy/paste which defer to the focused field.)

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

**Memory: editor copies, Motion, and deleting assets.** The browser keeps every photo it shows as a
decoded bitmap — width × height × 4 bytes, whatever the JPEG weighs — and that memory is invisible to
the JavaScript heap. Measured on the real editor: over two minutes idle plus 480 pan and zoom
gestures, the heap, DOM node count and listener count never moved at all, while the process kept
growing and never gave it back. So this is not a leak to plug; it is decoded pixels nothing was
reclaiming. Three things now keep it in check.

**1. Two sizes of editor copy.** Every large photo you import gets two downscaled copies stored beside
it in `public/media/<project>/_proxy/`: a **2048 px** one for the preview, and a **320 px** one for
thumbnails. The Assets grid, Storyboard cards and timeline tips now read the 320 px copy — those tiles
are about 64 px wide, so the old behaviour decoded roughly 40× more pixels than the screen could show.
Measured on one 4000 × 3000 photo: 45.8 MB decoded as the original, 12.0 MB as the preview copy,
**0.29 MB** as the thumbnail. **Save, Export and Render always use the original** — the swap happens
only at the preview's input, never in your project file. For anything imported before this, press
**⚡ Generate editor copies (N)** once in the Assets tab.

**2. `⟳ Motion` is now off by default**, and pauses while the tab is hidden. It loops the preview so
you can watch a GIF or a stacked effect, but a preview that loops forever stops the browser from ever
going idle, and idle is exactly when it reclaims image memory. Turn it on to check something, then off
again. It does not affect ▶ Live or the render.

**3. Hover a tile → ×** deletes that file and all its editor copies from the project's media folder.
Imports are copies, so this is low-stakes; if the project still uses the file you're told how many
times and asked first (a purple dot marks in-use assets). Root demo assets have no ×.

If it still grows, open Chrome's Task Manager (`Shift+Esc`), enable the **Memory footprint**,
**JavaScript memory** and **GPU memory** columns, and watch the editor tab and the GPU Process rows. JS
memory staying small while the footprint climbs confirms it is image and raster memory, not a leak.

**When a render "sits there".** Before the first frame, every tab has to load every photo of the
composition (a 24-photo 4K wall in 8 tabs is a lot of decoding), so the status now shows a live
**"Waiting for the first frame… Ns"** heartbeat instead of a frozen line. After 45 s it points you at
the two places to look: **`out/<render name>.log`** (written next to the output: the settings, every
line the render tabs logged — a photo or font that failed to load, a GPU/ANGLE problem, a timed-out
`delayRender` — and the final error), and the **`wall.bat` window** (the dev server's own output).
Browser errors are also shown inline as a ⚠ next to the status while it runs, and a failed render now
shows its message in the bar. Two things to try if it never moves: ⚙ Render settings → **GPU backend
→ SwiftShader** (an ANGLE/GPU-driver hang looks exactly like this), and **fewer tabs** (Concurrency
2–4 — at 4K each tab decodes every photo, and a machine that runs out of RAM crawls without an error).

**Render speed — what actually helps.** A render is Chrome painting every frame in parallel tabs, then
x264 encoding them; there is nothing to pre-cache beyond the bundle (every frame is unique). In order of
impact: (1) **resolution** — 4K is 4× the pixels of 1080p and roughly 3–4× the time; render 1080p unless
the delivery is 4K (Canvas tab), or use **Preview** to check timing; (2) **encoder speed** (⚙ Render
settings → *H.264 encoder speed*, default **veryfast**; measured 13 % faster than *medium* at 1080p and
17 % faster than *fast* at 4K, where encoding is a bigger share) — the same CRF gives the same look,
faster presets just compress a little less efficiently; (3) **concurrency** — more tabs than CPU
cores does not help, and at 4K each tab is heavy on RAM (if the machine swaps, lower it); (4) the **GPU
backend** (ANGLE) — keep it on for the wall's shadows and filters. Lowering the JPEG frame quality is
*not* a lever: it barely saves time and the artefacts make the H.264 file bigger.

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
    App.tsx             layout + full global keyboard map (split/dup/copy-paste/step/zoom/save) + modal/toast
    store.ts            zustand + zundo (undo/redo) + split/duplicate/copy-paste/clipboard/toast; autosave
    components/
      Topbar.tsx        render (streamed progress) · save/export/import/reset · undo/redo · ⌨ shortcuts
      Preview.tsx       <Player component={Timeline}> in an exact-aspect box + CanvasOverlay
      CanvasOverlay.tsx react-moveable drag/scale/rotate + click-to-select, mapped to composition coords
      TimelinePanel.tsx ruler/scrub + click-to-seek + clip/overlay drag/resize (snap) + split/dup/fit/zoom
      ShortcutsModal.tsx keyboard cheat-sheet overlay (?) + transient action Toast
      Inspector.tsx     per-item prop editor incl. effect multi-select + transition picker
      Library.tsx       registry-driven Effects / Transitions / Assets browsers
      fields.tsx        shared Field / Slider / Section / EasingSelect / EffectStack primitives
      WallView.tsx      wall viewport: nav bar + the authoring <Player> (overscan) + drop handling
      WallOverlay.tsx   wall gestures: hit boxes, move/scale/rotate, snapping, marquee + group ops
      WallMiniMap.tsx   pure-SVG plan view (items, scene frusta, real glide paths) — 4 call sites
      WallInspector.tsx wall item props + the wall globals (commit-on-blur fields)
      WallScenes.tsx    the Scenes strip: set/update/jump/play scenes + the px/frame speed chip
    lib/
      effects-bridge.ts single import surface for the effect registry (auto-updating pickers)
      coords.ts         screen px <-> composition %/scale mapping
      fit.ts            useContainFit — the exact-composition-aspect box (Preview + WallView)
      timeline-utils.ts duration + clip start positions (mirrors calculateTimelineMetadata)
      wall-edit.ts      wall defaults, immutable rebuild helpers, authoringProject, fit status
      wall-coords.ts    thin adapter over src/timeline/wall.ts for the editor's gestures
      wall-import.ts    photos -> wall items (upload + aspect probe + async re-validation)
      api.ts            client for the dev-server render/save/media endpoints
```

Reuses, unchanged: `src/timeline/Timeline.tsx` (+ `calculateTimelineMetadata`), `src/timeline/schema.ts`,
`src/components/Layer.tsx`, the whole `src/effects` registry.

## Not yet built (Phase 2)

Multi-track grouping & marquee multi-select **on the timeline** (the Wall view has its own marquee +
group ops); keyframeable transforms; **real waveform** beat-sync (BPM/offset beat-sync and an `<Audio>`
soundtrack already ship — see the Audio tab). The registry-driven design means new VFX/transitions need
**no** editor changes.
