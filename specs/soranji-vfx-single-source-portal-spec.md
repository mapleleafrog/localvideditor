# Single-Source Portal Refactor — Claude Code Spec

## Context
soranji-vfx is a Remotion VFX pipeline whose effects live in a data-driven registry under `src/effects/`. Today the no-npm portal (`index.html`) re-implements every motion formula plus the `composeStyles` engine in hand-written inline JS, because the browser cannot import the TS source (see SCRIPT_GUIDE.md "Adding / promoting an effect" step 5). This refactor makes the motion formulas, depth math, and `composeStyles` a single framework-neutral source consumed by both the Remotion/TS render side and the portal, eliminating the hand-mirroring. This is a behavior-preserving relocation plus a codegen step. Rendered output must be visually identical before and after.

## Files to touch
- `src/effects/portable.ts` — NEW. Framework-neutral home for all ready motion formula functions, depth math (`depthShadow`, `depthScale`, `bevel`), and `composeStyles`. No React, no Remotion imports.
- `src/effects/helpers.ts` — keep as the pure-math home; `portable.ts` imports from it. Minimal or no change.
- `src/effects/compose.ts` — re-export `composeStyles` from `portable.ts` so existing importers stay untouched.
- `src/effects/motions.ts` — build the motions registry by wrapping formula functions from `portable.ts` with catalog metadata. Formula bodies move out to portable.
- `src/effects/depth.ts` — depth motion formulas + depth math move to portable; this file keeps the catalog-metadata wiring only.
- `src/effects/pixel.ts` — pixel motion formulas move to portable; keep metadata wiring here.
- `src/effects/retro.ts` — retro/FX motion formulas move to portable; keep metadata wiring here.
- `scripts/gen-portal.mjs` — NEW. Bundles `src/effects/portable.ts` to `public/portal/effects.bundle.js` (browser IIFE) via esbuild. Supports a `--check` mode for the drift guard. Model its structure on `scripts/gen-credits.mjs`.
- `public/portal/effects.bundle.js` — NEW generated artifact (committed to the repo).
- `index.html` — replace the hand-written MOTIONS object and inline `composeStyles` with consumption of the generated bundle via a classic `<script>`. TRANSITIONS tab unchanged.
- `package.json` — add `gen:portal` and `check:portal` scripts; add a pre-hook so dev/render regenerate the bundle; add `esbuild` as a pinned devDependency.
- `gen-portal.bat`, `check-portal.bat` — NEW. Double-clickable Windows runners for the npm scripts.
- `CLAUDE.md` — update the portal section to reflect the generated flow.
- `SCRIPT_GUIDE.md` — rewrite step 5 of "Adding / promoting an effect".
- `src/effects/types.ts` — READ-ONLY reference for `MotionCtx` and existing style typing.
- `src/effects/index.ts` — READ-ONLY. Barrel + `getMotion`/registry public API must stay byte-stable.
- `src/components/Layer.tsx` — READ-ONLY. Verify it still imports `composeStyles` from `compose.ts` and works unchanged.

## Current state
Motion formulas are authored as `style(ctx) => CSSProperties` functions inside `motions.ts` (~**80** ready), `depth.ts`, `pixel.ts`, and `retro.ts`, intermixed with the catalog-metadata wiring that flips entries from `status:'todo'` to `'ready'`. `compose.ts` exports `composeStyles(styles[])` (concat transform + filter, multiply opacity, last-wins), consumed by `Layer.tsx`. `index.html` independently re-declares the helpers, a MOTIONS object, and its own `composeStyles` in inline JS; per SCRIPT_GUIDE step 5, every new effect must be hand-ported into it. `helpers.ts` is already pure math with no React.

## Desired state
A single `src/effects/portable.ts` exports:
- `MOTION_FORMULAS` — a record of `motionId -> (ctx: MotionCtx) => StyleObject`, covering every currently-ready motion across the motions/depth/pixel/retro families.
- the depth math (`depthShadow`, `depthScale`, `bevel`).
- `composeStyles`.

`StyleObject` is a local framework-neutral CSS-property record (structurally compatible with `React.CSSProperties`, adapted at the registry boundary). `portable.ts` imports pure math from `helpers.ts` and imports nothing from React or Remotion.

`motions.ts` / `depth.ts` / `pixel.ts` / `retro.ts` keep their catalog-metadata wiring (tags, tier, engine, license/credit, the `status:'ready'` override) but source their formula bodies from `MOTION_FORMULAS` instead of inlining them. `compose.ts` re-exports `composeStyles` from portable so `Layer.tsx` and any other importer is unchanged.

`scripts/gen-portal.mjs` bundles `portable.ts` with esbuild to `public/portal/effects.bundle.js` as an IIFE that sets `window.SoranjiEffects = { MOTION_FORMULAS, composeStyles, ...helpers }`. `index.html` loads that bundle via a classic (non-module) `<script>` and drives its MOTIONS tab and stacking from `window.SoranjiEffects`, declaring zero formulas of its own.

Editing a formula and running `npm run gen:portal` (or `gen-portal.bat`) updates the portal automatically. `npm run check:portal` fails if the committed bundle is stale relative to source. Rendered output (Studio, MotionGallery, Timeline renders) is visually identical to pre-refactor.

## Implementation guide
1. **Create `src/effects/portable.ts`.**
   - Define a local `StyleObject` type: a record of CSS property names to `string | number`. Framework-neutral.
   - Move the depth math (`depthShadow`, `depthScale`, `bevel`) here from `depth.ts`.
   - Move every ready motion `style(ctx)` formula body from `motions.ts`, `depth.ts`, `pixel.ts`, and `retro.ts` into a single exported `MOTION_FORMULAS` record, keyed by the exact existing motion id, each typed `(ctx: MotionCtx) => StyleObject`.
   - Move `composeStyles` here from `compose.ts`.
   - Import shared pure math from `helpers.ts`. Do not duplicate it.
   - Export `MOTION_FORMULAS`, `composeStyles`, and the depth math. Add NO React/Remotion imports.
   - Move formula bodies verbatim. Do not "improve" or refactor the math. Visually identical output is the acceptance bar.
2. **Rewire `compose.ts`** to `export { composeStyles } from './portable'`, keeping the existing import path stable for `Layer.tsx`.
3. **Rewire `motions.ts` / `depth.ts` / `pixel.ts` / `retro.ts`** to import the relevant functions from `portable.ts` and attach them to their catalog entries using the same `status:'ready'` override mechanism as today. These files keep owning catalog wiring; they no longer own formula bodies. If `StyleObject` and `CSSProperties` differ at the type level, adapt with a cast/alias at this boundary; the runtime object is unchanged.
4. **Keep `index.ts` barrel, `getMotion`, `readyMotions`, and the registry public API identical.** No signature changes.
5. **Create `scripts/gen-portal.mjs`** (structure modeled on `scripts/gen-credits.mjs`).
   - Invoke esbuild to bundle `src/effects/portable.ts` into `public/portal/effects.bundle.js` with: `bundle: true`, `format: 'iife'`, `globalName: 'SoranjiEffects'`, `platform: 'browser'`, `minify: false` (keep readable and deterministic).
   - Add a `--check` flag: build to a temp/in-memory output and compare byte-for-byte against the committed `public/portal/effects.bundle.js`. Exit 0 if identical; exit 1 with message `portal bundle stale - run npm run gen:portal` if different.
6. **Update `index.html`:**
   - Remove the inline motion helpers, MOTIONS object, and inline `composeStyles`.
   - Add `<script src="public/portal/effects.bundle.js"></script>` (classic, NOT `type="module"`, so `file://` double-click still works) before the portal's own script.
   - Replace references to the old local MOTIONS/composeStyles with `SoranjiEffects.MOTION_FORMULAS` and `SoranjiEffects.composeStyles`.
   - Leave the TRANSITIONS tab and its CSS approximations exactly as-is. Preserve the existing sprite base64 fallback.
7. **Update `package.json`:**
   - Add `"gen:portal": "node scripts/gen-portal.mjs"` and `"check:portal": "node scripts/gen-portal.mjs --check"`.
   - Add a `"predev"` hook and a pre-hook on the timeline render script that run `npm run gen:portal`, so dev and render never use a stale bundle.
   - Add `esbuild` to `devDependencies` pinned to an exact version (no caret), consistent with the repo's pinned-deps discipline. A pinned version keeps `--check` output deterministic.
8. **Create `gen-portal.bat`** (runs `npm run gen:portal`) and `check-portal.bat` (runs `npm run check:portal`) at repo root. One command each, double-clickable on Windows.
9. **Update docs.**
   - `SCRIPT_GUIDE.md`: replace step 5 of "Adding / promoting an effect" with: add the formula to `MOTION_FORMULAS` in `src/effects/portable.ts`, wire its catalog entry in the relevant family file, run `npm run gen:portal` (or `gen-portal.bat`); the portal picks it up automatically.
   - `CLAUDE.md`: update the portal section to state the portal's motion effects and `composeStyles` are generated from `portable.ts` (no hand-mirroring), and note `npm run check:portal` guards drift.

## Patterns to follow
- Model `gen-portal.mjs` on the existing `scripts/gen-credits.mjs` (same Node/.mjs conventions, same build-then-emit shape).
- Honor the frame-driven, pure-function discipline defined in CLAUDE.md: `portable.ts` formulas stay pure functions of `ctx`, with no React, no Remotion, no rAF/timers.
- Keep the registry's public surface (`getMotion`, `readyMotions`, `index.ts` barrel) and all `catalog.ts` metadata exactly as documented in SCRIPT_GUIDE.md.
- The portal include is a classic script by design (`file://` cannot load ES modules); this preserves the double-click property documented in CLAUDE.md.

## Do NOT
- Do NOT change any effect's visual output. This is relocation plus codegen; rendered frames must be visually identical. If output changes, the move was wrong.
- Do NOT touch transition presentations (`presentations.tsx`, `transitions.ts`) or the portal's TRANSITIONS tab. Transition parity is explicitly out of scope; the portal keeps its CSS approximations.
- Do NOT import React or Remotion into `portable.ts`. It must bundle cleanly for the browser and stay render-agnostic.
- Do NOT use `type="module"` for the portal bundle include. Use a classic `<script src>` so `file://` double-click still works.
- Do NOT leave any motion formula or `composeStyles` logic declared in `index.html`. After this change the portal declares zero formulas; it consumes the bundle only.
- Do NOT change `catalog.ts` metadata, the `index.ts` barrel exports, or `getMotion`/registry signatures.
- Do NOT add runtime dependencies. esbuild is a devDependency only.
- Do NOT reformat or refactor adjacent code that is not part of this change.

## Verification
- Run `npm install` (esbuild present), then `npm run gen:portal` — produces `public/portal/effects.bundle.js`.
- Run the project typecheck/build (`npm run build` or `tsc`) — passes with no new errors.
- Run `npm run dev` — Remotion Studio opens. In MotionGallery, spot-check that a depth motion (e.g. `parallaxDepth`), a pixel motion (e.g. `pixelBob`), a retro motion (e.g. `neonGlow`), and a stacked `motionIds[]` layer all render identically to before the refactor.
- Open `index.html` by double-click (`file://`) — portal loads with no module/CORS console errors; MOTIONS tab works; multi-select stacking works (proves `composeStyles` via the bundle); sprite animates.
- Drift guard: run `npm run check:portal` — passes. Edit one formula in `portable.ts`, do NOT regenerate, run `npm run check:portal` again — it FAILS with the stale-bundle message. Run `npm run gen:portal` to restore, confirm it passes.
- Regression: render a sample via the timeline render script against an existing `projects/*.json` — output visually matches the pre-refactor render.
- Docs: confirm SCRIPT_GUIDE.md step 5 and the CLAUDE.md portal section describe the new generated flow.

## Commit
Message: `refactor(effects): single-source motion formulas; generate portal from portable.ts`
Type: refactor (behavior-preserving relocation + codegen tooling).
