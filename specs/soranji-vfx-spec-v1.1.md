# soranji-vfx — Scaffold + Full Effect Registry + BPM Sample Scene (v1.1) — Claude Code Spec

> Self-contained spec. Claude Code does not share memory with the planning (SAGE) session — every fact, pattern, and constraint needed is in this file. Greenfield: nothing exists yet.
>
> **v1.1 supersedes the earlier public draft.** Three blocker fixes are folded in (sprite double-render, beat-sync windowing, composition duration) and the registry is expanded to the full research catalog. Changes vs the draft are marked `FIX:` and `NEW:`.

---

## Context

`soranji-vfx` is a brand-new **Remotion** project (React → MP4) that will become the VFX pipeline for a wedding walk-in video set to "Soranji" (~120 BPM, ~4 min). Remotion renders React components frame-by-frame in headless Chrome and stitches to MP4 with FFmpeg; every animation is driven by `useCurrentFrame()`.

This session must: (1) scaffold the project, (2) build a **data-driven effect registry** (motions + transitions, keyed by stable `id`) whose **type surface and category grouping hold the full ~110-effect catalog** (Appendix C), populated as `status:'todo'` stubs everywhere except the **Core 15 motions (all implemented) + Core 6 transitions (built-ins, implemented)**, and (3) ship one **assembled, BPM-synced sample scene** proving footage transitions + sprite motions + beat sync work end-to-end.

Animation is **DOM/CSS-first** (motions return `React.CSSProperties` from a progress value). WebGL/shader effects are part of the registry's type surface but are **out of scope to implement this session** — they are Stage 2, partly because the built-in HTML-in-canvas shader presentations require a Chrome 149+ preview flag (see Do NOT). Stubs fall back cleanly.

---

## Files to touch

All files are **created** (new repo). Paths assume project root after scaffold.

- `package.json`, `tsconfig.json`, `remotion.config.ts` — created by scaffold CLI; verify only
- `src/Root.tsx` — register the sample composition
- `src/index.ts` — entrypoint (scaffold creates; verify registers Root)
- `src/effects/types.ts` — registry type definitions **NEW: `license`/`credit` fields**
- `src/effects/helpers.ts` — easing / spring / beat / bezier maths
- `src/effects/catalog.ts` — **NEW: the full grouped catalog as data (Appendix C), source for stubs**
- `src/effects/motions.ts` — motion registry: Core 15 implemented + todo stubs for the rest
- `src/effects/transitions.ts` — transition registry: Core 6 built-ins implemented + todo stubs for the rest
- `src/effects/index.ts` — barrel + lookup helpers (safe fallback) + `buildCreditsMarkdown()`
- `src/components/Layer.tsx` — generic layer; **FIX: mount-window + absolute-frame beat**
- `src/components/Mushroom.tsx` — sprite wrapper over `Layer`
- `src/scenes/SoranjiSample.tsx` — assembled BPM scene; **FIX: windowed sprite layers**
- `scripts/gen-credits.mjs` — **NEW: emits `CREDITS.md` from the registry license fields**
- `public/orange-mush.gif`, `public/pixel-mush.gif` — sprites (downloaded in setup)
- `public/clip-a.svg`, `public/clip-b.svg` — placeholder footage (generated)
- `CLAUDE.md`, `SCRIPT_GUIDE.md` — root docs (content in Appendices A/B)
- `specs/` — create the directory; place this spec inside it

---

## Current state

Empty. No repo, no Node project. Node 18+ assumed (`node --version` must be ≥18).

---

## Desired state

After this session:

1. `npm run dev` opens **Remotion Studio** showing composition `SoranjiSample`.
2. The sample scene plays a **6.0s / 120 BPM** loop at **1920×1080 / 30fps**, total **180 frames**:
   - **Back layer (footage):** Clip A → Clip B via `slidePush` (`slide` preset). A = **78f**, transition = **18f**, B = **120f**; transitions overlap, so total footage = **78 + 120 − 18 = 180**.
   - **Front layer (sprites), each mounted only within its own window (no duplicates):**
     - orange mushroom: `springPop` for frames **0–40** (entrance), then `floatLoop` for **40–180**.
     - pixel mushroom: `motionPath` for **36–78** (fly-in), then `beatPulse` for **84–180**.
     - `beatFlash` full-frame overlay for **0–180**.
3. `src/effects/` exposes a **registry** grouped by category, holding the **full Appendix C catalog**: Core entries `status:'ready'` with implementations; every other entry a typed `status:'todo'` stub carrying `engine`/`tier`/`tags`/`license`/`credit`. Looking up an unknown/`todo` id returns a safe fallback (motion → identity style; transition → `fade`) with a single `console.warn`.
4. `npx remotion render SoranjiSample out/soranji-sample.mp4` produces a valid MP4 at 1920×1080.
5. `node scripts/gen-credits.mjs` writes **`CREDITS.md`** listing every non-MIT/attributed source in the registry (the two BSD shaders, etc.).
6. `CLAUDE.md` + `SCRIPT_GUIDE.md` exist at root and accurately describe the project.

---

## Implementation guide

### Step 1 — Scaffold
```bash
npx create-video@latest --yes --blank soranji-vfx   # verify exact flags; create-video is interactive by default
cd soranji-vfx
npm i
npm i @remotion/transitions @remotion/media-utils
```
Verify the scaffold created `src/index.ts`, `src/Root.tsx`, `remotion.config.ts`, and that `npm run dev` boots Studio before proceeding. **Pin all `remotion` + `@remotion/*` packages to the same exact version** (remove `^`) — Remotion requires identical versions across packages. If `--yes --blank` flags are wrong for the installed CLI, fall back to the interactive prompt and pick the **blank TypeScript** template.

### Step 2 — Assets
```bash
mkdir -p public
curl -L "https://maplestory.io/api/SEA/220/mob/100004/render/stand" -o public/orange-mush.gif
curl -L "https://maplestory.io/api/SEA/220/mob/9833390/render/stand" -o public/pixel-mush.gif
```
If a download fails/empties, create a 96×96 transparent PNG placeholder of the same name + a `// TODO: replace` note — do not block the build on a network asset. Generate `public/clip-a.svg` (warm `#ff9a52→#7a3b6e`) and `public/clip-b.svg` (cool `#1b2a6b→#0e3b4d`), 1920×1080, as simple linear-gradient SVGs.

### Step 3 — `src/effects/types.ts`
```ts
import type {CSSProperties} from 'react';
import type {TransitionPresentation} from '@remotion/transitions';

export type EffectTier = 'Core' | 'Ext' | 'Adv';
export type Engine = 'css' | 'canvas' | 'webgl' | 'three' | 'either';
export type EffectStatus = 'ready' | 'todo';

export interface MotionCtx {
  progress: number;   // normalized 0..1 for the layer's own window
  frame: number;      // absolute composition frame
  fps: number;
  t: number;          // seconds = frame / fps (ABSOLUTE — keeps loops/beat on the song grid)
  beat: number;       // 0..1 decaying kick from the BPM clock (absolute-frame derived)
  params: Record<string, number>;
}

interface EffectMeta {
  id: string;
  name: string;
  category: string;
  engine: Engine;
  tier: EffectTier;
  status: EffectStatus;
  tags: string[];
  license?: string;   // NEW: e.g. 'MIT', 'BSD-3-Clause-HP', 'BSD-2-Clause'
  credit?: string;    // NEW: author/source for the CREDITS file
}

export interface MotionDef extends EffectMeta {
  defaults?: Record<string, number>;
  style?: (ctx: MotionCtx) => CSSProperties;     // omitted for todo stubs
}

export interface TransitionDef extends EffectMeta {
  presentation?: (params?: Record<string, unknown>) => TransitionPresentation<unknown>; // omitted for todo
}
```

### Step 4 — `src/effects/helpers.ts`
```ts
export const TAU = Math.PI * 2;
export const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const smooth = (t: number) => t * t * (3 - 2 * t);

/** Damped spring 0->1 with overshoot. */
export const springy = (p: number) =>
  p >= 1 ? 1 : 1 - Math.exp(-6 * p) * Math.cos(9 * p);

export const bounceOut = (p: number) => {
  const n = 7.5625, d = 2.75;
  if (p < 1 / d) return n * p * p;
  if (p < 2 / d) { p -= 1.5 / d;  return n * p * p + 0.75; }
  if (p < 2.5 / d) { p -= 2.25 / d; return n * p * p + 0.9375; }
  p -= 2.625 / d; return n * p * p + 0.984375;
};

/** Decaying beat kick. frame-derived t keeps it deterministic; exp controls sharpness. */
export const beatKick = (t: number, bpm = 120, exp = 6) => {
  const spb = 60 / bpm;
  const ph = (t % spb) / spb;
  return Math.pow(1 - ph, exp);
};

export const bez = (t: number, p0: number[], p1: number[], p2: number[], p3: number[]) => {
  const u = 1 - t;
  return [
    u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0],
    u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1],
  ] as const;
};
```
> NOTE: the prior draft's `ELASTIC_AVAILABLE` lint hack is removed — no Core effect needs `elasticOut`. `elasticIn` is an Ext stub.

### Step 5 — `src/effects/catalog.ts` (full grouped catalog, the stub source)
Transcribe **every row of Appendix C** into a single exported array, grouped by category, typed as `Omit<MotionDef,'style'> | Omit<TransitionDef,'presentation'>` plus a `kind: 'motion' | 'transition'` discriminator. Each entry sets `status:'todo'` by default. Example shape:
```ts
export const CATALOG = [
  // --- transitions ---
  {kind:'transition', id:'crossfade', name:'Crossfade', category:'Dissolve', engine:'either', tier:'Core', status:'todo', tags:['universal','elegant'], license:'MIT'},
  {kind:'transition', id:'crossWarp', name:'Crosswarp', category:'Warp', engine:'webgl', tier:'Core', status:'todo', tags:['dreamy','modern'], license:'MIT', credit:'Eke Péter (gl-transitions)'},
  // ...all Appendix C rows...
  // --- motions ---
  {kind:'motion', id:'kenBurns', name:'Ken Burns', category:'Ken Burns / Zoom', engine:'css', tier:'Core', status:'todo', tags:['documentary','wedding']},
  // ...all Appendix C rows...
] as const;
```
This array is the **single source of truth** for registry metadata. `motions.ts`/`transitions.ts` import it, then *override* the Core entries with `status:'ready'` + an implementation.

### Step 6 — `src/effects/motions.ts` (Core 15 implemented; rest stubbed from CATALOG)
Build `motions` by: (a) creating a `todo` stub from every `kind:'motion'` CATALOG row, then (b) overriding these **15 Core ids** with `status:'ready'` + the `style()` below. Port the maths verbatim — they are validated.
```ts
import type {MotionDef, MotionCtx} from './types';
import {CATALOG} from './catalog';
import {springy, bounceOut, bez} from './helpers';

const motions: Record<string, MotionDef> = {};
for (const e of CATALOG) if (e.kind === 'motion') motions[e.id] = {...e};

const ready = (id: string, style: MotionDef['style'], defaults?: Record<string,number>) => {
  if (!motions[id]) throw new Error(`Core motion ${id} missing from CATALOG`);
  motions[id] = {...motions[id], status: 'ready', style, defaults};
};

ready('kenBurns',     ({progress:p}) => ({transform:`scale(${1.1+p*0.25}) translate(${(0.5-p)*4}%, ${(0.5-p)*3}%)`}));
ready('slowZoomIn',   ({progress:p}) => ({transform:`scale(${1+p*0.4})`}));
ready('panLR',        ({progress:p}) => ({transform:`scale(1.3) translateX(${(0.5-p)*18}%)`}));
ready('parallaxPan',  ({progress:p,params}) => ({transform:`scale(1.4) translateX(${(0.5-p)*20*(params.speed??1)}%)`}), {speed:1});
ready('springPop',    ({progress:p}) => ({transform:`scale(${springy(p)})`}));
ready('bounceIn',     ({progress:p}) => ({transform:`translateY(${(1-bounceOut(p))*-60}px)`, opacity:Math.min(1,p*3)}));
ready('dollyInOut',   ({progress:p}) => ({transform:`scale(${1+Math.sin(p*Math.PI)*0.4})`}));
ready('handheld',     ({t}) => {const nx=(Math.sin(t*7)+Math.sin(t*13)*0.5)*5, ny=(Math.cos(t*9)+Math.sin(t*5)*0.5)*4;
                         return {transform:`translate(${nx}px,${ny}px) rotate(${Math.sin(t*4)*1.2}deg)`};});
ready('whipPanCam',   ({progress:p}) => ({transform:`translateX(${(0.5-p)*120}%)`, filter:`blur(${Math.sin(p*Math.PI)*8}px)`}));
ready('tiltPerspective',({t}) => ({transform:`perspective(800px) rotateY(${Math.sin(t*1.2)*10}deg) rotateX(${Math.cos(t*1.0)*6}deg)`}));
ready('breathingLoop',({t}) => ({transform:`scale(${1.04+Math.sin(t*1.6)*0.035})`}));
ready('floatLoop',    ({t}) => ({transform:`translateY(${Math.sin(t*1.6)*10}px)`}));
ready('beatPulse',    ({beat}) => ({transform:`scale(${1.05+beat*0.22})`}));
ready('beatFlash',    ({beat}) => ({backgroundColor:'#fff', opacity:beat*0.6}));   // apply to a full-frame overlay
ready('motionPath',   ({progress:p}) => {const pt=bez(p,[12,82],[28,12],[72,92],[88,18]);
                         return {left:`${pt[0]}%`, top:`${pt[1]}%`, transform:'translate(-50%,-50%)'};});

export {motions};
```

### Step 7 — `src/effects/transitions.ts` (Core 6 built-ins implemented; rest stubbed)
Build `transitions` by stubbing every `kind:'transition'` CATALOG row, then override the **6 reliably-available built-ins** with `status:'ready'`. **Top-level imports below are the only presentations imported; everything else stays a stub.** All shader/HTML-in-canvas and custom-CSS transitions remain `todo` this session (see Do NOT).
```ts
import type {TransitionDef} from './types';
import {CATALOG} from './catalog';
import {fade} from '@remotion/transitions/fade';
import {slide} from '@remotion/transitions/slide';
import {wipe} from '@remotion/transitions/wipe';
import {flip} from '@remotion/transitions/flip';
import {clockWipe} from '@remotion/transitions/clock-wipe';
import {iris} from '@remotion/transitions/iris';

const transitions: Record<string, TransitionDef> = {};
for (const e of CATALOG) if (e.kind === 'transition') transitions[e.id] = {...e};

const ready = (id: string, presentation: TransitionDef['presentation']) => {
  if (!transitions[id]) throw new Error(`Core transition ${id} missing from CATALOG`);
  transitions[id] = {...transitions[id], status: 'ready', presentation};
};

ready('crossfade',  () => fade());
ready('slidePush',  (p) => slide({direction: (p?.direction as any) ?? 'from-right'}));
ready('linearWipe', (p) => wipe({direction: (p?.direction as any) ?? 'from-left'}));
ready('clockWipe',  (p) => clockWipe({width:(p?.width as number)??1920, height:(p?.height as number)??1080}));
ready('irisCircle', (p) => iris({width:(p?.width as number)??1920, height:(p?.height as number)??1080}));
ready('flip3D',     (p) => flip({direction: (p?.direction as any) ?? 'from-left'}));

export {transitions};
```
> Verify each import path resolves in the installed version **before** wiring. If any throws at module load, comment that one out and leave its id as a stub (do not let a bad import crash the bundle).

### Step 8 — `src/effects/index.ts` (lookup + fallback + credits)
```ts
import {fade} from '@remotion/transitions/fade';
import {motions} from './motions';
import {transitions} from './transitions';
import type {MotionDef} from './types';

export * from './types';
export {motions, transitions};

const IDENTITY: NonNullable<MotionDef['style']> = () => ({});

export const getMotion = (id: string): NonNullable<MotionDef['style']> => {
  const m = motions[id];
  if (!m || m.status !== 'ready' || !m.style) { console.warn(`[soranji-vfx] motion "${id}" not ready -> identity`); return IDENTITY; }
  return m.style;
};

export const getTransitionPresentation = (id: string, params?: Record<string, unknown>) => {
  const t = transitions[id];
  if (!t || t.status !== 'ready' || !t.presentation) { console.warn(`[soranji-vfx] transition "${id}" not ready -> fade`); return fade(); }
  return t.presentation(params);
};

/** Build a credits string from any entry carrying a credit/non-MIT license. */
export const buildCreditsMarkdown = (): string => {
  const all = [...Object.values(motions), ...Object.values(transitions)];
  const lines = all.filter(e => e.credit || (e.license && e.license !== 'MIT'))
    .map(e => `- **${e.name}** (\`${e.id}\`) — ${e.license ?? 'MIT'}${e.credit ? ` — ${e.credit}` : ''}`);
  return `# Credits & Licenses\n\nEffect sources requiring attribution:\n\n${lines.join('\n')}\n`;
};
```

### Step 9 — `src/components/Layer.tsx`  **(FIX: window + absolute beat)**
```tsx
import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {getMotion} from '../effects';
import {beatKick, clamp} from '../effects/helpers';

interface LayerProps {
  motionId: string;
  from?: number;              // FIX: mount frame
  durationInFrames?: number;  // FIX: how long this layer is on screen (unmounts after)
  windowInFrames?: number;    // progress normalization for entrance-style motions
  bpm?: number;
  params?: Record<string, number>;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

export const Layer: React.FC<LayerProps> = ({
  motionId, from = 0, durationInFrames, windowInFrames, bpm = 120, params = {}, style, children,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  // FIX: mount only within [from, from+durationInFrames). Prevents duplicate-sprite overlap.
  if (frame < from) return null;
  if (durationInFrames != null && frame >= from + durationInFrames) return null;

  const f = frame - from;
  const t = frame / fps;        // FIX: ABSOLUTE frame -> loop phase + beat stay locked to the song grid.
  const progress = windowInFrames ? clamp(f / windowInFrames) : clamp(f / fps);
  const beat = beatKick(t, bpm, 6);
  const motionStyle = getMotion(motionId)({progress, frame, fps, t, beat, params});

  return <div style={{position: 'absolute', willChange: 'transform, opacity', ...style, ...motionStyle}}>{children}</div>;
};
```
> Why not `<Sequence>` for windowing: `<Sequence>` rebases `useCurrentFrame()` to local, which would reset the beat phase per layer and desync the flashes from the song. Mount-gating here keeps `t` absolute, so beat stays correct.

### Step 10 — `src/components/Mushroom.tsx`
```tsx
import React from 'react';
import {Img, staticFile} from 'remotion';
import {Layer} from './Layer';

export const Mushroom: React.FC<{
  src: string; motionId: string; from?: number; durationInFrames?: number; windowInFrames?: number;
  bpm?: number; left: string; top: string; size?: number;
}> = ({src, motionId, from, durationInFrames, windowInFrames, bpm, left, top, size = 120}) => (
  <Layer motionId={motionId} from={from} durationInFrames={durationInFrames} windowInFrames={windowInFrames} bpm={bpm} style={{left, top}}>
    <Img src={staticFile(src)} style={{width: size, transform: 'translate(-50%,-50%)', filter: 'drop-shadow(0 8px 12px rgba(0,0,0,.45))'}} />
  </Layer>
);
```

### Step 11 — `src/scenes/SoranjiSample.tsx`  **(FIX: windowed layers, no dead vars)**
```tsx
import React from 'react';
import {AbsoluteFill, Img, staticFile} from 'remotion';
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {getTransitionPresentation} from '../effects';
import {Mushroom} from '../components/Mushroom';
import {Layer} from '../components/Layer';

const BPM = 120;
const ClipA = () => <Img src={staticFile('clip-a.svg')} style={{width:'100%',height:'100%',objectFit:'cover'}} />;
const ClipB = () => <Img src={staticFile('clip-b.svg')} style={{width:'100%',height:'100%',objectFit:'cover'}} />;

export const SoranjiSample: React.FC = () => (
  <AbsoluteFill style={{backgroundColor: '#0c1322'}}>
    {/* BACK LAYER: footage transition (Clip A -> Clip B). Totals 78 + 120 - 18 = 180 frames. */}
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={78}><ClipA /></TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={getTransitionPresentation('slidePush', {direction: 'from-right'})}
        timing={linearTiming({durationInFrames: 18})}
      />
      <TransitionSeries.Sequence durationInFrames={120}><ClipB /></TransitionSeries.Sequence>
    </TransitionSeries>

    {/* FRONT LAYER: each sprite mounts only within its window (FIX: no duplicate overlap) */}
    <Mushroom src="orange-mush.gif" motionId="springPop" from={0}  durationInFrames={40}  windowInFrames={36} left="22%" top="66%" />
    <Mushroom src="orange-mush.gif" motionId="floatLoop" from={40} durationInFrames={140} left="22%" top="66%" bpm={BPM} />
    <Mushroom src="pixel-mush.gif"  motionId="motionPath" from={36} durationInFrames={42} windowInFrames={42} left="0%" top="0%" bpm={BPM} />
    <Mushroom src="pixel-mush.gif"  motionId="beatPulse" from={84} durationInFrames={96} left="66%" top="60%" bpm={BPM} />

    {/* BEAT FLASH overlay (full-frame), content-length window */}
    <Layer motionId="beatFlash" from={0} durationInFrames={180} bpm={BPM} style={{inset: 0, width: '100%', height: '100%'}}><div /></Layer>
  </AbsoluteFill>
);
```

### Step 12 — `src/Root.tsx`  **(FIX: durationInFrames = 180)**
```tsx
import {Composition} from 'remotion';
import {SoranjiSample} from './scenes/SoranjiSample';

export const RemotionRoot: React.FC = () => (
  <Composition id="SoranjiSample" component={SoranjiSample} durationInFrames={180} fps={30} width={1920} height={1080} />
);
```
Ensure `src/index.ts` registers `RemotionRoot` via `registerRoot`.

### Step 13 — `scripts/gen-credits.mjs`
A small Node script that imports the bundled registry (or re-implements the same scan over `catalog.ts`) and writes `CREDITS.md` using `buildCreditsMarkdown()`. Must at minimum list `InvertedPageCurl` (BSD-3-Clause-HP, Hewlett-Packard) and `StereoViewer` (BSD-2-Clause, Ted Schundler). Add `"credits": "node scripts/gen-credits.mjs"` to `package.json` scripts.

### Step 14 — Docs
Create `CLAUDE.md` and `SCRIPT_GUIDE.md` (Appendices A/B). Move this spec into `specs/`.

---

## Patterns to follow

- **Frame-driven only.** Every animated value derives from `useCurrentFrame()`/`useVideoConfig()`. `Layer` is the single frame→ctx boundary; nothing reads wall-clock time.
- **Registry is the contract.** New effects are CATALOG entries + (for ready ones) an implementation override. Scenes reference effects by `id` only, never inline animation.
- **Safe fallback over crash.** `getMotion`/`getTransitionPresentation` never throw on unknown/`todo` — identity / `fade`, one `console.warn`.
- **Mount-gate, don't rebase.** Time-window layers in `Layer` (return `null` outside range). Do **not** wrap beat-reactive layers in a frame-rebasing `<Sequence>`.
- **`staticFile()` for all assets.** No remote URLs in components (offline render).
- **Pin Remotion versions** identically across `remotion` + `@remotion/*` (no `^`).
- **Beat maths** lives only in `helpers.ts#beatKick`.
- **License hygiene.** Every shader/attributed entry carries `license`/`credit`; `gen-credits.mjs` emits `CREDITS.md`.

---

## Do NOT

- **Do NOT implement WebGL/shader or HTML-in-canvas transitions this session** (zoomBlur, zoomInOut, dreamyZoom, filmBurn, dissolve, crossWarp, rgbSplit, etc.). They stay `todo`. Reason beyond scope: Remotion's HTML-in-canvas presentations require **Chrome 149+ with `chrome://flags/#canvas-draw-element`** for Studio preview (API in origin trial through ~Chrome 150); server render works (v4.0.455+) but Studio fine-tuning would break. Shader layer is a separate Stage-2 spec.
- **Do NOT wire `cube()`** — it is a **paid** Remotion Pro component. The MIT gl-transitions `cube` shader is the free Stage-2 alternative.
- **Do NOT port Shadertoy shaders** — default license is CC BY-NC-SA (non-commercial). Use gl-transitions (MIT) only.
- **Do NOT use `@keyframes`, `setInterval`, `requestAnimationFrame`, the GSAP ticker, or R3F `useFrame()`** for animation — frames will desync. Frame-derived values only.
- **Do NOT wire audio analysis yet.** BPM is frame-derived for v1. `@remotion/media-utils` is installed for later (`useAudioData`/`visualizeAudio`); do not call it now.
- **Do NOT add UI libraries, routers, or state managers.**
- **Do NOT hardcode effect logic inside `SoranjiSample.tsx`** beyond layout/timing — behavior comes from the registry.
- **Do NOT let the composition exceed footage content** — comp is 180, matching the TransitionSeries total.
- **Do NOT block the build on sprite downloads** — fall back to transparent PNG placeholders.

---

## Verification

- `npm run build` (or `npx remotion bundle`) — passes, **no TypeScript errors**.
- `npm run dev` — Studio opens, `SoranjiSample` loads; the only console output is expected `[soranji-vfx] ... not ready -> fade/identity` warnings for `todo` ids.
- **Scrub the timeline and confirm the fixes:**
  - At every frame there is **exactly one** orange mushroom and **at most one** pixel mushroom (no duplicates).
  - Orange: pops in (~0–36), then floats (40+). Pixel: travels a path in (36–78), then pulses (84+).
  - Footage slides A→B (~78–96). **No empty/black footage tail** — content fills to frame 180 = comp end.
  - `beatFlash` blinks on the beat; pulses/flashes stay phase-locked across layers.
- `npx remotion render SoranjiSample out/soranji-sample.mp4` — playable 1920×1080 MP4.
- `node scripts/gen-credits.mjs` — writes `CREDITS.md` listing the two BSD shaders.
- Lookup safety: temporarily `getMotion('nope')` returns identity + one warn, no throw. Remove after.

---

## Commit
Message: `feat(scaffold): init soranji-vfx Remotion project with full effect registry, fixed BPM sample scene`
Types: feat / fix / refactor / docs / perf / chore / style

---

## Appendix A — `CLAUDE.md` (create at repo root)

```markdown
# soranji-vfx — Project Context

## What this is
A Remotion (React → MP4) VFX pipeline for a wedding walk-in video set to "Soranji" (~120 BPM). HTML/CSS-authored animation, rendered frame-accurate to MP4. Output: 1920×1080, 30fps.

## Stack
- Remotion + @remotion/transitions (pinned, identical versions, no `^`)
- @remotion/media-utils (installed for future audio-reactive work; NOT wired yet)
- TypeScript. No other UI/state libs. (Stage 2 may add @remotion/three; Stage 3 @remotion/lottie.)

## Architecture
- `src/effects/` is a data-driven registry grouped by category.
  - `catalog.ts` — the full ~110-effect catalog as metadata (the single source of truth).
  - `motions.ts` — single-layer animations; Core implemented, rest are `todo` stubs. `style(ctx) => CSSProperties`.
  - `transitions.ts` — footage A→B; Core built-ins implemented, rest `todo`. Maps to `@remotion/transitions` presentations.
  - `index.ts` — `getMotion(id)` / `getTransitionPresentation(id, params)` (always safe-fallback, never throw) + `buildCreditsMarkdown()`.
- Effects carry `tier` (Core/Ext/Adv), `engine` (css/canvas/webgl/three/either), `status` (ready/todo), `tags`, and `license`/`credit`.
- `Layer.tsx` is the single frame→ctx boundary: reads `useCurrentFrame()`/`useVideoConfig()`, computes `progress`/`t`/`beat`, mount-gates the layer, and applies the motion's CSS.

## Conventions (non-negotiable)
- Frame-driven only. No @keyframes, setInterval, rAF, GSAP ticker, or R3F useFrame.
- Time-window layers by mount-gating in `Layer` (return null outside range). Do NOT use a frame-rebasing `<Sequence>` for beat-reactive layers — it desyncs the beat.
- `t` is ABSOLUTE composition seconds so loops + beat stay on the song grid.
- All assets via `staticFile()`. No remote URLs in components.
- BPM via `helpers.ts#beatKick` only. v1 derives beat from frame count; no audio analysis yet.
- New effects = catalog entry + (if ready) an implementation override. Scenes reference effects by id.
- Composition length must equal footage content (transitions overlap; total = ΣsequenceDurations − Σtransitions).

## Stage roadmap
- Stage 1 (this scaffold): Core 15 motions + 6 built-in transitions, frame-beat, full registry stubs.
- Stage 2 (shader spec): wrap `makeHtmlInCanvasPresentation()` to ingest gl-transitions GLSL.
  - **Remotion shader time is REVERSED vs gl-transitions: add `float progress = 1.0 - u_time;` or transitions play backward.** Swap `getFromColor→texture(u_prev,uv)`, `getToColor→texture(u_next,uv)`; force time=0 when prevImage null, time=1 when nextImage null.
  - HTML-in-canvas Studio preview needs Chrome 149+ with `chrome://flags/#canvas-draw-element`; server render works from v4.0.455. Verify current support before committing the preview workflow.
  - gl-transitions are MIT (118/120); `InvertedPageCurl` BSD-3 (HP), `StereoViewer` BSD-2 — keep notices, run `npm run credits`.
- Stage 3: `@remotion/three` for true 3D camera/cube/2.5D; optional Lottie overlays. Wire `@remotion/media-utils` for real audio-reactive beat.

## Sprites
- Orange mushroom: maplestory.io mob 100004 (`public/orange-mush.gif`)
- Pixel mushroom: maplestory.io mob 9833390 (`public/pixel-mush.gif`)
- Replace with final wedding footage/sprites for production.

## Commands
- `npm run dev` — Remotion Studio
- `npm run build` / `npx remotion bundle` — typecheck/bundle
- `npx remotion render SoranjiSample out/soranji-sample.mp4` — export
- `npm run credits` — regenerate CREDITS.md
```

## Appendix B — `SCRIPT_GUIDE.md` (create at repo root)

```markdown
# soranji-vfx — Code Map

## src/effects/
- `types.ts` — MotionDef, TransitionDef, MotionCtx, Engine/Tier/Status unions, license/credit fields.
- `helpers.ts` — clamp, smooth, springy, bounceOut, beatKick, bez. Pure maths, no React.
- `catalog.ts` — full ~110-effect catalog as data; single source of truth for metadata.
- `motions.ts` — `motions` registry: stubs from catalog + 15 Core implementations.
- `transitions.ts` — `transitions` registry: stubs from catalog + 6 Core built-in presentations.
- `index.ts` — barrel + getMotion/getTransitionPresentation (safe fallback) + buildCreditsMarkdown.

## src/components/
- `Layer.tsx` — generic positioned layer; frame→ctx boundary; mount-gates by [from, from+duration); applies a motion by id. ALL frame reads happen here.
- `Mushroom.tsx` — thin sprite wrapper over Layer.

## src/scenes/
- `SoranjiSample.tsx` — assembled BPM demo: footage TransitionSeries (A→B, 180f total) + windowed sprite layers + beatFlash overlay. Layout/timing only.

## src/
- `Root.tsx` — registers Composition "SoranjiSample" (1920×1080, 30fps, 180 frames).
- `index.ts` — registerRoot(RemotionRoot).

## scripts/
- `gen-credits.mjs` — emits CREDITS.md from registry license/credit fields.

## public/
- orange-mush.gif, pixel-mush.gif — sprites. clip-a.svg, clip-b.svg — placeholder footage.

## Adding an effect later
1. The metadata already lives in catalog.ts. To implement: override the entry to status:'ready' with a style()/presentation() in motions.ts/transitions.ts.
2. Reference it in a scene by id. No scene-level animation code.
3. If it carries a license/credit, run `npm run credits`.
```

## Appendix C — Full effect catalog (grouped; the data for `catalog.ts`)

Engine: **css | canvas | webgl | three | either**. Tier: Core / Ext / Adv. ★ = Core (implement this session where marked). All gl-transitions are MIT unless noted. Set every row `status:'todo'` in `catalog.ts`; Core rows get overridden to `ready` only where an implementation is provided in Steps 6–7 (the 15 motions + 6 built-in transitions). Other Core rows (e.g. crossWarp, zoomBlur, dipToColor) stay `todo` this session.

### TRANSITIONS

**Dissolve** — crossfade ★(either, MIT) · dipToColor ★(css, MIT — Stage1.5, no shader) · filmDissolve(webgl, Ext, MIT) · additiveDissolve(webgl, Ext, MIT) · randomSquares(webgl, Ext, MIT) · pixelize(webgl, Ext, MIT) · hsvFade(webgl, Adv, MIT)

**Wipe** — linearWipe ★(css, MIT) · clockWipe ★(either, MIT) · barnDoor(css, Ext, MIT) · directionalWipe(webgl, Core, MIT) · windowBlinds(css, Ext) · angularWipe(webgl, Ext, MIT) · polkaDots(webgl, Ext, MIT) · waterDrop(webgl, Ext, MIT)

**Slide / Push** — slidePush ★(css, MIT) · slideOver ★(css, MIT) · coverUncover(css, Ext) · splitSlide(webgl, Ext, MIT) · rolls(webgl, Ext, MIT)

**Shape / Mask** — irisCircle ★(either, MIT) · circleCrop(webgl, Ext, MIT) · heart(webgl, Ext, MIT — wedding) · rectangleCrop(webgl, Ext, MIT) · starWipe(css, Ext, MIT) · doorway(webgl, Ext, MIT — gre) · svgMaskReveal(css, Adv, MIT)

**Warp (GLSL)** — crossWarp ★(webgl, MIT — Eke Péter) · directionalWarp(webgl, Ext, MIT — pschroen) · morph(webgl, Adv, MIT — paniq) · displacement(webgl, Adv, MIT) · ripple(webgl, Ext, MIT) · flyeye(webgl, Ext, MIT) · crossZoom(webgl, Ext, MIT) · pageCurl(webgl, Adv, **BSD-3-Clause-HP — Hewlett-Packard**)

**Glitch** — rgbSplit ★(webgl, write-own) · glitchMemories(webgl, Ext, MIT — Gunnar Roth) · glitchDisplace(webgl, Ext, MIT) · vhs(webgl, Ext, write-own) · scanlines(webgl, Ext, write-own) · datamoshSim(webgl, Adv, simulated) · doomScreen(webgl, Ext, MIT)

**3D** — flip3D ★(either, MIT) · cube3D(webgl/three, Ext, MIT — gre; NOT Remotion cube() which is paid) · gridFlip(webgl, Ext, MIT) · foldPaper(webgl, Ext, MIT) · bookFlip(webgl, Ext, MIT) · rotateScaleFade(webgl, Ext, MIT) · stereoViewer(webgl, Adv, **BSD-2-Clause — Ted Schundler**)

**Light / Color** — filmBurn ★(webgl, MIT) · lightLeak ★(css, asset) · flashWhite ★(css, write-own) · overexposure(webgl, Ext, MIT) · bokehDissolve(webgl, Ext, MIT) · colorDistance(webgl, Ext, MIT) · dreamyZoom ★(webgl, MIT)

**Zoom / Blur** — zoomBlur ★(webgl, MIT) · zoomInOut ★(webgl, MIT) · linearBlur(webgl, Ext, MIT) · simpleZoom(webgl, Ext, MIT) · swirl(webgl, Ext, MIT) · whipPan ★(css/webgl, technique)

**Particle** — pixelExplode(webgl, Adv, write-own) · confettiBurst(canvas, Ext, write-own — wedding) · petalFall(canvas, Ext, write-own — wedding) · sparkle(canvas, Ext, write-own) · mosaicShatter(webgl, Ext, MIT) · hexagonalize(webgl, Ext, MIT) · kaleidoscope(webgl, Adv, MIT)

### MOTIONS

**Ken Burns / Zoom** — kenBurns ★(css) · slowZoomIn ★(css) · slowZoomOut(css, Core) · pulseZoom(css, Core, media-utils) · smashZoom(css, Ext) · focusBreath(css, Ext)

**Pan / Move** — panLR ★(css) · panUD(css, Core) · parallaxPan ★(css) · driftFloat(css, Ext) · kineticText(css, Ext)

**Path** — motionPath ★(css, @remotion/paths) · arcMove(css, Ext) · orbit(css, Ext) · drawOn(css, Ext, @remotion/paths — wedding) · bezierFloat(css, Adv)

**Physics / Spring** — springPop ★(css, Remotion spring) · bounceIn ★(css) · elasticIn(css, Core) · jiggleWobble(css, Ext, MIT — Animate.css) · inertiaSlide(css, Ext) · squashStretch(css, Ext) · pendulum(css, Adv)

**3D / Perspective** — tiltPerspective ★(css/three) · flip3DLayer(css/three, Ext) · cardStack(three, Ext, MIT) · photoFloat3D(three, Adv) · revolve3D(three, Adv, MIT)

**Camera** — dollyInOut(css/three, Core) · truck(css/three, Core) · pedestal(css/three, Ext) · panCam(three, Core) · tiltCam(three, Ext) · zoomLens(css, Core) · rackFocus(webgl, Ext) · dollyZoom(three, Adv) · whipPanCam ★(css/webgl) · craneJib(three, Ext) · arcShot(three, Ext) · handheld ★(css, @remotion/noise) · dutchAngle(css, Ext) · steadicamFollow(css/three, Adv)

**Loop / Idle** — breathingLoop ★(css) · floatLoop ★(css) · swayLoop(css, Ext) · shimmerLoop(css/webgl, Ext) · pulseGlow(css, Ext) · grainLoop(webgl, Ext)

**Beat-reactive** — beatPulse ★(css, media-utils) · beatFlash ★(css, media-utils) · beatShake(css, Core, media-utils) · beatColorCycle(css/webgl, Ext) · audioBars(canvas, Ext, MIT) · waveform(canvas, Ext, MIT) · beatZoomCut(css, Ext) · bassWarp(webgl, Adv)

> The 15 motions implemented this session: kenBurns, slowZoomIn, panLR, parallaxPan, springPop, bounceIn, dollyInOut, handheld, whipPanCam, tiltPerspective, breathingLoop, floatLoop, beatPulse, beatFlash, motionPath. The 6 transitions implemented: crossfade, slidePush, linearWipe, clockWipe, irisCircle, flip3D. Everything else: typed `todo` stub.
