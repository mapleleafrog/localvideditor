# Implementation-Ready Effects Library Spec for a Remotion (HTML→MP4) Music-Video / Compositing Pipeline

## TL;DR
- **Build a data-driven, progress(0→1)-keyed effect registry on top of Remotion.** The catalog below gives ~55 transitions and ~55 motions; the fastest payoff is the ~15+15 "Core starter set" built from `@remotion/transitions` presets + CSS/Canvas2D transforms, then graduate to ported MIT-licensed gl-transitions GLSL shaders for "true warp" looks.
- **Engine recommendation is additive-first:** keep your Canvas2D + WebGL approach and run it inside Remotion via `makeHtmlInCanvasPresentation()` and `@remotion/three`. Add GSAP (now free) only as an authoring/easing helper, and gl-transitions as your shader source (MIT, with two BSD exceptions). Treat PixiJS/Babylon/Motion-Canvas/Rive as MIGRATIONS to avoid.
- **Licensing is clean for commercial wedding work:** ~118 of ~120 gl-transitions shaders are MIT; only `InvertedPageCurl` (BSD-3, HP) and `StereoViewer` (BSD-2) differ — both still commercially safe with attribution. Do not copy Shadertoy shaders verbatim — per Shadertoy's Terms, "if you don't place a license on a shader, it will be protected by [CC Attribution-NonCommercial-ShareAlike 3.0 Unported]," whose NC clause prohibits commercial use.

---

## Key Findings

1. **Remotion is the right host and already ships a transition system.** `@remotion/transitions` provides `<TransitionSeries>` with `<TransitionSeries.Transition>` (shortens timeline, both scenes render together) and `<TransitionSeries.Overlay>` (effect on top of the cut without shortening). Built-in presentations: `fade()`, `slide()`, `wipe()`, `flip()`, `clockWipe()`, `iris()`, `none()`, plus newer HTML-in-canvas shader presentations `zoomBlur()`, `dreamyZoom()`, `filmBurn()`, `linearBlur()`, `bookFlip()`, `zoomInOut()`, `dissolve()`, and the paid `cube()`. Timings: `linearTiming({durationInFrames})` and `springTiming({config, durationInFrames})`. Per Remotion's docs, because both scenes render during the overlap, durations compound: with A visible 40 frames, B 60 frames and a 30-frame transition, "the total duration of the animation is 60 + 40 - 30 = 70." Remotion's own Scene Transitions skill docs advise: "Don't make transitions too long — 15-25 frames is usually sufficient. Longer transitions feel sluggish."

2. **Every effect maps cleanly to a single normalized progress value**, which is exactly the gl-transitions spec (`progress` float 0→1, with `getFromColor(uv)`/`getToColor(uv)`) and exactly Remotion's model (`useCurrentFrame()` → `interpolate()`/`spring()`). This makes a registry of `{id, params, engine, render(progress, ctx)}` objects trivial and portable.

3. **WebGL is only needed for true per-pixel warps/displacement.** Dissolves, wipes, slides, pushes, simple zoom/Ken Burns, flips, parallax, and CSS-style 3D can be done in Canvas2D / CSS transforms. Reserve GLSL for crosswarp, directional warp, morph, ripple, displacement, glitch/RGB-split, page curl, kaleidoscope, and radial/zoom blur.

4. **Critical Remotion shader caveat — the time convention is reversed vs gl-transitions.** Per Remotion's `makeHtmlInCanvasPresentation()` docs: "time = 0 means the shader should output the entering scene fully (i.e. transition end), and time = 1 means the shader should output the exiting scene fully (i.e. transition start)." Its porting guide instructs: "Map progress to Remotion's reversed convention with `float progress = 1.0 - u_time;` at the top of `main()`." Also swap `getFromColor→texture(u_prev,uv)` and `getToColor→texture(u_next,uv)`, and handle null boundary frames (force `time=0` when `prevImage` is null, `time=1` when `nextImage` is null).

5. **BPM-sync is a first-class Remotion capability.** `@remotion/media-utils` (MIT-licensed) provides `useAudioData()`, `getAudioData()`, `visualizeAudio()` (frequency, good for music), `getWaveformPortion()`/`visualizeAudioWaveform()` (volume), and `useWindowedAudioData()` for long tracks. Drive beat-reactive params from these, or precompute beat frames from BPM and trigger effects on those frames.

---

## Engine & Library Recommendations (scored, ranked, additive-first)

Scoring: Remotion compatibility / License / Learning curve / Additive vs Migration / Performance.

### Tier 1 — Adopt (additive, low risk)

**1. `@remotion/transitions` — ADOPT (core).** Remotion compat: native. License: Remotion is source-available, free for individuals/small companies, paid company license at scale (the `media-utils`, `paths` packages themselves are MIT; the `cube()` transition is a paid Remotion Pro component). Learning curve: low. Additive: yes — it's the host. Performance: deterministic frame-accurate render. **Verdict: foundation of the whole pipeline.**

**2. gl-transitions (as shader source) — ADOPT.** Remotion compat: port via `makeHtmlInCanvasPresentation()` or run in your own WebGL pass. License: ~118/120 MIT, plus BSD-3 (`InvertedPageCurl`) and BSD-2 (`StereoViewer`) — all commercially safe with attribution. Learning curve: low-medium (copy GLSL, remap progress). Additive: yes (drop-in shaders for your existing WebGL engine). Performance: GPU, excellent. **Verdict: your transition warp library.**

**3. GSAP — ADOPT (authoring/easing helper, optional).** GSAP is 100% free as of April 30, 2025, per Webflow's official announcement (gsap.com/pricing): "thanks to Webflow's generous support, we're able to offer the entire GSAP library for free" — released alongside GSAP v3.13, following Webflow's October 15, 2024 acquisition of GreenSock; the expanded Standard license now explicitly covers commercial use (including former Club plugins SplitText, MorphSVG, DrawSVG, ScrollTrigger). Remotion compat: **caveat — do NOT use GSAP's internal ticker/real-time clock inside Remotion** (non-deterministic → flicker). Use GSAP only to author/compute values you then sample by frame, or prefer Remotion's `interpolate()`/`spring()`. Additive: yes for value generation. **Verdict: useful for easing math and as a design reference; not the render driver.**

**4. `@remotion/three` (Three.js / R3F) — ADOPT for 3D camera & perspective.** Remotion compat: native via `<ThreeCanvas width height>`; you MUST drive animation with `useCurrentFrame()`, never R3F's `useFrame()`. `useVideoTexture()` / `useOffthreadVideoTexture()` map Remotion video into textures. Set `<Sequence layout="none">` inside canvas; set renderer to `angle`. License: Three.js MIT. Additive: yes (a dedicated 3D layer alongside Canvas2D/WebGL). **Verdict: best route for genuine 3D camera moves, card/cube transitions, and perspective.**

**5. `@remotion/media-utils` — ADOPT for BPM-sync.** MIT, native. **Verdict: the beat engine.**

### Tier 2 — Optional / situational
- **Lottie (`@remotion/lottie`) — ADD if you have AE artists.** For pre-baked vector overlays (florals, light leaks, "Mr & Mrs" title cards). LottieFiles Simple License permits commercial use of marketplace files with attribution/ShareAlike-style terms. Additive.
- **Rive (`@remotion/rive`) — ADD only for interactive/state-driven graphics** (rarely needed for a linear render). Heavier runtime (~200KB gzipped WASM vs lottie-web's ~60KB). Additive but usually unnecessary for MP4 output.

### Tier 3 — Avoid for this pipeline (MIGRATION)
- **PixiJS — MIGRATION.** Powerful 2D WebGL, but it's a parallel render loop/scene graph that duplicates what your Canvas2D+WebGL+Remotion stack already does; integrating its ticker deterministically with Remotion is friction for little gain. Only justified if you need a large managed 2D sprite scene graph.
- **Babylon.js — MIGRATION.** Full game engine; overkill vs Three.js for video. No first-party Remotion package.
- **Theatre.js — MIGRATION-ish.** Excellent keyframe/sequence GUI for Three.js, but it's a separate animation authoring runtime that overlaps Remotion's timeline; deterministic frame sync is extra work. Use only as an offline design tool.
- **Motion Canvas — MIGRATION (replaces Remotion).** It's a competing programmatic-video tool (truly open source, MIT) with its own canvas API and imperative generator model. Per Remotion's own comparison, "Remotion is source-available software that requires a license for use in companies, while Motion Canvas is truly open source." Choosing it means abandoning React/Remotion. Don't mix.
- **Shadertoy / Hydra — SOURCE ONLY, with license care.** Great inspiration, but Shadertoy's default is CC BY-NC-SA 3.0 (NON-commercial). Do not port Shadertoy shaders into a paid wedding pipeline unless the specific shader declares MIT/CC0/public domain. Prefer gl-transitions equivalents.

---

## Deliverable 1 — TRANSITIONS Catalog (grouped by category)

Engine codes: **C2D** = Canvas 2D / CSS transform; **GL** = WebGL/GLSL; **E** = either. Tier: Core / Ext / Adv. gl-transitions shaders are MIT unless noted.

### Dissolve
| id | name | engine | key params | difficulty | source/license | tier | tags |
|---|---|---|---|---|---|---|---|
| crossfade | Crossfade / Dissolve | E | duration, easing | easy | Remotion `fade()` / gl `fade` MIT | Core | universal, elegant |
| dipToColor | Dip to Color (black/white) | C2D | color, midpoint, duration | easy | NLE standard / gl `fadecolor` MIT | Core | cinematic, wedding |
| filmDissolve | Film/grain dissolve | GL | grain, threshold | med | gl `dissolve` / Remotion `dissolve()` MIT | Ext | cinematic, retro |
| additiveDissolve | Additive (luma) dissolve | GL | bias | med | gl `luma` MIT | Ext | dreamy, wedding |
| randomSquares | Random squares dissolve | GL | size, smoothness | med | gl `randomsquares` MIT | Ext | energetic |
| pixelize | Pixelize dissolve | GL | squaresMin, steps | med | gl `pixelize` MIT | Ext | retro/8-bit |
| hsvFade | HSV color fade | GL | — | med | gl `HSVfade` MIT | Adv | stylish |

### Wipe
| id | name | engine | key params | difficulty | source/license | tier | tags |
|---|---|---|---|---|---|---|---|
| linearWipe | Linear/bar wipe | C2D | direction, softness | easy | Remotion `wipe()` MIT | Core | clean |
| clockWipe | Clock/radial wipe | E | clockwise, center | easy | Remotion `clockWipe()` MIT | Core | time, elegant |
| barnDoor | Barn door open/close | C2D | axis | easy | gl `HorizontalOpen/Close` MIT | Ext | classic |
| directionalWipe | Directional soft wipe | GL | direction, smoothness | med | gl `directionalwipe` MIT | Core | clean, modern |
| windowBlinds | Window blinds / venetian | C2D | count, direction | med | NLE standard | Ext | retro |
| angularWipe | Angular/radial sweep | GL | startingAngle | med | gl `angular` MIT | Ext | energetic |
| polkaDots | Polka dots curtain | GL | dots, center | med | gl `PolkaDotsCurtain` MIT | Ext | playful |
| waterDrop | Water drop ripple wipe | GL | amplitude, speed | med | gl `WaterDrop`/`ripple` MIT | Ext | dreamy |

### Slide / Push
| id | name | engine | key params | difficulty | source/license | tier | tags |
|---|---|---|---|---|---|---|---|
| slidePush | Slide push (8-dir) | C2D | direction | easy | Remotion `slide()` (from-left/top/right/bottom + corners) MIT | Core | clean |
| slideOver | Slide over (cover) | C2D | direction | easy | Remotion `wipe()` variant MIT | Core | modern |
| coverUncover | Cover / Uncover | C2D | direction | easy | NLE standard | Ext | classic |
| splitSlide | Split-slide (halves part) | GL | axis | med | gl `splitSlideInHorizontal` MIT | Ext | energetic |
| rolls | Rolls / sweep | GL | rotationDir | med | gl `Rolls` MIT | Ext | playful |

### Shape / Mask
| id | name | engine | key params | difficulty | source/license | tier | tags |
|---|---|---|---|---|---|---|---|
| irisCircle | Iris (circle in/out) | E | center, radius | easy | Remotion `iris()` MIT | Core | classic, wedding |
| circleCrop | Circle crop (color bg) | GL | bgcolor | easy | gl `circlecrop` MIT | Ext | clean |
| heart | Heart mask reveal | GL | center, size | easy | gl `heart` MIT | Ext | wedding, romantic |
| rectangleCrop | Rectangle/box reveal | GL | — | easy | gl `RectangleCrop` MIT | Ext | clean |
| starWipe | Star shape wipe | C2D | points, size | med | Remotion custom (`@remotion/shapes`+`paths`) MIT | Ext | playful |
| doorway | Doorway open | GL | reflection, depth | med | gl `doorway` MIT | Ext | dramatic |
| svgMaskReveal | Custom SVG-mask reveal | C2D | svgPath | med | `@remotion/paths` MIT | Adv | branded |

### Warp (GLSL-required)
| id | name | engine | key params | difficulty | source/license | tier | tags |
|---|---|---|---|---|---|---|---|
| crossWarp | Crosswarp (melt morph) | GL | — | med | gl `crosswarp` (Eke Péter) MIT | Core | dreamy, modern |
| directionalWarp | Directional warp | GL | direction | med | gl `directionalwarp` (pschroen) MIT | Ext | energetic |
| morph | Morph (displacement) | GL | strength | hard | gl `morph` (paniq) MIT | Adv | surreal |
| displacement | Texture displacement | GL | displacementMap, strength | hard | gl `displacement` MIT | Adv | stylish |
| ripple | Ripple / wave | GL | amplitude, speed | med | gl `ripple` MIT | Ext | dreamy |
| flyeye | Fly-eye lens warp | GL | size, zoom, colorSep | med | gl `flyeye` MIT | Ext | trippy |
| crossZoom | Cross zoom (blur warp) | GL | strength | med | gl `CrossZoom` MIT | Ext | energetic, cinematic |
| pageCurl | Inverted page curl | GL | — | hard | gl `InvertedPageCurl` **BSD-3 (HP)** | Adv | skeuomorphic |

### Glitch
| id | name | engine | key params | difficulty | source/license | tier | tags |
|---|---|---|---|---|---|---|---|
| rgbSplit | RGB split / chromatic | GL | offset, angle | med | common technique (write own) | Core | energetic, retro |
| glitchMemories | Glitch memories | GL | — | med | gl `GlitchMemories` (Gunnar Roth) MIT | Ext | energetic |
| glitchDisplace | Glitch displace | GL | — | med | gl `GlitchDisplace` MIT | Ext | energetic |
| vhs | VHS / tracking noise | GL | noise, scanline, tear | med | write own / overlay assets | Ext | retro, nostalgic |
| scanlines | CRT scanlines + bleed | GL | lineCount, curvature | med | write own | Ext | retro |
| datamoshSim | Datamosh-style smear | GL | blockiness | hard | simulated (true mosh = ffmpeg) | Adv | edgy |
| doomScreen | Doom-style melt | GL | bars, noise | med | gl `DoomScreenTransition` MIT | Ext | retro/gaming |

### 3D
| id | name | engine | key params | difficulty | source/license | tier | tags |
|---|---|---|---|---|---|---|---|
| flip3D | 3D flip (card) | E | direction, perspective | easy | Remotion `flip()` MIT | Core | playful |
| cube3D | Cube rotate | GL/3D | direction, perspective | med | gl `cube` (gre) MIT / Remotion `cube()` (paid) | Ext | dynamic |
| gridFlip | Grid flip tiles | GL | size, pause, bgcolor | med | gl `GridFlip` MIT | Ext | energetic |
| foldPaper | Fold | GL | — | med | gl `Fold` MIT | Ext | stylish |
| bookFlip | Book page turn | GL | — | med | Remotion `bookFlip()` MIT | Ext | elegant, storybook |
| rotateScaleFade | Rotate + scale + fade | GL | rotations, scale | med | gl `rotate_scale_fade` MIT | Ext | dynamic |
| stereoViewer | Stereo viewer | GL | zoom, corner radius | med | gl `StereoViewer` (Ted Schundler) **BSD-2** | Adv | retro |

### Light / Color
| id | name | engine | key params | difficulty | source/license | tier | tags |
|---|---|---|---|---|---|---|---|
| filmBurn | Film burn | GL | glow, blur | med | Remotion `filmBurn()` MIT | Core | cinematic, wedding |
| lightLeak | Light leak overlay | C2D/GL | color, position | easy | Remotion `@remotion/light-leaks` / asset | Core | dreamy, wedding |
| flashWhite | Flash / bloom cut | C2D | color, intensity | easy | write own | Core | energetic |
| overexposure | Overexposure bloom | GL | strength | med | gl `Overexposure` MIT | Ext | dreamy |
| bokehDissolve | Bokeh / defocus | GL | blurRadius | med | gl `DefocusBlur` MIT | Ext | wedding, romantic |
| colorDistance | Color-distance fade | GL | power | med | gl `ColourDistance` MIT | Ext | stylish |
| dreamyZoom | Dreamy zoom + flash | GL | rotation | med | Remotion `dreamyZoom()` MIT | Core | wedding, dreamy |

### Zoom / Blur
| id | name | engine | key params | difficulty | source/license | tier | tags |
|---|---|---|---|---|---|---|---|
| zoomBlur | Zoom + radial blur | GL | strength | easy | Remotion `zoomBlur()` MIT | Core | energetic |
| zoomInOut | Zoom in/out crossfade | GL | — | easy | Remotion `zoomInOut()` MIT | Core | modern |
| linearBlur | Directional blur blend | GL | direction, samples | med | Remotion `linearBlur()` MIT | Ext | smooth |
| simpleZoom | Simple zoom | GL | zoom_quickness | easy | gl `SimpleZoom` MIT | Ext | clean |
| swirl | Swirl / spin blur | GL | rotation, radius | med | gl `swirl`/`powerKaleido` MIT | Ext | trippy |
| whipPan | Whip-pan blur cut | C2D/GL | direction, blur | med | technique (motion blur) | Core | energetic |

### Particle
| id | name | engine | key params | difficulty | source/license | tier | tags |
|---|---|---|---|---|---|---|---|
| pixelExplode | Pixel/particle explode | GL | count, gravity | hard | write own / shader | Adv | energetic |
| confettiBurst | Confetti overlay | C2D | count, colors, gravity | med | write own / Lottie | Ext | celebration, wedding |
| petalFall | Falling petals/snow | C2D | density, drift | med | write own / Lottie | Ext | wedding, seasonal |
| sparkle | Sparkle/glitter overlay | C2D/GL | density, twinkle | med | write own / asset | Ext | wedding, glam |
| mosaicShatter | Mosaic shatter | GL | endx, endy | med | gl `Mosaic` MIT | Ext | dynamic |
| hexagonalize | Hexagon dissolve | GL | steps, horizontalHexagons | med | gl `hexagonalize` MIT | Ext | stylish |
| kaleidoscope | Kaleidoscope | GL | speed, angle, power | med | gl `kaleidoscope` MIT | Adv | trippy, energetic |

---

## Deliverable 2 — MOTIONS Catalog (single layer + camera moves)

### Ken Burns / Zoom
| id | name | engine | key params | difficulty | source/license | tier | tags |
|---|---|---|---|---|---|---|---|
| kenBurns | Ken Burns pan+zoom | C2D | startRect, endRect, easing | easy | Apple/standard technique | Core | documentary, wedding |
| slowZoomIn | Slow push-in | C2D | scaleStart, scaleEnd | easy | technique | Core | cinematic |
| slowZoomOut | Slow pull-out | C2D | scaleStart, scaleEnd | easy | technique | Core | reveal |
| pulseZoom | Beat-pulse zoom | C2D | amplitude, bpm | easy | `visualizeAudio()` | Core | energetic, BPM |
| smashZoom | Smash/snap zoom (w/ blur) | C2D | scale, blur | med | technique | Ext | energetic |
| focusBreath | Subtle breathing scale | C2D | amplitude, period | easy | loop technique | Ext | idle, elegant |

### Pan / Move
| id | name | engine | key params | difficulty | source/license | tier | tags |
|---|---|---|---|---|---|---|---|
| panLR | Pan left/right | C2D | from, to, easing | easy | technique | Core | clean |
| panUD | Pan up/down | C2D | from, to | easy | technique | Core | clean |
| parallaxPan | Parallax multi-layer pan | C2D | layerSpeeds | med | Remotion parallax (`interpolate` on translateX) | Core | depth, cinematic |
| driftFloat | Slow drift / float | C2D | dx, dy, period | easy | loop technique | Ext | idle, dreamy |
| kineticText | Kinetic text slide/stagger | C2D | stagger, direction | med | GSAP SplitText / Remotion | Ext | energetic, titles |

### Path
| id | name | engine | key params | difficulty | source/license | tier | tags |
|---|---|---|---|---|---|---|---|
| motionPath | Follow SVG path | C2D | svgPath, align | med | `@remotion/paths` `getPointAtLength()` MIT | Core | dynamic |
| arcMove | Arc / curved move | C2D | controlPoints | med | path technique | Ext | natural (arcs) |
| orbit | Orbit around point | C2D | radius, center, revolutions | med | trig technique | Ext | playful |
| drawOn | Draw-on stroke (signature) | C2D | path, strokeSpeed | med | `@remotion/paths` `evolvePath()` MIT | Ext | wedding, elegant |
| bezierFloat | Bezier wander | C2D | points | med | path technique | Adv | organic |

### Physics / Spring
| id | name | engine | key params | difficulty | source/license | tier | tags |
|---|---|---|---|---|---|---|---|
| springPop | Spring scale-in | C2D | mass, damping, stiffness | easy | Remotion `spring()` MIT | Core | playful, titles |
| bounceIn | Bounce in/drop | C2D | gravity, restitution | easy | easings `easeOutBounce` | Core | playful |
| elasticIn | Elastic overshoot | C2D | amplitude, period | easy | easings `easeOutElastic` | Core | energetic |
| jiggleWobble | Wobble / jello | C2D | amplitude, decay | easy | Animate.css `jello`/`wobble` (MIT) | Ext | playful |
| inertiaSlide | Inertia / flick decay | C2D | velocity, friction | med | physics technique | Ext | natural |
| squashStretch | Squash & stretch | C2D | factor (volume-preserving) | med | 12 principles of animation | Ext | cartoony |
| pendulum | Pendulum swing | C2D | angle, damping | med | physics | Adv | playful |

### 3D / Perspective
| id | name | engine | key params | difficulty | source/license | tier | tags |
|---|---|---|---|---|---|---|---|
| tiltPerspective | 3D tilt / card | C2D/3D | rotX, rotY, perspective | easy | CSS transform | Core | modern |
| flip3DLayer | Single-layer 3D flip | C2D/3D | axis, perspective | easy | CSS / Three | Ext | playful |
| cardStack | Card stack/peel | 3D | spacing, angle | med | `@remotion/three` MIT | Ext | gallery |
| photoFloat3D | 2.5D depth float | 3D | depthMap, amplitude | hard | Three depth-displacement | Adv | cinematic, parallax |
| revolve3D | 3D revolve/turntable | 3D | axis, revolutions | med | `@remotion/three` MIT | Adv | showcase |

### Camera (cinematic terminology)
| id | name | engine | key params | difficulty | source/license | tier | tags |
|---|---|---|---|---|---|---|---|
| dollyInOut | Dolly in/out (move toward/away) | C2D/3D | distance, easing | easy | film term | Core | cinematic |
| truck | Truck (lateral move) | C2D/3D | dx | easy | film term | Core | cinematic |
| pedestal | Pedestal (whole-camera vertical move) | C2D/3D | dy | easy | film term | Ext | cinematic |
| panCam | Pan (rotate horiz on axis) | 3D | angle | easy | film term | Core | cinematic |
| tiltCam | Tilt (rotate vert on axis) | 3D | angle | easy | film term | Ext | cinematic |
| zoomLens | Zoom (focal-length change) | C2D | focalStart, focalEnd | easy | film term | Core | cinematic |
| rackFocus | Rack focus (blur shift, no move) | GL | nearBlur, farBlur | med | film term (depth blur) | Ext | cinematic, romantic |
| dollyZoom | Dolly zoom (Vertigo) | 3D | dolly vs zoom rate | hard | Hitchcock/Vertigo | Adv | dramatic |
| whipPanCam | Whip pan (fast blur) | C2D/GL | direction, blur | med | film term | Core | energetic |
| craneJib | Crane / jib (boom up/down) | 3D | path, height | med | film term | Ext | grand, establishing |
| arcShot | Arc / 360 orbit | 3D | radius, degrees | med | film term | Ext | showcase |
| handheld | Handheld shake | C2D | amplitude, noiseSeed | easy | Perlin noise (`@remotion/noise`) | Core | documentary, energetic |
| dutchAngle | Dutch tilt / cant | C2D | rollAngle | easy | film term | Ext | tension, edgy |
| steadicamFollow | Steadicam follow | C2D/3D | path, smoothing | med | film term | Adv | immersive |

### Loop / Idle
| id | name | engine | key params | difficulty | source/license | tier | tags |
|---|---|---|---|---|---|---|---|
| breathingLoop | Breathing scale loop | C2D | amplitude, period | easy | loop | Core | idle |
| floatLoop | Float bob loop | C2D | dy, period | easy | loop | Core | idle, dreamy |
| swayLoop | Sway/rotate loop | C2D | angle, period | easy | loop | Ext | idle |
| shimmerLoop | Shimmer/gradient sweep | C2D/GL | speed, color | med | loop | Ext | glam, titles |
| pulseGlow | Glow pulse loop | C2D | intensity, period | easy | loop | Ext | romantic |
| grainLoop | Film grain overlay loop | GL | intensity | easy | overlay | Ext | cinematic, retro |

### Beat-reactive (BPM-sync)
| id | name | engine | key params | difficulty | source/license | tier | tags |
|---|---|---|---|---|---|---|---|
| beatPulse | Scale pulse on beat | C2D | bpm/`visualizeAudio`, amplitude | easy | `@remotion/media-utils` MIT | Core | BPM, energetic |
| beatShake | Shake/kick on beat | C2D | amplitude, decay | easy | media-utils | Core | BPM, energetic |
| beatFlash | Flash/strobe on beat | C2D | color, threshold | easy | media-utils | Core | BPM, club |
| beatColorCycle | Color cycle on beat | C2D/GL | palette | med | media-utils | Ext | BPM |
| audioBars | Frequency spectrum bars | C2D | numberOfSamples (power of 2) | easy | `visualizeAudio()` MIT | Ext | music viz |
| waveform | Waveform ribbon | C2D | windowInSeconds | med | `visualizeAudioWaveform()` MIT | Ext | music viz |
| beatZoomCut | Beat-synced zoom cuts | C2D | bpm | med | media-utils | Ext | BPM, energetic |
| bassWarp | Bass-driven warp | GL | freqBand, strength | hard | media-utils + GLSL | Adv | club, energetic |

---

## Deliverable 3 — Core Starter Set (widest range, least build effort)

**~15 Transitions** (all are Remotion built-ins or trivial CSS, except 3 easy GLSL ports):
1. `crossfade` (fade) 2. `dipToColor` 3. `slidePush` (slide) 4. `linearWipe` (wipe) 5. `clockWipe` 6. `irisCircle` (iris) 7. `flip3D` (flip) 8. `zoomBlur` 9. `zoomInOut` 10. `dreamyZoom` 11. `filmBurn` 12. `lightLeak` 13. `whipPan` 14. `crossWarp` (first GLSL port) 15. `rgbSplit` (glitch staple).

These cover: subtle/elegant (fade, dip, iris, light leak, film burn, dreamy zoom), directional/energetic (slide, wipe, whip, zoom blur, RGB split), playful (flip), and one "true warp" (crosswarp). 12 require no shader work.

**~15 Motions:**
1. `kenBurns` 2. `slowZoomIn` 3. `panLR` 4. `parallaxPan` 5. `springPop` 6. `bounceIn` 7. `dollyInOut` 8. `handheld` 9. `whipPanCam` 10. `tiltPerspective` 11. `breathingLoop` 12. `floatLoop` 13. `beatPulse` 14. `beatFlash` 15. `motionPath`.

These cover Ken Burns/zoom, pan/parallax, spring/physics, the most-used camera moves, idle loops for held shots, BPM-reactive, and path-following — almost all pure Canvas2D/CSS + Remotion primitives.

---

## Deliverable 4 — Licensing & Engine-Requirement Notes

**gl-transitions (per-shader, verified against the auto-generated `gl-transitions.json` manifest):**
- ~118 of ~120 shaders declare `// License: MIT` (verified: crosswarp [Eke Péter], cube [gre], directionalwarp [pschroen], morph [paniq], GlitchMemories [Gunnar Roth], doorway [gre], PolkaDotsCurtain [bobylito], pixelize [gre] — all plain MIT).
- **Two exceptions, both still commercially safe with attribution:**
  - `InvertedPageCurl` — Author: Hewlett-Packard — `// License: BSD 3 Clause`. Header: "Copyright (c) 2010 Hewlett-Packard Development Company, L.P. All rights reserved." This is the SPDX BSD-3-Clause-HP variant, which adds patent infringement to the disclaimer and retains the non-endorsement clause.
  - `StereoViewer` — Author: Ted Schundler — `// License: BSD 2 Clause` ("Free for use and modification by anyone with credit"; Copyright (c) 2016 Theodore K Schundler).
- No GPL/LGPL, CC, "Custom", dual, or missing licenses in the collection. The npm package overall is MIT, but per-file BSD headers govern those two files. **Action:** keep MIT/BSD notices in your source/credits when redistributing shader code; rendered video output itself carries no practical restriction.

**Other licenses:** GSAP — free for commercial use since April 30, 2025 (Webflow), per gsap.com/pricing. Three.js / PixiJS / Babylon.js — MIT. Animate.css — MIT. easings.net equations (Robert Penner) — free. `@remotion/media-utils`, `@remotion/paths` — MIT. Remotion core — source-available; **company license required at scale** (verify against current Remotion licensing for your studio size). `cube()` is a paid Remotion Pro component. Lottie marketplace files — LottieFiles Simple License (commercial OK, ShareAlike-style). **Shadertoy default — CC BY-NC-SA 3.0 (NON-commercial): per Shadertoy's Terms, an unlicensed shader defaults to this; the NC clause prohibits commercial use, so do not port verbatim into paid work.**

**What truly needs WebGL vs Canvas2D:**
- **Canvas2D / CSS transforms are sufficient for:** all fades/dips, wipes, slides/pushes, iris/shape masks (via clip-path/`@remotion/paths`), Ken Burns, pans, parallax, spring/bounce/elastic, CSS 3D flip/tilt, handheld/dutch, loops, and most beat-reactive scale/flash/shake.
- **WebGL/GLSL is required for:** crosswarp/directional warp/morph/displacement, ripple/flyeye, cross-zoom & radial zoom blur, page curl, kaleidoscope/swirl, RGB-split/glitch/VHS/scanlines, bokeh/defocus, and bass-driven warps.
- **Three.js (`@remotion/three`) is the clean path for:** genuine 3D camera (dolly/truck/pedestal/pan/tilt/crane/arc/dolly-zoom), cube/card-stack/turntable, and 2.5D depth-map float.

---

## Recommendations (staged)

**Stage 1 — Foundation (week 1).** Stand up Remotion + `<TransitionSeries>`. Build the registry schema: `{id, name, category, engine, tier, params, tags, render}`. Implement the 15+15 Core set using only `@remotion/transitions` presets + CSS/Canvas2D + `interpolate()`/`spring()`. Wire `useAudioData()`/`visualizeAudio()` for `beatPulse`/`beatFlash`. Keep transition durations in the 15–25 frame band per Remotion's guidance. **Benchmark to advance:** a full wedding walk-in sequence renders deterministically (no flicker) on CLI/Lambda.

**Stage 2 — Shader layer (week 2–3).** Add a generic `makeHtmlInCanvasPresentation()` wrapper that ingests gl-transitions GLSL (auto-applying `progress = 1.0 - u_time`, texture remap, null-boundary handling). Port the Extended GLSL transitions (crosswarp, directionalwarp, crossZoom, ripple, filmDissolve, pixelize, glitch family). Keep a per-shader license field in the registry; auto-emit a credits file. **Threshold:** HTML-in-canvas preview is browser-gated — per Remotion's docs it requires "Chrome 149 and later with the `chrome://flags/#canvas-draw-element` flag enabled" (the underlying API is in origin trial in Chrome 148–150), though Remotion notes server-side render support is built in "From v4.0.455 ... locally via `npx remotion render` and Studio, on Lambda, on Vercel." If the preview-flag friction blocks your team, fall back to running shaders in your own WebGL pass feeding a Remotion `<canvas>` via `delayRender()`.

**Stage 3 — 3D & showcase (week 4+).** Add `@remotion/three` for true camera moves and cube/card/turntable/2.5D-depth effects. Add Lottie overlays if you have AE artists for branded florals/titles. **Threshold to add Three.js:** only when a storyboard needs real perspective parallax or a 3D object; otherwise CSS 3D suffices.

**Decision triggers that change the plan:**
- If you need a managed 2D sprite scene-graph with thousands of elements → reconsider PixiJS (accept MIGRATION cost).
- If Remotion company-license cost is prohibitive and you don't need React → evaluate Motion Canvas (full MIGRATION).
- If you need designer-driven interactive state graphics → add Rive selectively.

---

## Caveats
- **Remotion time convention is reversed vs gl-transitions** (`u_time=0` = entering scene fully). Every shader port must invert progress (`float progress = 1.0 - u_time;`) or transitions will play backward.
- **Never drive animation from real-time clocks (GSAP ticker, R3F `useFrame()`, CSS animations) inside Remotion** — it causes flicker/non-determinism. Always sample `useCurrentFrame()`.
- **HTML-in-canvas preview** currently needs Chrome 149+ with a flag (API in origin trial through Chrome 150); this is a moving target — verify current Remotion/Chrome support before committing the team's preview workflow to it. Server-side render does not need the flag.
- **Remotion licensing**: source-available, free for individuals/small teams but requires a paid company license above a threshold — confirm against current terms for your studio.
- **Effect-name accuracy:** gl-transitions IDs are case-sensitive and a few have aliases across forks (e.g. `PolkaDotsCurtain` vs `polkaDotsCurtain`, `crosszoom`/`CrossZoom`). Always resolve against the live `gl-transitions.json` manifest at build time.
- Several catalog entries marked "write own" (RGB split, VHS, scanlines, particle systems, datamosh-sim) are standard techniques without a single canonical MIT source — budget custom shader/JS time rather than assuming a drop-in.
- `visualizeAudio()` via `useAudioData()` loads the whole file into memory; for long reception tracks use `useWindowedAudioData()`. `numberOfSamples` must be a power of two.
- "Datamosh" proper requires codec-level frame manipulation (ffmpeg/Avidemux deleting I-frames), not a real-time shader — the catalog's `datamoshSim` only approximates the smear look.
- The `cube()` Remotion transition is a paid Pro component; the MIT gl-transitions `cube` shader is a free alternative you can port.