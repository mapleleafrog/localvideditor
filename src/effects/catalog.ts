import type { CatalogEntry } from "./types";

/**
 * The full effect catalog as metadata (Appendix C of the spec + the new Depth
 * and Pixel-art families). This is the SINGLE SOURCE OF TRUTH for effect
 * metadata. Every row is `status: "todo"` here; `motions.ts` / `transitions.ts`
 * import this array and override the implemented ids to `status: "ready"` with
 * a `style()` / `presentation()`.
 *
 * `engine` reflects how the effect is (or will be) implemented:
 *   css   — pure CSS transform/filter/clip (works everywhere, no flags)
 *   webgl — Remotion HTML-in-canvas shader presentation (render OK; Studio
 *           preview needs Chrome 149+ w/ chrome://flags/#canvas-draw-element)
 *   three — needs @remotion/three (NOT built this stage — stays todo)
 *   canvas/either — 2D canvas or either engine
 */
export const CATALOG: CatalogEntry[] = [
  // ============================== TRANSITIONS ==============================

  // --- Dissolve ---
  { kind: "transition", id: "crossfade", name: "Crossfade / Dissolve", category: "Dissolve", engine: "either", tier: "Core", status: "todo", tags: ["universal", "elegant"], license: "MIT" },
  { kind: "transition", id: "dipToColor", name: "Dip to Color", category: "Dissolve", engine: "css", tier: "Core", status: "todo", tags: ["cinematic", "wedding"], license: "MIT" },
  { kind: "transition", id: "filmDissolve", name: "Film / Grain Dissolve", category: "Dissolve", engine: "webgl", tier: "Ext", status: "todo", tags: ["cinematic", "retro"], license: "MIT" },
  { kind: "transition", id: "additiveDissolve", name: "Additive (Luma) Dissolve", category: "Dissolve", engine: "webgl", tier: "Ext", status: "todo", tags: ["dreamy", "wedding"], license: "MIT" },
  { kind: "transition", id: "randomSquares", name: "Random Squares Dissolve", category: "Dissolve", engine: "css", tier: "Ext", status: "todo", tags: ["energetic", "pixel"], license: "MIT" },
  { kind: "transition", id: "pixelize", name: "Pixelize Dissolve", category: "Dissolve", engine: "css", tier: "Ext", status: "todo", tags: ["retro", "8-bit", "pixel"], license: "MIT" },
  { kind: "transition", id: "hsvFade", name: "HSV Color Fade", category: "Dissolve", engine: "webgl", tier: "Adv", status: "todo", tags: ["stylish"], license: "MIT" },

  // --- Wipe ---
  { kind: "transition", id: "linearWipe", name: "Linear / Bar Wipe", category: "Wipe", engine: "css", tier: "Core", status: "todo", tags: ["clean"], license: "MIT" },
  { kind: "transition", id: "clockWipe", name: "Clock / Radial Wipe", category: "Wipe", engine: "either", tier: "Core", status: "todo", tags: ["time", "elegant"], license: "MIT" },
  { kind: "transition", id: "barnDoor", name: "Barn Door", category: "Wipe", engine: "css", tier: "Ext", status: "todo", tags: ["classic"], license: "MIT" },
  { kind: "transition", id: "directionalWipe", name: "Directional Soft Wipe", category: "Wipe", engine: "webgl", tier: "Core", status: "todo", tags: ["clean", "modern"], license: "MIT" },
  { kind: "transition", id: "windowBlinds", name: "Window Blinds", category: "Wipe", engine: "css", tier: "Ext", status: "todo", tags: ["retro"] },
  { kind: "transition", id: "angularWipe", name: "Angular Wipe", category: "Wipe", engine: "webgl", tier: "Ext", status: "todo", tags: ["energetic"], license: "MIT" },
  { kind: "transition", id: "polkaDots", name: "Polka Dots Curtain", category: "Wipe", engine: "webgl", tier: "Ext", status: "todo", tags: ["playful"], license: "MIT", credit: "bobylito (gl-transitions)" },
  { kind: "transition", id: "waterDrop", name: "Water Drop Ripple Wipe", category: "Wipe", engine: "webgl", tier: "Ext", status: "todo", tags: ["dreamy"], license: "MIT" },

  // --- Slide / Push ---
  { kind: "transition", id: "slidePush", name: "Slide Push (8-dir)", category: "Slide / Push", engine: "css", tier: "Core", status: "todo", tags: ["clean"], license: "MIT" },
  { kind: "transition", id: "slideOver", name: "Slide Over (cover)", category: "Slide / Push", engine: "css", tier: "Core", status: "todo", tags: ["modern"], license: "MIT" },
  { kind: "transition", id: "coverUncover", name: "Cover / Uncover", category: "Slide / Push", engine: "css", tier: "Ext", status: "todo", tags: ["classic"] },
  { kind: "transition", id: "splitSlide", name: "Split Slide", category: "Slide / Push", engine: "webgl", tier: "Ext", status: "todo", tags: ["energetic"], license: "MIT" },
  { kind: "transition", id: "rolls", name: "Rolls / Sweep", category: "Slide / Push", engine: "webgl", tier: "Ext", status: "todo", tags: ["playful"], license: "MIT" },

  // --- Shape / Mask ---
  { kind: "transition", id: "irisCircle", name: "Iris (circle in/out)", category: "Shape / Mask", engine: "either", tier: "Core", status: "todo", tags: ["classic", "wedding"], license: "MIT" },
  { kind: "transition", id: "circleCrop", name: "Circle Crop", category: "Shape / Mask", engine: "css", tier: "Ext", status: "todo", tags: ["clean"], license: "MIT" },
  { kind: "transition", id: "heart", name: "Heart Mask Reveal", category: "Shape / Mask", engine: "css", tier: "Ext", status: "todo", tags: ["wedding", "romantic"], license: "MIT" },
  { kind: "transition", id: "rectangleCrop", name: "Rectangle / Box Reveal", category: "Shape / Mask", engine: "css", tier: "Ext", status: "todo", tags: ["clean"], license: "MIT" },
  { kind: "transition", id: "starWipe", name: "Star Shape Wipe", category: "Shape / Mask", engine: "css", tier: "Ext", status: "todo", tags: ["playful"], license: "MIT" },
  { kind: "transition", id: "doorway", name: "Doorway Open", category: "Shape / Mask", engine: "css", tier: "Ext", status: "todo", tags: ["dramatic"], license: "MIT" },
  { kind: "transition", id: "svgMaskReveal", name: "Custom SVG-Mask Reveal", category: "Shape / Mask", engine: "css", tier: "Adv", status: "todo", tags: ["branded"], license: "MIT" },

  // --- Warp (GLSL) ---
  { kind: "transition", id: "crossWarp", name: "Crosswarp (melt morph)", category: "Warp", engine: "webgl", tier: "Core", status: "todo", tags: ["dreamy", "modern"], license: "MIT", credit: "Eke Péter (gl-transitions)" },
  { kind: "transition", id: "directionalWarp", name: "Directional Warp", category: "Warp", engine: "webgl", tier: "Ext", status: "todo", tags: ["energetic"], license: "MIT", credit: "pschroen (gl-transitions)" },
  { kind: "transition", id: "morph", name: "Morph (displacement)", category: "Warp", engine: "webgl", tier: "Adv", status: "todo", tags: ["surreal"], license: "MIT", credit: "paniq (gl-transitions)" },
  { kind: "transition", id: "displacement", name: "Texture Displacement", category: "Warp", engine: "webgl", tier: "Adv", status: "todo", tags: ["stylish"], license: "MIT" },
  { kind: "transition", id: "ripple", name: "Ripple / Wave", category: "Warp", engine: "webgl", tier: "Ext", status: "todo", tags: ["dreamy"], license: "MIT" },
  { kind: "transition", id: "flyeye", name: "Fly-eye Lens Warp", category: "Warp", engine: "webgl", tier: "Ext", status: "todo", tags: ["trippy"], license: "MIT" },
  { kind: "transition", id: "crossZoom", name: "Cross Zoom (blur warp)", category: "Warp", engine: "webgl", tier: "Ext", status: "todo", tags: ["energetic", "cinematic"], license: "MIT" },
  { kind: "transition", id: "pageCurl", name: "Inverted Page Curl", category: "Warp", engine: "webgl", tier: "Adv", status: "todo", tags: ["skeuomorphic"], license: "BSD-3-Clause-HP", credit: "Hewlett-Packard" },

  // --- Glitch ---
  { kind: "transition", id: "rgbSplit", name: "RGB Split / Chromatic", category: "Glitch", engine: "css", tier: "Core", status: "todo", tags: ["energetic", "retro"], license: "write-own" },
  { kind: "transition", id: "glitchMemories", name: "Glitch Memories", category: "Glitch", engine: "webgl", tier: "Ext", status: "todo", tags: ["energetic"], license: "MIT", credit: "Gunnar Roth (gl-transitions)" },
  { kind: "transition", id: "glitchDisplace", name: "Glitch Displace", category: "Glitch", engine: "webgl", tier: "Ext", status: "todo", tags: ["energetic"], license: "MIT" },
  { kind: "transition", id: "vhs", name: "VHS / Tracking Noise", category: "Glitch", engine: "webgl", tier: "Ext", status: "todo", tags: ["retro", "nostalgic"], license: "write-own" },
  { kind: "transition", id: "scanlines", name: "CRT Scanlines + Bleed", category: "Glitch", engine: "webgl", tier: "Ext", status: "todo", tags: ["retro"], license: "write-own" },
  { kind: "transition", id: "datamoshSim", name: "Datamosh-style Smear", category: "Glitch", engine: "webgl", tier: "Adv", status: "todo", tags: ["edgy"], license: "simulated" },
  { kind: "transition", id: "doomScreen", name: "Doom-style Melt", category: "Glitch", engine: "css", tier: "Ext", status: "todo", tags: ["retro", "gaming", "pixel"], license: "MIT" },

  // --- 3D ---
  { kind: "transition", id: "flip3D", name: "3D Flip (card)", category: "3D", engine: "either", tier: "Core", status: "todo", tags: ["playful"], license: "MIT" },
  { kind: "transition", id: "cube3D", name: "Cube Rotate", category: "3D", engine: "webgl", tier: "Ext", status: "todo", tags: ["dynamic"], license: "MIT", credit: "gre (gl-transitions) — NOT Remotion paid cube()" },
  { kind: "transition", id: "gridFlip", name: "Grid Flip Tiles", category: "3D", engine: "webgl", tier: "Ext", status: "todo", tags: ["energetic"], license: "MIT" },
  { kind: "transition", id: "foldPaper", name: "Fold", category: "3D", engine: "webgl", tier: "Ext", status: "todo", tags: ["stylish"], license: "MIT" },
  { kind: "transition", id: "bookFlip", name: "Book Page Turn", category: "3D", engine: "webgl", tier: "Ext", status: "todo", tags: ["elegant", "storybook"], license: "MIT" },
  { kind: "transition", id: "rotateScaleFade", name: "Rotate + Scale + Fade", category: "3D", engine: "webgl", tier: "Ext", status: "todo", tags: ["dynamic"], license: "MIT" },
  { kind: "transition", id: "stereoViewer", name: "Stereo Viewer", category: "3D", engine: "webgl", tier: "Adv", status: "todo", tags: ["retro"], license: "BSD-2-Clause", credit: "Ted Schundler (gl-transitions)" },

  // --- Light / Color ---
  { kind: "transition", id: "filmBurn", name: "Film Burn", category: "Light / Color", engine: "webgl", tier: "Core", status: "todo", tags: ["cinematic", "wedding"], license: "MIT" },
  { kind: "transition", id: "lightLeak", name: "Light Leak Overlay", category: "Light / Color", engine: "css", tier: "Core", status: "todo", tags: ["dreamy", "wedding"], license: "asset" },
  { kind: "transition", id: "flashWhite", name: "Flash / Bloom Cut", category: "Light / Color", engine: "css", tier: "Core", status: "todo", tags: ["energetic"], license: "write-own" },
  { kind: "transition", id: "overexposure", name: "Overexposure Bloom", category: "Light / Color", engine: "webgl", tier: "Ext", status: "todo", tags: ["dreamy"], license: "MIT" },
  { kind: "transition", id: "bokehDissolve", name: "Bokeh / Defocus", category: "Light / Color", engine: "webgl", tier: "Ext", status: "todo", tags: ["wedding", "romantic"], license: "MIT" },
  { kind: "transition", id: "colorDistance", name: "Color-distance Fade", category: "Light / Color", engine: "webgl", tier: "Ext", status: "todo", tags: ["stylish"], license: "MIT" },
  { kind: "transition", id: "dreamyZoom", name: "Dreamy Zoom + Flash", category: "Light / Color", engine: "css", tier: "Core", status: "todo", tags: ["wedding", "dreamy"], license: "MIT" },

  // --- Zoom / Blur ---
  { kind: "transition", id: "zoomBlur", name: "Zoom + Radial Blur", category: "Zoom / Blur", engine: "css", tier: "Core", status: "todo", tags: ["energetic"], license: "MIT" },
  { kind: "transition", id: "zoomInOut", name: "Zoom In/Out Crossfade", category: "Zoom / Blur", engine: "css", tier: "Core", status: "todo", tags: ["modern"], license: "MIT" },
  { kind: "transition", id: "linearBlur", name: "Directional Blur Blend", category: "Zoom / Blur", engine: "webgl", tier: "Ext", status: "todo", tags: ["smooth"], license: "MIT" },
  { kind: "transition", id: "simpleZoom", name: "Simple Zoom", category: "Zoom / Blur", engine: "css", tier: "Ext", status: "todo", tags: ["clean"], license: "MIT" },
  { kind: "transition", id: "swirl", name: "Swirl / Spin Blur", category: "Zoom / Blur", engine: "webgl", tier: "Ext", status: "todo", tags: ["trippy"], license: "MIT" },
  { kind: "transition", id: "whipPan", name: "Whip-pan Blur Cut", category: "Zoom / Blur", engine: "css", tier: "Core", status: "todo", tags: ["energetic"], license: "technique" },

  // --- Particle ---
  { kind: "transition", id: "pixelExplode", name: "Pixel / Particle Explode", category: "Particle", engine: "webgl", tier: "Adv", status: "todo", tags: ["energetic", "pixel"], license: "write-own" },
  { kind: "transition", id: "confettiBurst", name: "Confetti Overlay", category: "Particle", engine: "canvas", tier: "Ext", status: "todo", tags: ["celebration", "wedding"], license: "write-own" },
  { kind: "transition", id: "petalFall", name: "Falling Petals / Snow", category: "Particle", engine: "canvas", tier: "Ext", status: "todo", tags: ["wedding", "seasonal"], license: "write-own" },
  { kind: "transition", id: "sparkle", name: "Sparkle / Glitter Overlay", category: "Particle", engine: "canvas", tier: "Ext", status: "todo", tags: ["wedding", "glam"], license: "write-own" },
  { kind: "transition", id: "mosaicShatter", name: "Mosaic Shatter", category: "Particle", engine: "css", tier: "Ext", status: "todo", tags: ["dynamic", "pixel"], license: "MIT" },
  { kind: "transition", id: "hexagonalize", name: "Hexagon Dissolve", category: "Particle", engine: "webgl", tier: "Ext", status: "todo", tags: ["stylish"], license: "MIT" },
  { kind: "transition", id: "kaleidoscope", name: "Kaleidoscope", category: "Particle", engine: "webgl", tier: "Adv", status: "todo", tags: ["trippy", "energetic"], license: "MIT" },

  // =============================== MOTIONS ===============================

  // --- Ken Burns / Zoom ---
  { kind: "motion", id: "kenBurns", name: "Ken Burns Pan+Zoom", category: "Ken Burns / Zoom", engine: "css", tier: "Core", status: "todo", tags: ["documentary", "wedding"] },
  { kind: "motion", id: "slowZoomIn", name: "Slow Push-in", category: "Ken Burns / Zoom", engine: "css", tier: "Core", status: "todo", tags: ["cinematic"] },
  { kind: "motion", id: "slowZoomOut", name: "Slow Pull-out", category: "Ken Burns / Zoom", engine: "css", tier: "Core", status: "todo", tags: ["reveal"] },
  { kind: "motion", id: "pulseZoom", name: "Beat-pulse Zoom", category: "Ken Burns / Zoom", engine: "css", tier: "Core", status: "todo", tags: ["energetic", "BPM"] },
  { kind: "motion", id: "smashZoom", name: "Smash / Snap Zoom", category: "Ken Burns / Zoom", engine: "css", tier: "Ext", status: "todo", tags: ["energetic"] },
  { kind: "motion", id: "focusBreath", name: "Subtle Breathing Scale", category: "Ken Burns / Zoom", engine: "css", tier: "Ext", status: "todo", tags: ["idle", "elegant"] },

  // --- Pan / Move ---
  { kind: "motion", id: "panLR", name: "Pan Left/Right", category: "Pan / Move", engine: "css", tier: "Core", status: "todo", tags: ["clean"] },
  { kind: "motion", id: "panUD", name: "Pan Up/Down", category: "Pan / Move", engine: "css", tier: "Core", status: "todo", tags: ["clean"] },
  { kind: "motion", id: "parallaxPan", name: "Parallax Multi-layer Pan", category: "Pan / Move", engine: "css", tier: "Core", status: "todo", tags: ["depth", "cinematic"] },
  { kind: "motion", id: "driftFloat", name: "Slow Drift / Float", category: "Pan / Move", engine: "css", tier: "Ext", status: "todo", tags: ["idle", "dreamy"] },
  { kind: "motion", id: "kineticText", name: "Kinetic Text Slide", category: "Pan / Move", engine: "css", tier: "Ext", status: "todo", tags: ["energetic", "titles"] },

  // --- Path ---
  { kind: "motion", id: "motionPath", name: "Follow SVG Path", category: "Path", engine: "css", tier: "Core", status: "todo", tags: ["dynamic"] },
  { kind: "motion", id: "arcMove", name: "Arc / Curved Move", category: "Path", engine: "css", tier: "Ext", status: "todo", tags: ["natural"] },
  { kind: "motion", id: "orbit", name: "Orbit Around Point", category: "Path", engine: "css", tier: "Ext", status: "todo", tags: ["playful"] },
  { kind: "motion", id: "drawOn", name: "Draw-on Stroke", category: "Path", engine: "css", tier: "Ext", status: "todo", tags: ["wedding", "elegant"] },
  { kind: "motion", id: "bezierFloat", name: "Bezier Wander", category: "Path", engine: "css", tier: "Adv", status: "todo", tags: ["organic"] },

  // --- Physics / Spring ---
  { kind: "motion", id: "springPop", name: "Spring Scale-in", category: "Physics / Spring", engine: "css", tier: "Core", status: "todo", tags: ["playful", "titles"] },
  { kind: "motion", id: "bounceIn", name: "Bounce In / Drop", category: "Physics / Spring", engine: "css", tier: "Core", status: "todo", tags: ["playful"] },
  { kind: "motion", id: "elasticIn", name: "Elastic Overshoot", category: "Physics / Spring", engine: "css", tier: "Core", status: "todo", tags: ["energetic"] },
  { kind: "motion", id: "jiggleWobble", name: "Wobble / Jello", category: "Physics / Spring", engine: "css", tier: "Ext", status: "todo", tags: ["playful"], license: "MIT", credit: "Animate.css" },
  { kind: "motion", id: "inertiaSlide", name: "Inertia / Flick Decay", category: "Physics / Spring", engine: "css", tier: "Ext", status: "todo", tags: ["natural"] },
  { kind: "motion", id: "squashStretch", name: "Squash & Stretch", category: "Physics / Spring", engine: "css", tier: "Ext", status: "todo", tags: ["cartoony"] },
  { kind: "motion", id: "pendulum", name: "Pendulum Swing", category: "Physics / Spring", engine: "css", tier: "Adv", status: "todo", tags: ["playful"] },

  // --- 3D / Perspective ---
  { kind: "motion", id: "tiltPerspective", name: "3D Tilt / Card", category: "3D / Perspective", engine: "css", tier: "Core", status: "todo", tags: ["modern"] },
  { kind: "motion", id: "flip3DLayer", name: "Single-layer 3D Flip", category: "3D / Perspective", engine: "css", tier: "Ext", status: "todo", tags: ["playful"] },
  { kind: "motion", id: "cardStack", name: "Card Stack / Peel", category: "3D / Perspective", engine: "three", tier: "Ext", status: "todo", tags: ["gallery"], license: "MIT" },
  { kind: "motion", id: "photoFloat3D", name: "2.5D Depth Float", category: "3D / Perspective", engine: "three", tier: "Adv", status: "todo", tags: ["cinematic", "parallax"] },
  { kind: "motion", id: "revolve3D", name: "3D Revolve / Turntable", category: "3D / Perspective", engine: "three", tier: "Adv", status: "todo", tags: ["showcase"], license: "MIT" },

  // --- Camera (CSS analogs of cinematic moves) ---
  { kind: "motion", id: "dollyInOut", name: "Dolly In/Out", category: "Camera", engine: "css", tier: "Core", status: "todo", tags: ["cinematic"] },
  { kind: "motion", id: "truck", name: "Truck (lateral)", category: "Camera", engine: "css", tier: "Core", status: "todo", tags: ["cinematic"] },
  { kind: "motion", id: "pedestal", name: "Pedestal (vertical)", category: "Camera", engine: "css", tier: "Ext", status: "todo", tags: ["cinematic"] },
  { kind: "motion", id: "panCam", name: "Pan (rotate horiz)", category: "Camera", engine: "css", tier: "Core", status: "todo", tags: ["cinematic"] },
  { kind: "motion", id: "tiltCam", name: "Tilt (rotate vert)", category: "Camera", engine: "css", tier: "Ext", status: "todo", tags: ["cinematic"] },
  { kind: "motion", id: "zoomLens", name: "Zoom (focal length)", category: "Camera", engine: "css", tier: "Core", status: "todo", tags: ["cinematic"] },
  { kind: "motion", id: "rackFocus", name: "Rack Focus (blur shift)", category: "Camera", engine: "css", tier: "Ext", status: "todo", tags: ["cinematic", "romantic"] },
  { kind: "motion", id: "dollyZoom", name: "Dolly Zoom (Vertigo)", category: "Camera", engine: "css", tier: "Adv", status: "todo", tags: ["dramatic"] },
  { kind: "motion", id: "whipPanCam", name: "Whip Pan (fast blur)", category: "Camera", engine: "css", tier: "Core", status: "todo", tags: ["energetic"] },
  { kind: "motion", id: "craneJib", name: "Crane / Jib (boom)", category: "Camera", engine: "css", tier: "Ext", status: "todo", tags: ["grand", "establishing"] },
  { kind: "motion", id: "arcShot", name: "Arc / 360 Orbit", category: "Camera", engine: "css", tier: "Ext", status: "todo", tags: ["showcase"] },
  { kind: "motion", id: "handheld", name: "Handheld Shake", category: "Camera", engine: "css", tier: "Core", status: "todo", tags: ["documentary", "energetic"] },
  { kind: "motion", id: "dutchAngle", name: "Dutch Tilt / Cant", category: "Camera", engine: "css", tier: "Ext", status: "todo", tags: ["tension", "edgy"] },
  { kind: "motion", id: "steadicamFollow", name: "Steadicam Follow", category: "Camera", engine: "css", tier: "Adv", status: "todo", tags: ["immersive"] },

  // --- Loop / Idle ---
  { kind: "motion", id: "breathingLoop", name: "Breathing Scale Loop", category: "Loop / Idle", engine: "css", tier: "Core", status: "todo", tags: ["idle"] },
  { kind: "motion", id: "floatLoop", name: "Float Bob Loop", category: "Loop / Idle", engine: "css", tier: "Core", status: "todo", tags: ["idle", "dreamy"] },
  { kind: "motion", id: "swayLoop", name: "Sway / Rotate Loop", category: "Loop / Idle", engine: "css", tier: "Ext", status: "todo", tags: ["idle"] },
  { kind: "motion", id: "shimmerLoop", name: "Shimmer Gradient Sweep", category: "Loop / Idle", engine: "css", tier: "Ext", status: "todo", tags: ["glam", "titles"] },
  { kind: "motion", id: "pulseGlow", name: "Glow Pulse Loop", category: "Loop / Idle", engine: "css", tier: "Ext", status: "todo", tags: ["romantic"] },
  { kind: "motion", id: "grainLoop", name: "Film Grain Overlay Loop", category: "Loop / Idle", engine: "css", tier: "Ext", status: "todo", tags: ["cinematic", "retro"] },

  // --- Beat-reactive ---
  { kind: "motion", id: "beatPulse", name: "Scale Pulse on Beat", category: "Beat-reactive", engine: "css", tier: "Core", status: "todo", tags: ["BPM", "energetic"] },
  { kind: "motion", id: "beatFlash", name: "Flash / Strobe on Beat", category: "Beat-reactive", engine: "css", tier: "Core", status: "todo", tags: ["BPM", "club"] },
  { kind: "motion", id: "beatShake", name: "Shake / Kick on Beat", category: "Beat-reactive", engine: "css", tier: "Core", status: "todo", tags: ["BPM", "energetic"] },
  { kind: "motion", id: "beatColorCycle", name: "Color Cycle on Beat", category: "Beat-reactive", engine: "css", tier: "Ext", status: "todo", tags: ["BPM"] },
  { kind: "motion", id: "audioBars", name: "Frequency Spectrum Bars", category: "Beat-reactive", engine: "css", tier: "Ext", status: "todo", tags: ["music viz"], license: "MIT" },
  { kind: "motion", id: "waveform", name: "Waveform Ribbon", category: "Beat-reactive", engine: "css", tier: "Ext", status: "todo", tags: ["music viz"], license: "MIT" },
  { kind: "motion", id: "beatZoomCut", name: "Beat-synced Zoom Cuts", category: "Beat-reactive", engine: "css", tier: "Ext", status: "todo", tags: ["BPM", "energetic"] },
  { kind: "motion", id: "bassWarp", name: "Bass-driven Warp", category: "Beat-reactive", engine: "webgl", tier: "Adv", status: "todo", tags: ["club", "energetic"] },

  // --- Depth / 2.5D (NEW — the wedding-video depth vision) ---
  { kind: "motion", id: "dropShadowLift", name: "Drop-shadow Lift", category: "Depth / 2.5D", engine: "css", tier: "Core", status: "todo", tags: ["depth", "wedding"] },
  { kind: "motion", id: "bevelEmboss", name: "Bevel / Emboss", category: "Depth / 2.5D", engine: "css", tier: "Core", status: "todo", tags: ["depth", "ui"] },
  { kind: "motion", id: "parallaxDepth", name: "Parallax Depth Layer", category: "Depth / 2.5D", engine: "css", tier: "Core", status: "todo", tags: ["depth", "cinematic"] },
  { kind: "motion", id: "floatShadow", name: "Float with Ground Shadow", category: "Depth / 2.5D", engine: "css", tier: "Core", status: "todo", tags: ["depth", "idle"] },
  { kind: "motion", id: "tiltShadow", name: "Tilt with Shadow Follow", category: "Depth / 2.5D", engine: "css", tier: "Ext", status: "todo", tags: ["depth", "playful"] },
  { kind: "motion", id: "popLayer", name: "Pop Toward Camera", category: "Depth / 2.5D", engine: "css", tier: "Ext", status: "todo", tags: ["depth", "energetic"] },

  // --- Pixel-art (NEW — featured aesthetic) ---
  { kind: "motion", id: "pixelBob", name: "Stepped Pixel Bob", category: "Pixel-art", engine: "css", tier: "Core", status: "todo", tags: ["pixel", "idle"] },
  { kind: "motion", id: "spriteBlink", name: "Sprite Blink", category: "Pixel-art", engine: "css", tier: "Ext", status: "todo", tags: ["pixel", "retro"] },
  { kind: "motion", id: "paletteCycle", name: "Palette Hue Cycle", category: "Pixel-art", engine: "css", tier: "Ext", status: "todo", tags: ["pixel", "retro"] },
  { kind: "motion", id: "pixelShake", name: "Integer-pixel Shake", category: "Pixel-art", engine: "css", tier: "Core", status: "todo", tags: ["pixel", "energetic"] },
  { kind: "motion", id: "crtScanlines", name: "CRT Scanline Overlay", category: "Pixel-art", engine: "css", tier: "Ext", status: "todo", tags: ["pixel", "retro"] },
  { kind: "motion", id: "stepWalk", name: "Stepped Walk Cycle", category: "Pixel-art", engine: "css", tier: "Ext", status: "todo", tags: ["pixel", "game"] },

  // --- Retro / FX (NEW — advanced "impressive retro" sprite + overlay effects) ---
  { kind: "motion", id: "neonGlow", name: "Neon Glow Pulse", category: "Retro / FX", engine: "css", tier: "Core", status: "todo", tags: ["retro", "neon", "glow"] },
  { kind: "motion", id: "chromaPulse", name: "Chromatic Aberration Pulse", category: "Retro / FX", engine: "css", tier: "Ext", status: "todo", tags: ["retro", "glitch"] },
  { kind: "motion", id: "vhsJitter", name: "VHS Tracking Jitter", category: "Retro / FX", engine: "css", tier: "Ext", status: "todo", tags: ["retro", "vhs"] },
  { kind: "motion", id: "glitchSlice", name: "Glitch Slice Bursts", category: "Retro / FX", engine: "css", tier: "Ext", status: "todo", tags: ["retro", "glitch", "energetic"] },
  { kind: "motion", id: "hologram", name: "Hologram Flicker", category: "Retro / FX", engine: "css", tier: "Ext", status: "todo", tags: ["retro", "sci-fi"] },
  { kind: "motion", id: "echoTrail", name: "Afterimage Echo Trail", category: "Retro / FX", engine: "css", tier: "Ext", status: "todo", tags: ["retro", "trail"] },
  { kind: "motion", id: "crtTurnOn", name: "CRT Power-on", category: "Retro / FX", engine: "css", tier: "Core", status: "todo", tags: ["retro", "crt"] },
  { kind: "motion", id: "flameFlicker", name: "Flame Flicker", category: "Retro / FX", engine: "css", tier: "Ext", status: "todo", tags: ["retro", "fire"] },
  { kind: "motion", id: "rainbowCycle", name: "Rainbow Hue Cycle", category: "Retro / FX", engine: "css", tier: "Core", status: "todo", tags: ["retro", "rainbow"] },
  { kind: "motion", id: "powerUp", name: "Arcade Power-up", category: "Retro / FX", engine: "css", tier: "Core", status: "todo", tags: ["retro", "arcade", "BPM"] },
  { kind: "motion", id: "arcadeHop", name: "Arcade Hop (stepped)", category: "Retro / FX", engine: "css", tier: "Ext", status: "todo", tags: ["retro", "arcade", "pixel"] },
  { kind: "motion", id: "wobbleVHS", name: "VHS Warp Wobble", category: "Retro / FX", engine: "css", tier: "Ext", status: "todo", tags: ["retro", "vhs"] },
  { kind: "motion", id: "vignette", name: "Vignette Overlay", category: "Retro / FX", engine: "css", tier: "Ext", status: "todo", tags: ["retro", "overlay"] },

  // --- Backgrounds (NEW — full-frame retro backdrops) ---
  { kind: "motion", id: "synthGrid", name: "Synthwave Grid + Sun", category: "Backgrounds", engine: "css", tier: "Core", status: "todo", tags: ["retro", "synthwave", "background"] },
  { kind: "motion", id: "starfield", name: "Parallax Starfield", category: "Backgrounds", engine: "css", tier: "Core", status: "todo", tags: ["retro", "space", "background"] },
  { kind: "motion", id: "crtRoom", name: "CRT Room (scanlines + vignette)", category: "Backgrounds", engine: "css", tier: "Ext", status: "todo", tags: ["retro", "crt", "background"] },

  // --- Pixel-art (pack: more pixel motions) ---
  { kind: "motion", id: "eightBitHop", name: "8-bit Hop", category: "Pixel-art", engine: "css", tier: "Core", status: "todo", tags: ["pixel", "game", "playful"] },
  { kind: "motion", id: "spriteFlash", name: "Sprite Hit-flash", category: "Pixel-art", engine: "css", tier: "Ext", status: "todo", tags: ["pixel", "BPM", "energetic"] },
  { kind: "motion", id: "pixelWindSway", name: "Stepped Wind Sway", category: "Pixel-art", engine: "css", tier: "Ext", status: "todo", tags: ["pixel", "idle"] },
  { kind: "motion", id: "ditherFadeIn", name: "Dither Fade-in", category: "Pixel-art", engine: "css", tier: "Ext", status: "todo", tags: ["pixel", "8-bit", "reveal"] },
  { kind: "motion", id: "pixelPop", name: "Stepped Spring Pop", category: "Pixel-art", engine: "css", tier: "Core", status: "todo", tags: ["pixel", "titles", "playful"] },

  // --- Retro / FX (pack: more cyber motions) ---
  { kind: "motion", id: "rgbSplitHeavy", name: "Heavy RGB Split", category: "Retro / FX", engine: "css", tier: "Ext", status: "todo", tags: ["retro", "glitch", "cyber"] },
  { kind: "motion", id: "dataGlitchBlocks", name: "Datamosh Blocks", category: "Retro / FX", engine: "css", tier: "Ext", status: "todo", tags: ["retro", "glitch", "cyber"] },
  { kind: "motion", id: "neonBorderPulse", name: "Neon Border Pulse", category: "Retro / FX", engine: "css", tier: "Core", status: "todo", tags: ["retro", "neon", "cyber"] },
  { kind: "motion", id: "vaporTint", name: "Vaporwave Duotone", category: "Retro / FX", engine: "css", tier: "Core", status: "todo", tags: ["retro", "vaporwave"] },
  { kind: "motion", id: "scanlineFlicker", name: "Scanline Flicker", category: "Retro / FX", engine: "css", tier: "Ext", status: "todo", tags: ["retro", "crt"] },

  // --- Backgrounds (pack: more retro backdrops) ---
  { kind: "motion", id: "synthSunset", name: "Synthwave Sunset", category: "Backgrounds", engine: "css", tier: "Core", status: "todo", tags: ["retro", "synthwave", "background"] },
  { kind: "motion", id: "gridRunner", name: "Neon Grid Runner", category: "Backgrounds", engine: "css", tier: "Ext", status: "todo", tags: ["retro", "synthwave", "background"] },

  // --- Wedding (pack: romantic overlays — glow/grade + full-frame atmospherics) ---
  { kind: "motion", id: "goldenHour", name: "Golden Hour Grade", category: "Wedding", engine: "css", tier: "Core", status: "todo", tags: ["wedding", "warm", "romantic"] },
  { kind: "motion", id: "dreamGlow", name: "Dreamy Bloom", category: "Wedding", engine: "css", tier: "Core", status: "todo", tags: ["wedding", "glow", "romantic"] },
  { kind: "motion", id: "romanticGlow", name: "Rose Glow Pulse", category: "Wedding", engine: "css", tier: "Ext", status: "todo", tags: ["wedding", "glow", "romantic"] },
  { kind: "motion", id: "softFocusBreath", name: "Soft-focus Breath", category: "Wedding", engine: "css", tier: "Ext", status: "todo", tags: ["wedding", "dreamy", "idle"] },
  { kind: "motion", id: "sparkleGlow", name: "Sparkle Glints", category: "Wedding", engine: "css", tier: "Ext", status: "todo", tags: ["wedding", "sparkle", "glam"] },
  { kind: "motion", id: "weddingPetals", name: "Falling Petals", category: "Wedding", engine: "css", tier: "Core", status: "todo", tags: ["wedding", "atmosphere", "fullframe"] },
  { kind: "motion", id: "confettiRain", name: "Confetti Rain", category: "Wedding", engine: "css", tier: "Core", status: "todo", tags: ["wedding", "celebration", "fullframe"] },
  { kind: "motion", id: "bokehLights", name: "Bokeh Lights", category: "Wedding", engine: "css", tier: "Ext", status: "todo", tags: ["wedding", "atmosphere", "fullframe"] },
  { kind: "motion", id: "lightLeakWarm", name: "Warm Light Leak", category: "Wedding", engine: "css", tier: "Ext", status: "todo", tags: ["wedding", "atmosphere", "fullframe"] },
  { kind: "motion", id: "sparkleField", name: "Sparkle Field", category: "Wedding", engine: "css", tier: "Ext", status: "todo", tags: ["wedding", "sparkle", "fullframe"] },

  // --- Retro transitions (NEW — custom CSS, preview-safe) ---
  { kind: "transition", id: "crtOn", name: "CRT Power-on", category: "Retro", engine: "css", tier: "Core", status: "todo", tags: ["retro", "crt"], license: "write-own" },
  { kind: "transition", id: "glitchCut", name: "Glitch Cut", category: "Retro", engine: "css", tier: "Ext", status: "todo", tags: ["retro", "glitch", "energetic"], license: "write-own" },
  { kind: "transition", id: "pixelDither", name: "Bayer Dither Dissolve", category: "Retro", engine: "css", tier: "Ext", status: "todo", tags: ["retro", "pixel", "8-bit"], license: "write-own" },
  { kind: "transition", id: "scanlineWipe", name: "Scanline Sweep", category: "Retro", engine: "css", tier: "Ext", status: "todo", tags: ["retro", "crt"], license: "write-own" },
  { kind: "transition", id: "vhsRewind", name: "VHS Rewind Smear", category: "Retro", engine: "css", tier: "Ext", status: "todo", tags: ["retro", "vhs"], license: "write-own" },

  // --- Ported from reactvideoeditor/remotion-templates (MIT), reworked into style(ctx) motions ---
  { kind: "motion", id: "spotlightReveal", name: "Spotlight Reveal", category: "Cinematic", engine: "css", tier: "Ext", status: "todo", tags: ["reveal", "cinematic"], license: "MIT", credit: "Adapted from reactvideoeditor/remotion-templates" },
  { kind: "motion", id: "letterboxReveal", name: "Letterbox Reveal", category: "Cinematic", engine: "css", tier: "Ext", status: "todo", tags: ["reveal", "cinematic"], license: "MIT", credit: "Adapted from reactvideoeditor/remotion-templates" },
  { kind: "motion", id: "liquidWave", name: "Liquid Wave", category: "Backgrounds", engine: "css", tier: "Ext", status: "todo", tags: ["background", "romantic", "soft", "fullframe"], license: "MIT", credit: "Adapted from reactvideoeditor/remotion-templates" },
  { kind: "motion", id: "monogramSpinReveal", name: "Monogram Spin Reveal", category: "Monogram", engine: "css", tier: "Ext", status: "todo", tags: ["logo", "reveal", "wedding"], license: "MIT", credit: "Adapted from reactvideoeditor/remotion-templates" },
  { kind: "motion", id: "monogramScaleRotate", name: "Monogram Scale + Rotate", category: "Monogram", engine: "css", tier: "Ext", status: "todo", tags: ["logo", "loop", "wedding"], license: "MIT", credit: "Adapted from reactvideoeditor/remotion-templates" },
  { kind: "motion", id: "monogramBlurReveal", name: "Monogram Blur Reveal", category: "Monogram", engine: "css", tier: "Ext", status: "todo", tags: ["logo", "reveal", "wedding"], license: "MIT", credit: "Adapted from reactvideoeditor/remotion-templates" },
  { kind: "motion", id: "chapterTitleReveal", name: "Chapter Title Reveal", category: "Titles", engine: "css", tier: "Ext", status: "todo", tags: ["text", "title", "reveal"], license: "MIT", credit: "Adapted from reactvideoeditor/remotion-templates" },
  { kind: "motion", id: "quoteCardReveal", name: "Quote Card Reveal", category: "Titles", engine: "css", tier: "Ext", status: "todo", tags: ["text", "quote", "card"], license: "MIT", credit: "Adapted from reactvideoeditor/remotion-templates" },
  { kind: "motion", id: "lowerThirdBar", name: "Lower Third Bar", category: "Titles", engine: "css", tier: "Ext", status: "todo", tags: ["text", "caption", "lower-third"], license: "MIT", credit: "Adapted from reactvideoeditor/remotion-templates" },
  { kind: "motion", id: "polaroidFrame", name: "Polaroid Frame", category: "Photo", engine: "css", tier: "Ext", status: "todo", tags: ["photo", "frame", "nostalgic"], license: "MIT", credit: "Adapted from reactvideoeditor/remotion-templates" },
  { kind: "motion", id: "circularProgressReveal", name: "Circular Progress Ring", category: "Charts & Data", engine: "css", tier: "Ext", status: "todo", tags: ["decorative", "ring", "progress"], license: "MIT", credit: "Adapted from reactvideoeditor/remotion-templates" },

  // --- Japan MV pack (sakura / flare / komorebi / grade — for the Soranji wedding MV) ---
  { kind: "motion", id: "sakuraPetals", name: "Sakura Petals", category: "Japan MV", engine: "css", tier: "Core", status: "todo", tags: ["japan", "sakura", "atmosphere", "fullframe", "wedding"], license: "write-own" },
  { kind: "motion", id: "lensFlare", name: "Anamorphic Lens Flare", category: "Japan MV", engine: "css", tier: "Core", status: "todo", tags: ["flare", "cinematic", "fullframe"], license: "write-own" },
  { kind: "motion", id: "godRays", name: "God Rays (Komorebi)", category: "Japan MV", engine: "css", tier: "Ext", status: "todo", tags: ["light", "atmosphere", "fullframe"], license: "write-own" },
  { kind: "motion", id: "japanMvGrade", name: "Japan MV Pastel Grade", category: "Japan MV", engine: "css", tier: "Core", status: "todo", tags: ["grade", "pastel", "japan"], license: "write-own" },
];
