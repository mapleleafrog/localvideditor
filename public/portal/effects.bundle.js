"use strict";
var SoranjiEffects = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/effects/portable.ts
  var portable_exports = {};
  __export(portable_exports, {
    MOTION_FORMULAS: () => MOTION_FORMULAS,
    MOTION_META: () => MOTION_META,
    TAU: () => TAU,
    beatIndex: () => beatIndex,
    beatKick: () => beatKick,
    bevel: () => bevel,
    bez: () => bez,
    bounceOut: () => bounceOut,
    clamp: () => clamp,
    composeStyles: () => composeStyles,
    depthScale: () => depthScale,
    depthShadow: () => depthShadow,
    easeInOutCubic: () => easeInOutCubic,
    easeOutCubic: () => easeOutCubic,
    elasticOut: () => elasticOut,
    lerp: () => lerp,
    quantize: () => quantize,
    seededRandom: () => seededRandom,
    smooth: () => smooth,
    springy: () => springy,
    stepTime: () => stepTime
  });

  // src/effects/helpers.ts
  var TAU = Math.PI * 2;
  var clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  var lerp = (a, b, t) => a + (b - a) * t;
  var smooth = (t) => t * t * (3 - 2 * t);
  var easeInOutCubic = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  var easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  var springy = (p) => p >= 1 ? 1 : 1 - Math.exp(-6 * p) * Math.cos(9 * p);
  var bounceOut = (p) => {
    const n = 7.5625;
    const d = 2.75;
    if (p < 1 / d) return n * p * p;
    if (p < 2 / d) {
      p -= 1.5 / d;
      return n * p * p + 0.75;
    }
    if (p < 2.5 / d) {
      p -= 2.25 / d;
      return n * p * p + 0.9375;
    }
    p -= 2.625 / d;
    return n * p * p + 0.984375;
  };
  var elasticOut = (p) => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    const c4 = 2 * Math.PI / 3;
    return Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * c4) + 1;
  };
  var beatKick = (t, bpm = 120, exp = 6) => {
    const spb = 60 / bpm;
    const ph = t % spb / spb;
    return Math.pow(1 - ph, exp);
  };
  var beatIndex = (t, bpm = 120) => Math.floor(t / (60 / bpm));
  var bez = (t, p0, p1, p2, p3) => {
    const u = 1 - t;
    return [
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]
    ];
  };
  var quantize = (v, steps) => Math.round(v * steps) / steps;
  var stepTime = (t, animFps = 8) => Math.floor(t * animFps) / animFps;
  var seededRandom = (seed) => {
    const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };

  // src/effects/catalog.ts
  var CATALOG = [
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
    { kind: "transition", id: "crossWarp", name: "Crosswarp (melt morph)", category: "Warp", engine: "webgl", tier: "Core", status: "todo", tags: ["dreamy", "modern"], license: "MIT", credit: "Eke P\xE9ter (gl-transitions)" },
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
    { kind: "transition", id: "cube3D", name: "Cube Rotate", category: "3D", engine: "webgl", tier: "Ext", status: "todo", tags: ["dynamic"], license: "MIT", credit: "gre (gl-transitions) \u2014 NOT Remotion paid cube()" },
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
    // --- Retro transitions (NEW — custom CSS, preview-safe) ---
    { kind: "transition", id: "crtOn", name: "CRT Power-on", category: "Retro", engine: "css", tier: "Core", status: "todo", tags: ["retro", "crt"], license: "write-own" },
    { kind: "transition", id: "glitchCut", name: "Glitch Cut", category: "Retro", engine: "css", tier: "Ext", status: "todo", tags: ["retro", "glitch", "energetic"], license: "write-own" },
    { kind: "transition", id: "pixelDither", name: "Bayer Dither Dissolve", category: "Retro", engine: "css", tier: "Ext", status: "todo", tags: ["retro", "pixel", "8-bit"], license: "write-own" },
    { kind: "transition", id: "scanlineWipe", name: "Scanline Sweep", category: "Retro", engine: "css", tier: "Ext", status: "todo", tags: ["retro", "crt"], license: "write-own" },
    { kind: "transition", id: "vhsRewind", name: "VHS Rewind Smear", category: "Retro", engine: "css", tier: "Ext", status: "todo", tags: ["retro", "vhs"], license: "write-own" }
  ];

  // src/effects/portable.ts
  var depthShadow = (z) => {
    const zz = clamp(z);
    const y = lerp(1, 28, zz);
    const blur = lerp(2, 38, zz);
    const op = lerp(0.18, 0.5, zz);
    return `drop-shadow(0px ${y.toFixed(1)}px ${blur.toFixed(1)}px rgba(0,0,0,${op.toFixed(2)}))`;
  };
  var depthScale = (z) => lerp(0.82, 1.16, clamp(z));
  var bevel = (size = 3) => ({
    boxShadow: `inset ${size}px ${size}px 0 rgba(255,255,255,0.45), inset ${-size}px ${-size}px 0 rgba(0,0,0,0.35), 0 ${size * 2}px ${size * 3}px rgba(0,0,0,0.35)`
  });
  var GRAIN_URI = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;
  var SCANLINE_GRADIENT = "repeating-linear-gradient(0deg, rgba(0,0,0,0.22) 0px, rgba(0,0,0,0.22) 1px, transparent 1px, transparent 3px)";
  var composeStyles = (styles) => {
    const out = {};
    const transforms = [];
    const filters = [];
    let opacity = 1;
    let hasOpacity = false;
    for (const s of styles) {
      for (const [k, v] of Object.entries(s)) {
        if (v == null) continue;
        if (k === "transform") {
          transforms.push(String(v));
        } else if (k === "filter") {
          if (v !== "none") filters.push(String(v));
        } else if (k === "opacity") {
          opacity *= Number(v);
          hasOpacity = true;
        } else {
          out[k] = v;
        }
      }
    }
    if (transforms.length) out.transform = transforms.join(" ");
    if (filters.length) out.filter = filters.join(" ");
    if (hasOpacity) out.opacity = opacity;
    return out;
  };
  var MOTION_FORMULAS = {
    // --- Ken Burns / Zoom ---
    kenBurns: ({ progress: p }) => ({
      transform: `scale(${1.1 + p * 0.25}) translate(${(0.5 - p) * 4}%, ${(0.5 - p) * 3}%)`
    }),
    slowZoomIn: ({ progress: p }) => ({ transform: `scale(${1 + p * 0.4})` }),
    slowZoomOut: ({ progress: p }) => ({ transform: `scale(${1.4 - p * 0.4})` }),
    pulseZoom: ({ beat }) => ({ transform: `scale(${1.05 + beat * 0.14})` }),
    smashZoom: ({ progress: p }) => ({
      transform: `scale(${1 + smooth(clamp(p * 1.3)) * 0.55})`,
      filter: `blur(${Math.sin(p * Math.PI) * 6}px)`
    }),
    focusBreath: ({ t }) => ({
      transform: `scale(${1.02 + Math.sin(t * 1.4) * 0.02})`,
      filter: `blur(${(1 + Math.cos(t * 1.4)) * 0.3}px)`
    }),
    // --- Pan / Move ---
    panLR: ({ progress: p }) => ({ transform: `scale(1.3) translateX(${(0.5 - p) * 18}%)` }),
    panUD: ({ progress: p }) => ({ transform: `scale(1.3) translateY(${(0.5 - p) * 18}%)` }),
    parallaxPan: ({ progress: p, params }) => ({
      transform: `scale(1.4) translateX(${(0.5 - p) * 20 * (params.speed ?? 1)}%)`
    }),
    driftFloat: ({ t }) => ({
      transform: `translate(${Math.sin(t * 0.5) * 12}px, ${Math.cos(t * 0.4) * 10}px)`
    }),
    kineticText: ({ progress: p }) => ({
      transform: `translateX(${(1 - smooth(clamp(p * 1.5))) * -40}px)`,
      opacity: clamp(p * 2)
    }),
    // --- Path (set only left/top; Layer supplies translate(-50%,-50%)) ---
    motionPath: ({ progress: p }) => {
      const pt = bez(p, [12, 82], [28, 12], [72, 92], [88, 18]);
      return { left: `${pt[0]}%`, top: `${pt[1]}%` };
    },
    arcMove: ({ progress: p }) => ({
      left: `${lerp(10, 90, p)}%`,
      top: `${80 - Math.sin(p * Math.PI) * 55}%`
    }),
    orbit: ({ t, params }) => {
      const r = params.radius ?? 30;
      return {
        left: `${50 + Math.cos(t * 1.2) * r}%`,
        top: `${50 + Math.sin(t * 1.2) * r * 0.6}%`
      };
    },
    drawOn: ({ progress: p }) => ({ clipPath: `inset(0 ${(1 - p) * 100}% 0 0)` }),
    bezierFloat: ({ t }) => {
      const pt = bez((Math.sin(t * 0.5) + 1) / 2, [20, 50], [40, 10], [60, 90], [80, 50]);
      return { left: `${pt[0]}%`, top: `${pt[1]}%` };
    },
    // --- Physics / Spring ---
    springPop: ({ progress: p }) => ({ transform: `scale(${springy(p)})` }),
    bounceIn: ({ progress: p }) => ({
      transform: `translateY(${(1 - bounceOut(p)) * -60}px)`,
      opacity: Math.min(1, p * 3)
    }),
    elasticIn: ({ progress: p }) => ({ transform: `scale(${elasticOut(p)})` }),
    jiggleWobble: ({ progress: p }) => ({
      transform: `rotate(${Math.sin(p * TAU * 3) * (1 - p) * 10}deg)`
    }),
    inertiaSlide: ({ progress: p }) => ({
      transform: `translateX(${(1 - easeOutCubic(p)) * 140}px)`
    }),
    squashStretch: ({ t }) => {
      const s = Math.sin(t * 4);
      return { transform: `scale(${1 + s * 0.15}, ${1 - s * 0.12})`, transformOrigin: "bottom center" };
    },
    pendulum: ({ t }) => ({
      transform: `rotate(${Math.sin(t * 2) * 18}deg)`,
      transformOrigin: "top center"
    }),
    // --- 3D / Perspective (CSS perspective only) ---
    tiltPerspective: ({ t }) => ({
      transform: `perspective(800px) rotateY(${Math.sin(t * 1.2) * 10}deg) rotateX(${Math.cos(t * 1) * 6}deg)`
    }),
    flip3DLayer: ({ progress: p }) => ({
      transform: `perspective(800px) rotateY(${p * 360}deg)`
    }),
    // --- Camera (CSS analogs of cinematic moves) ---
    dollyInOut: ({ progress: p }) => ({ transform: `scale(${1 + Math.sin(p * Math.PI) * 0.4})` }),
    truck: ({ progress: p }) => ({ transform: `scale(1.2) translateX(${(0.5 - p) * 30}%)` }),
    pedestal: ({ progress: p }) => ({ transform: `scale(1.2) translateY(${(0.5 - p) * 22}%)` }),
    panCam: ({ progress: p }) => ({
      transform: `perspective(1200px) rotateY(${(0.5 - p) * 16}deg) scale(1.15)`
    }),
    tiltCam: ({ progress: p }) => ({
      transform: `perspective(1200px) rotateX(${(p - 0.5) * 14}deg) scale(1.15)`
    }),
    zoomLens: ({ progress: p }) => ({ transform: `scale(${1 + p * 0.6})` }),
    rackFocus: ({ progress: p }) => ({ filter: `blur(${(1 - smooth(clamp(p * 1.3))) * 10}px)` }),
    dollyZoom: ({ progress: p }) => ({
      transform: `perspective(${lerp(1200, 320, p)}px) scale(${1 + p * 0.25})`
    }),
    whipPanCam: ({ progress: p }) => ({
      transform: `translateX(${(0.5 - p) * 120}%)`,
      filter: `blur(${Math.sin(p * Math.PI) * 8}px)`
    }),
    craneJib: ({ progress: p }) => ({
      transform: `scale(${1.1 + p * 0.2}) translateY(${(0.5 - p) * 20}%)`
    }),
    arcShot: ({ progress: p }) => ({
      transform: `perspective(1000px) rotateY(${(0.5 - p) * 24}deg) scale(1.2)`
    }),
    handheld: ({ t }) => {
      const nx = (Math.sin(t * 7) + Math.sin(t * 13) * 0.5) * 5;
      const ny = (Math.cos(t * 9) + Math.sin(t * 5) * 0.5) * 4;
      return { transform: `translate(${nx}px, ${ny}px) rotate(${Math.sin(t * 4) * 1.2}deg)` };
    },
    dutchAngle: ({ params }) => ({ transform: `rotate(${params.angle ?? 8}deg) scale(1.1)` }),
    steadicamFollow: ({ t }) => ({
      transform: `translate(${Math.sin(t * 0.6) * 20}px, ${Math.cos(t * 0.5) * 10}px) scale(1.1)`
    }),
    // --- Loop / Idle ---
    breathingLoop: ({ t }) => ({ transform: `scale(${1.04 + Math.sin(t * 1.6) * 0.035})` }),
    floatLoop: ({ t }) => ({ transform: `translateY(${Math.sin(t * 1.6) * 10}px)` }),
    swayLoop: ({ t }) => ({
      transform: `rotate(${Math.sin(t * 1.2) * 5}deg)`,
      transformOrigin: "bottom center"
    }),
    shimmerLoop: ({ t }) => ({
      backgroundImage: "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.5) 50%, transparent 70%)",
      backgroundSize: "220% 100%",
      backgroundPosition: `${t * 0.4 % 1 * 240 - 60}% 0`
    }),
    pulseGlow: ({ t }) => ({
      filter: `drop-shadow(0 0 ${8 + Math.sin(t * 2) * 8}px rgba(255,210,150,0.8))`
    }),
    grainLoop: ({ frame }) => ({
      backgroundImage: GRAIN_URI,
      opacity: 0.07,
      backgroundPosition: `${seededRandom(frame) * 100}% ${seededRandom(frame + 9) * 100}%`,
      mixBlendMode: "overlay"
    }),
    // --- Beat-reactive (frame-derived beat) ---
    beatPulse: ({ beat }) => ({ transform: `scale(${1.05 + beat * 0.22})` }),
    beatFlash: ({ beat }) => ({ backgroundColor: "#fff", opacity: beat * 0.6 }),
    beatShake: ({ beat, t }) => ({
      transform: `translate(${Math.sin(t * 60) * beat * 8}px, ${Math.cos(t * 55) * beat * 6}px)`
    }),
    beatColorCycle: ({ beat }) => ({ filter: `hue-rotate(${beat * 120}deg) saturate(${1 + beat})` }),
    beatZoomCut: ({ beat }) => ({ transform: `scale(${1 + (beat > 0.6 ? 0.15 : 0)})` }),
    audioBars: ({ beat }) => ({ transform: `scaleY(${0.3 + beat * 0.7})`, transformOrigin: "bottom" }),
    waveform: ({ t, beat }) => ({
      transform: `scaleY(${0.5 + Math.abs(Math.sin(t * 6)) * 0.4 + beat * 0.2})`,
      transformOrigin: "center"
    }),
    // --- Depth / 2.5D ---
    dropShadowLift: ({ progress: p }) => ({
      transform: `translateY(${-p * 14}px) scale(${lerp(1, 1.08, p)})`,
      filter: depthShadow(lerp(0.1, 0.9, p))
    }),
    bevelEmboss: ({ t }) => ({
      ...bevel(3),
      transform: `translateY(${Math.sin(t * 1.2) * 2}px)`
    }),
    parallaxDepth: ({ progress: p, params }) => {
      const z = params.z ?? 0.5;
      return {
        transform: `translateX(${(0.5 - p) * 50 * z}px) scale(${depthScale(z)})`,
        filter: depthShadow(z)
      };
    },
    floatShadow: ({ t }) => {
      const bob = Math.sin(t * 1.6);
      const up = Math.max(0, bob);
      return {
        transform: `translateY(${-bob * 10}px)`,
        filter: `drop-shadow(0px ${12 + up * 16}px ${6 + up * 12}px rgba(0,0,0,${(0.45 - up * 0.2).toFixed(2)}))`
      };
    },
    tiltShadow: ({ t }) => {
      const ry = Math.sin(t * 1.2) * 12;
      const rx = Math.cos(t * 1) * 7;
      const sx = Math.sin(t * 1.2) * 18;
      return {
        transform: `perspective(700px) rotateY(${ry}deg) rotateX(${rx}deg)`,
        filter: `drop-shadow(${-sx}px 14px 14px rgba(0,0,0,0.4))`
      };
    },
    popLayer: ({ beat: k }) => ({
      transform: `scale(${1 + k * 0.18}) translateY(${-k * 10}px)`,
      filter: depthShadow(0.3 + k * 0.6)
    }),
    // --- Pixel-art ---
    pixelBob: ({ t }) => ({
      transform: `translateY(${quantize(Math.sin(t * 2), 6) * -12}px)`
    }),
    spriteBlink: ({ frame, fps }) => {
      const period = fps * 1.3;
      const phase = frame % period / period;
      return { opacity: phase > 0.92 ? 0.15 : 1 };
    },
    paletteCycle: ({ t }) => ({
      filter: `hue-rotate(${quantize(t * 0.15 % 1, 8) * 360}deg) saturate(1.2)`
    }),
    pixelShake: ({ t }) => {
      const sx = Math.round(Math.sin(t * 30) * 2);
      const sy = Math.round(Math.cos(t * 27) * 2);
      return { transform: `translate(${sx}px, ${sy}px)` };
    },
    crtScanlines: ({ t }) => ({
      backgroundImage: SCANLINE_GRADIENT,
      opacity: 0.5 + Math.sin(t * 40) * 0.06,
      mixBlendMode: "multiply"
    }),
    stepWalk: ({ t }) => {
      const x = stepTime(t, 6) * 30;
      const hop = Math.round(Math.abs(Math.sin(t * 8)));
      return { transform: `translateX(${x % 120}px) translateY(${-hop * 2}px)` };
    },
    // --- Retro / FX ---
    neonGlow: ({ t }) => ({
      filter: `drop-shadow(0 0 ${6 + Math.sin(t * 4) * 4}px hsl(${t * 80 % 360} 100% 60%)) drop-shadow(0 0 ${14 + Math.sin(t * 4) * 8}px hsl(${(t * 80 + 50) % 360} 100% 55%)) brightness(1.12)`
    }),
    chromaPulse: ({ t }) => {
      const o = 3 + Math.sin(t * 5) * 3;
      return {
        filter: `drop-shadow(${o}px 0 0 rgba(255,0,80,0.7)) drop-shadow(${-o}px 0 0 rgba(0,255,255,0.7))`
      };
    },
    vhsJitter: ({ frame }) => {
      const j = Math.round((seededRandom(Math.floor(frame / 2)) - 0.5) * 6);
      const big = seededRandom(Math.floor(frame / 10)) > 0.9 ? Math.round((seededRandom(frame) - 0.5) * 16) : 0;
      return { transform: `translateX(${j + big}px)`, filter: "saturate(1.4) contrast(1.08)" };
    },
    glitchSlice: ({ frame }) => {
      const trig = seededRandom(Math.floor(frame / 4)) > 0.72;
      const dx = trig ? (seededRandom(frame) - 0.5) * 28 : 0;
      const sk = trig ? (seededRandom(frame + 3) - 0.5) * 8 : 0;
      return {
        transform: `translateX(${dx}px) skewX(${sk}deg)`,
        filter: trig ? `hue-rotate(${Math.round(seededRandom(frame + 7) * 360)}deg)` : "none"
      };
    },
    hologram: ({ t }) => ({
      opacity: 0.72 + Math.sin(t * 30) * 0.07,
      filter: "hue-rotate(150deg) saturate(2) brightness(1.2) drop-shadow(0 0 8px rgba(0,255,255,0.8))",
      transform: `skewX(${Math.sin(t * 2) * 2}deg)`
    }),
    echoTrail: ({ t }) => {
      const dx = Math.sin(t * 2) * 30;
      return {
        transform: `translateX(${dx}px)`,
        filter: `drop-shadow(${-dx * 0.3}px 0 0 rgba(255,0,255,0.45)) drop-shadow(${-dx * 0.6}px 0 0 rgba(0,255,255,0.35)) drop-shadow(${-dx * 0.9}px 0 0 rgba(255,255,0,0.22))`
      };
    },
    crtTurnOn: ({ progress: p }) => {
      const a = clamp(p / 0.4);
      const b = clamp((p - 0.4) / 0.6);
      return {
        transform: `scaleX(${0.2 + a * 0.8}) scaleY(${0.02 + b * 0.98})`,
        filter: `brightness(${1 + (1 - b) * 2.5})`
      };
    },
    flameFlicker: ({ t, frame }) => ({
      transform: `translateY(${Math.sin(t * 8) * 2}px) scaleY(${1 + Math.sin(t * 12) * 0.04})`,
      filter: `hue-rotate(${-12 + seededRandom(frame) * 22}deg) brightness(${1.1 + seededRandom(frame) * 0.3}) saturate(1.6)`
    }),
    rainbowCycle: ({ t }) => ({ filter: `hue-rotate(${t * 120 % 360}deg) saturate(1.4)` }),
    powerUp: ({ beat }) => ({
      transform: `scale(${1 + beat * 0.3})`,
      filter: `brightness(${1 + beat}) drop-shadow(0 0 ${beat * 22}px gold)`
    }),
    arcadeHop: ({ t }) => {
      const q = quantize(Math.abs(Math.sin(t * 6)), 4);
      return { transform: `translateY(${-q * 26}px) scaleY(${1 + q * 0.06}) scaleX(${1 - q * 0.04})` };
    },
    wobbleVHS: ({ t }) => ({
      transform: `perspective(600px) rotateY(${Math.sin(t * 1.5) * 6}deg) skewX(${Math.sin(t * 3) * 2}deg)`,
      filter: `blur(${(1 + Math.sin(t * 9)) * 0.4}px)`
    }),
    // --- Backgrounds (full-frame) ---
    synthGrid: ({ t }) => ({
      backgroundColor: "#120025",
      backgroundImage: [
        "radial-gradient(circle at 50% 32%, #ff2e88 0, #ff6ec7 7%, rgba(255,110,199,0) 22%)",
        "repeating-linear-gradient(0deg, rgba(0,240,255,0) 0 38px, rgba(0,240,255,0.55) 38px 40px)",
        "repeating-linear-gradient(90deg, rgba(255,46,136,0) 0 38px, rgba(255,46,136,0.4) 38px 40px)"
      ].join(", "),
      backgroundPosition: `0 0, 0 ${t * 60 % 40}px, 0 0`
    }),
    starfield: ({ t }) => ({
      backgroundColor: "#03030f",
      backgroundImage: [
        "radial-gradient(1px 1px at 15% 20%, #fff, transparent 2px), radial-gradient(1px 1px at 80% 60%, #cde, transparent 2px), radial-gradient(1px 1px at 45% 85%, #fff, transparent 2px)",
        "radial-gradient(2px 2px at 60% 30%, #9cf, transparent 3px), radial-gradient(2px 2px at 30% 72%, #fff, transparent 3px)"
      ].join(", "),
      backgroundSize: "300px 300px, 520px 520px",
      backgroundPosition: `0 ${t * 40 % 300}px, 0 ${t * 80 % 520}px`
    }),
    crtRoom: ({ frame }) => ({
      backgroundColor: "#0a0a0f",
      backgroundImage: "repeating-linear-gradient(0deg, rgba(0,0,0,0.35) 0 1px, transparent 1px 3px), radial-gradient(circle at 50% 50%, transparent 55%, rgba(0,0,0,0.85) 100%)",
      filter: `brightness(${0.97 + seededRandom(frame) * 0.06})`
    }),
    // --- overlay (full-frame, on top) ---
    vignette: ({ t }) => ({
      backgroundImage: `radial-gradient(circle at 50% 50%, transparent ${48 + Math.sin(t * 1.5) * 4}%, rgba(0,0,0,0.72) 100%)`
    })
  };
  var MOTION_META = Object.fromEntries(
    CATALOG.filter((e) => e.kind === "motion").map((e) => [e.id, { name: e.name, category: e.category, tier: e.tier }])
  );
  return __toCommonJS(portable_exports);
})();
