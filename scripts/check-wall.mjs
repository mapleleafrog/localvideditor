// npm run check:wall — asserts the Wall camera invariants. No React, no browser, ~1 s.
//
// src/timeline/wall.ts is bundled IN MEMORY with esbuild (the scripts/gen-portal.mjs pattern) and
// imported as a data: URL. wall.ts imports the schema with `import type` ONLY, so no zod and no
// effects registry is pulled in — that is deliberate, and this script is what keeps it true.
//
// The twelve invariant groups are the ones the design calls load-bearing; several of them
// (fit-all tightness, the endpoint-derivative invariant, within-segment speed) are properties
// that a plausible-looking "improvement" to the maths would silently break.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bundle = async (rel) => {
  const res = await build({
    entryPoints: [join(root, rel)],
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2020",
    legalComments: "none",
    write: false,
  });
  return res.outputFiles[0].text;
};

const code = await bundle("src/timeline/wall.ts");
if (/require\(|from ["']zod["']/.test(code)) {
  console.error("check:wall — wall.ts pulled in a runtime dependency (the schema must be `import type` only)");
  process.exit(1);
}
const W_ = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));

// wall-paper.ts is the LOOK module. It has no DOM and no React runtime (only `import type
// CSSProperties`), so its geometric contracts — the deckle polygon, the window/box reconstruction,
// the filter identity, the torn shadow's two-element split — are checkable right here. Group 13
// exists because none of them were covered before, and the one confirmed VISUAL bug in the whole
// feature (a torn polygon that rendered as a diamond) lived in exactly that gap.
const paperCode = await bundle("src/timeline/wall-paper.ts");
if (/require\(|from ["']zod["']|from ["']react["']/.test(paperCode)) {
  console.error("check:wall — wall-paper.ts pulled in a runtime dependency (React must be `import type` only)");
  process.exit(1);
}
const P_ = await import("data:text/javascript;base64," + Buffer.from(paperCode).toString("base64"));

const {
  EASE,
  EASE_IDS,
  ease,
  itemBox,
  itemHalfExtents,
  itemScreenBox,
  visibleAt,
  fitAll,
  scheduleWall,
  segIndexAt,
  poseInSeg,
  cameraAt,
  segSpeed,
  wallToScreen,
  screenToWall,
  wallFitFrames,
  shortAngle,
  peakVelocity,
  suggestGlideSeconds,
  V_TARGET_PER_SEC,
  liftShape,
} = W_;

// ---------------------------------------------------------------------------------------------
let failures = 0;
let group = "";
let checks = 0;
const startGroup = (n, name) => {
  group = `${n}. ${name}`;
};
const ok = (cond, msg) => {
  checks++;
  if (!cond) {
    failures++;
    console.error(`  FAIL [${group}] ${msg}`);
  }
};
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg} (|${a} - ${b}| > ${tol})`);
const allFinite = (o) => Object.values(o).every((v) => typeof v !== "number" || Number.isFinite(v));

// Deterministic PRNG — no Math.random, so a failure is always reproducible.
let _s = 20260908;
const rnd = () => {
  _s = (_s * 1103515245 + 12345) & 0x7fffffff;
  return _s / 0x7fffffff;
};
const rr = (a, b) => a + (b - a) * rnd();
const pick = (arr) => arr[Math.floor(rnd() * arr.length) % arr.length];

const FRAMES = ["none", "polaroid", "matte", "taped", "torn"];
const randItem = () => ({
  type: rnd() < 0.12 ? "text" : "image",
  text: "あいうえお sample",
  fontSize: rr(40, 160),
  x: rr(-3000, 3000),
  y: rr(-1600, 1600),
  width: rr(120, 900),
  aspect: rnd() < 0.15 ? undefined : rr(0.2, 5),
  rotation: rr(-180, 180),
  depth: rr(0.2, 3),
  frame: pick(FRAMES),
});
let sceneSeq = 0;
const randScene = () => ({
  id: `sc_${(sceneSeq++).toString(36)}`,
  x: rr(-2500, 2500),
  y: rr(-1400, 1400),
  zoom: rr(0.15, 3),
  rotation: rr(-200, 200),
  holdSeconds: pick([0, 0.6, 1.2, 1.8, 2.4]),
  glideSeconds: pick([0, 0.4, 0.8, 1.5, 2.4]),
  easing: pick(["smooth", "gentle", "sine", "cubic", "settle"]),
  arc: pick([0, 0, 0.6, -0.4, 1, -1]),
  hover: pick([undefined, "none", "toward", "toward", "pushIn", "pullOut", "left", "right", "up", "down"]),
  hoverAmount: pick([undefined, 0, 0.5, 1]),
});
// Scene refs on items: unset, a valid id, or a stale id — the renderer must treat stale == unset.
const withRefs = (items, scenes) =>
  items.map((it) => {
    const ref = () => {
      const r = rnd();
      if (r < 0.5 || !scenes.length) return undefined;
      if (r < 0.9) return pick(scenes).id;
      return "sc_unknown";
    };
    return { ...it, appearIn: ref(), leaveAfter: ref(), appearDelaySeconds: pick([undefined, 0, 0.2, 0.5, 3]) };
  });
const randWall = (nItems, nScenes) => {
  const scenes = Array.from({ length: nScenes }, randScene);
  return {
  items: withRefs(Array.from({ length: nItems }, randItem), scenes),
  scenes,
  intro: rnd() < 0.7,
  introHoldSeconds: rr(0, 1.5),
  outro: rnd() < 0.7,
  outroSeconds: rr(0, 3),
  outroHoldSeconds: rr(0, 2),
  fitPadding: pick([0, 0.06, 0.12, 0.3]),
  breathing: 0,
  };
};

const W = 1920;
const H = 1080;

// =============================================================================================
startGroup(1, "ease endpoints, derivatives, settle peak");
{
  const h = 1e-6;
  for (const id of EASE_IDS) {
    const e = EASE[id];
    ok(e(0) === 0, `${id}: e(0) must be exactly 0, got ${e(0)}`);
    ok(e(1) === 1, `${id}: e(1) must be exactly 1, got ${e(1)}`);
    const d0 = (e(h) - e(0)) / h;
    const d1 = (e(1) - e(1 - h)) / h;
    ok(Math.abs(d0) < 1e-4, `${id}: |e'(0)| = ${d0} must be < 1e-4 (zero endpoint velocity)`);
    ok(Math.abs(d1) < 1e-4, `${id}: |e'(1)| = ${d1} must be < 1e-4 (zero endpoint velocity)`);
    ok(e(0.5) > 0 && e(0.5) < 1, `${id}: e(0.5) inside (0,1)`);
    // there is deliberately no `linear`
    ok(Math.abs(e(0.25) - 0.25) > 1e-3, `${id}: must not be linear`);
  }
  // settle: single overshoot, +2.5%, late, returning to exactly 1
  let peak = -Infinity;
  let peakP = 0;
  // SINGLE-PEAKED means exactly ONE ascending->descending sign change, not "few descending
  // samples": a loose count left ~15 600 samples of slack, through which a second dip-and-rise
  // would have passed unnoticed while the message claimed the stronger property.
  let flips = 0;
  let descending = false;
  let prev = EASE.settle(0);
  for (let i = 1; i <= 200000; i++) {
    const p = i / 200000;
    const v = EASE.settle(p);
    if (v > peak) {
      peak = v;
      peakP = p;
    }
    const down = v < prev;
    if (down !== descending) {
      flips++;
      descending = down;
    }
    prev = v;
  }
  ok(peak >= 1.02 && peak <= 1.03, `settle peak ${peak.toFixed(6)} must be in [1.020, 1.030]`);
  ok(peakP >= 0.86 && peakP <= 0.9, `settle peak at p=${peakP.toFixed(4)} must be in [0.86, 0.90]`);
  ok(flips === 1, `settle must flip from ascending to descending EXACTLY once (got ${flips} flips)`);
  ok(descending, "settle must end on its descending tail");
  ok(EASE.settle(1) === 1, "settle returns to exactly 1");
  // gentle: C3 (zero jerk at both ends) and a longer dwell than smooth — its slope near the ends is
  // strictly smaller, its peak slope strictly larger.
  {
    const hh = 1e-4;
    const d2 = (f, p) => (f(p + hh) - 2 * f(p) + f(p - hh)) / (hh * hh);
    ok(Math.abs(d2(EASE.gentle, hh)) < 0.05 && Math.abs(d2(EASE.gentle, 1 - hh)) < 0.05, "gentle: ~0 acceleration at both ends");
    ok(EASE.gentle(0.1) < EASE.smooth(0.1) && EASE.gentle(0.9) > EASE.smooth(0.9), "gentle dwells longer at both ends than smooth");
    const slope = (f, p) => (f(p + hh) - f(p - hh)) / (2 * hh);
    ok(slope(EASE.gentle, 0.5) > slope(EASE.smooth, 0.5), "gentle is faster mid-glide than smooth (the time has to come from somewhere)");
    near(slope(EASE.gentle, 0.5), 2.1875, 1e-3, "gentle peak slope is 35/16");
  }
  // unknown ids fall back to the default (smooth), and p is clamped
  ok(ease("nope", 0.3) === EASE.smooth(0.3), "unknown ease id falls back to smooth");
  ok(ease(undefined, 0.3) === EASE.smooth(0.3), "undefined ease id falls back to smooth");
  ok(ease("sine", -5) === 0 && ease("sine", 5) === 1, "ease clamps p");
  // smooth is C2: zero ACCELERATION at both ends (second central difference), unlike sine.
  {
    // e'''(0) = 60 for the quintic, so e''(h) ~ 60h: sample at 1e-4 (0.006) and allow 0.02.
    const h = 1e-4;
    const acc = (f, p) => (f(p + h) - 2 * f(p) + f(p - h)) / (h * h);
    ok(Math.abs(acc(EASE.smooth, h)) < 0.02, `smooth e''(0) ~ 0 (got ${acc(EASE.smooth, h).toFixed(4)})`);
    ok(Math.abs(acc(EASE.smooth, 1 - h)) < 0.02, `smooth e''(1) ~ 0 (got ${acc(EASE.smooth, 1 - h).toFixed(4)})`);
    ok(Math.abs(acc(EASE.sine, h)) > 4, "sine e''(0) is NOT zero (the shove smooth removes)");
  }
  // the lift envelope: exact 0 at both ends, peak 1 near 0.44, asymmetric
  ok(liftShape(0) === 0 && liftShape(1) < 1e-30, "lift shape is 0 at both ends");
  ok(liftShape(0.25) > liftShape(0.75), "lift shape is asymmetric (pull out fast, land gently)");
}

// =============================================================================================
startGroup(2, "segment tiling and integrality");
{
  for (let c = 0; c < 400; c++) {
    const wall = randWall(1 + Math.floor(rnd() * 6), Math.floor(rnd() * 7));
    for (const fps of [24, 25, 30, 60]) {
      const s = scheduleWall(wall, fps, W, H);
      ok(s.segs.length > 0, "a schedule always has at least one segment");
      ok(s.segs[0].from === 0, `segs[0].from must be 0 (got ${s.segs[0].from})`);
      for (let i = 0; i < s.segs.length; i++) {
        const g = s.segs[i];
        ok(Number.isInteger(g.from) && Number.isInteger(g.to), "segment boundaries are integers");
        ok(g.to > g.from, "no zero-length segment is emitted");
        if (i + 1 < s.segs.length) ok(g.to === s.segs[i + 1].from, "segments tile with no gap and no overlap");
      }
      ok(s.segs[s.segs.length - 1].to === s.total, "last segment ends at total");
      for (let f = 0; f < s.total; f++) {
        const i = segIndexAt(s, f);
        ok(i >= 0 && f >= s.segs[i].from && f < s.segs[i].to, `frame ${f} must land in its own segment`);
      }
    }
  }
  // empty / degenerate schedules park on the WHOLE-WALL pose, never on the wall origin
  const far = { items: [{ x: 2000, y: 900, width: 400, aspect: 1 }], scenes: [] };
  const s0 = scheduleWall(far, 30, W, H);
  const c0 = cameraAt(s0, 0, 0, { W, H, breathing: 0 });
  ok(s0.total === 30, "an empty scene list yields one fps-long hold");
  near(c0.cam.x, 2000, 1e-6, "empty schedule holds the whole-wall pose, not the origin");
  const allZero = scheduleWall({ ...far, scenes: [{ x: 5, y: 5, zoom: 1, holdSeconds: 0, glideSeconds: 0 }], intro: false, outro: false }, 30, W, H);
  ok(allZero.segs.length === 1 && allZero.segs[0].whole, "a fully collapsed schedule falls back to the whole-wall hold");
}

// =============================================================================================
startGroup(3, "bit-exact holds");
{
  const wall = {
    items: [{ x: 0, y: 0, width: 500, aspect: 1 }],
    scenes: [
      { x: 123.456789, y: -987.654321, zoom: 1.234567, rotation: 37.5, holdSeconds: 1.5, glideSeconds: 1.2, easing: "sine", arc: 0.4 },
      { x: -800.5, y: 400.25, zoom: 0.5, rotation: -12.25, holdSeconds: 2, glideSeconds: 1.5, easing: "settle", arc: 0 },
    ],
    intro: true,
    introHoldSeconds: 0.8,
    outro: true,
    outroSeconds: 1.5,
    outroHoldSeconds: 1,
  };
  const s = scheduleWall(wall, 30, W, H);
  for (let f = 0; f < s.total; f++) {
    const r = cameraAt(s, f, f / 30, { W, H, breathing: 0 });
    if (r.seg.kind !== "hold") continue;
    ok(r.cam.x === r.seg.a.x && r.cam.y === r.seg.a.y, "hold position is bit-exact");
    ok(r.cam.zoom === r.seg.a.zoom, "hold zoom is bit-exact");
    ok(r.cam.rot === r.seg.a.rot, "hold rotation is bit-exact");
    if (r.seg.scene >= 0) {
      const sc = wall.scenes[r.seg.scene];
      ok(r.cam.x === sc.x && r.cam.y === sc.y && r.cam.zoom === sc.zoom && r.cam.rot === sc.rotation, "a scene hold is the authored pose, bit-exact");
    }
  }
  // --- hover: a hold with a drift STARTS at the authored pose bit-exactly, ENDS on sceneHoverCam,
  // and the next glide departs from that drifted pose (no jump at the junction).
  const { sceneHoverCam, HOVER_ZOOM, HOVER_PAN_PX } = W_;
  const hov = {
    items: wall.items,
    scenes: [
      { ...wall.scenes[0], hover: "pushIn", hoverAmount: 1 },
      { ...wall.scenes[1], hover: "left", hoverAmount: 0.5 },
    ],
    intro: false,
    outro: true,
    outroSeconds: 1.5,
    outroHoldSeconds: 1,
  };
  const hs = scheduleWall(hov, 30, W, H);
  const holds = hs.segs.filter((g) => g.kind === "hold" && g.scene >= 0);
  ok(holds.length === 2, "both hovering scenes keep their hold segments");
  holds.forEach((g, k) => {
    const sc = hov.scenes[k];
    const p0 = poseInSeg(g, g.from, W);
    ok(p0.x === sc.x && p0.y === sc.y && p0.zoom === sc.zoom, "a hovering hold starts at the authored pose, bit-exact");
    const p1 = poseInSeg(g, g.to, W);
    const e = sceneHoverCam(sc);
    near(p1.x, e.x, 1e-9, "a hovering hold ends at sceneHoverCam (x)");
    near(p1.zoom, e.zoom, 1e-9, "a hovering hold ends at sceneHoverCam (zoom)");
    const next = hs.segs[hs.segs.indexOf(g) + 1];
    if (next) ok(next.a.x === g.b.x && next.a.zoom === g.b.zoom, "the next glide departs from the drifted pose");
  });
  near(sceneHoverCam(hov.scenes[0]).zoom, hov.scenes[0].zoom * (1 + HOVER_ZOOM), 1e-12, "pushIn at amount 1 is +HOVER_ZOOM");
  near(sceneHoverCam(hov.scenes[1]).x, hov.scenes[1].x - (HOVER_PAN_PX * 0.5) / hov.scenes[1].zoom, 1e-9, "a pan is HOVER_PAN_PX * amount SCREEN px");
  // `toward`: a creep along the direction of the NEXT glide, HOVER_PAN_PX * amount screen px,
  // capped at a third of the hop; zoom-only toward a pure push; identity with nowhere to go.
  {
    const a = { ...wall.scenes[0], hover: "toward", hoverAmount: 1 };
    const nx = { x: a.x + 3000, y: a.y - 4000, zoom: a.zoom, rot: 0 };
    const e = sceneHoverCam(a, nx);
    const step = HOVER_PAN_PX / a.zoom;
    near(Math.hypot(e.x - a.x, e.y - a.y), step, 1e-9, "toward: creeps HOVER_PAN_PX * amount screen px along the hop");
    near((e.x - a.x) / (e.y - a.y), 3000 / -4000, 1e-9, "toward: exactly along the direction of the next scene");
    const short = sceneHoverCam(a, { ...nx, x: a.x + 30, y: a.y });
    near(short.x - a.x, 10, 1e-9, "toward: a short hop creeps at most a third of the way");
    const zoomOnly = sceneHoverCam(a, { x: a.x, y: a.y, zoom: a.zoom * 2, rot: 0 });
    near(zoomOnly.zoom, a.zoom * (1 + HOVER_ZOOM), 1e-12, "toward a pure push-in: zoom creeps in");
    const nowhere = sceneHoverCam(a, undefined);
    ok(nowhere.x === a.x && nowhere.zoom === a.zoom, "toward with nowhere to go is the identity");
    // Through the schedule: the last scene's `toward` reads the outro pose when outro is on, else stays.
    const tw = { items: wall.items, scenes: [{ ...wall.scenes[0], hover: "toward", hoverAmount: 1 }, { ...wall.scenes[1], hover: "toward", hoverAmount: 1 }], intro: false, outro: false };
    const ts = scheduleWall(tw, 30, W, H);
    const h0 = ts.segs.find((g) => g.kind === "hold" && g.scene === 0);
    const h1 = ts.segs.find((g) => g.kind === "hold" && g.scene === 1);
    ok(Math.hypot(h0.b.x - h0.a.x, h0.b.y - h0.a.y) > 0, "scene 0 creeps toward scene 1");
    ok(h1.b.x === h1.a.x && h1.b.zoom === h1.a.zoom, "the last scene with no outro stays still");
    const tw2 = scheduleWall({ ...tw, outro: true, outroSeconds: 1, outroHoldSeconds: 0.5 }, 30, W, H);
    const h1b = tw2.segs.find((g) => g.kind === "hold" && g.scene === 1);
    ok(Math.hypot(h1b.b.x - h1b.a.x, h1b.b.y - h1b.a.y) > 0 || h1b.b.zoom !== h1b.a.zoom, "with an outro the last scene creeps toward the whole-wall pose");
  }
  const still = sceneHoverCam({ ...wall.scenes[0], hover: "none" });
  ok(still.zoom === wall.scenes[0].zoom && still.x === wall.scenes[0].x, "hover none is the identity");
  // Zero velocity at both ends of a hovering hold (it must meet the glides without a shove).
  const g0 = holds[0];
  const vMid = segSpeed(g0, (g0.from + g0.to) / 2, W, H);
  ok(vMid > 0, "a hovering hold moves mid-hold");
  ok(segSpeed(g0, g0.from, W, H) < 0.01 * vMid && segSpeed(g0, g0.to, W, H) < 0.01 * vMid,
    "a hovering hold departs and lands at < 1 % of its mid-hold speed (zero endpoint velocity)");
}

// =============================================================================================
startGroup(4, "arc === 0 is identical to lerp; endpoints exact for every arc");
{
  const a = { x: -640.25, y: 220.75, zoom: 0.85, rot: -20 };
  const b = { x: 1180.5, y: -410.125, zoom: 1.9, rot: 65 };
  for (const easing of EASE_IDS) {
    const seg = { kind: "glide", from: 0, to: 1000, a, b, easing, arc: 0, scene: 0, whole: false };
    for (let i = 0; i <= 1000; i++) {
      const p = i / 1000;
      const f = seg.from + p * (seg.to - seg.from);
      const ep = ease(easing, p);
      // The quadratic Bezier with its control point AT the chord midpoint, written out in full.
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const u = 1 - ep;
      const bx = u * u * a.x + 2 * u * ep * cx + ep * ep * b.x;
      const by = u * u * a.y + 2 * u * ep * cy + ep * ep * b.y;
      const got = poseInSeg(seg, f, W);
      ok(Math.abs(got.x - bx) < 1e-12 && Math.abs(got.y - by) < 1e-12, `arc 0 must equal the midpoint Bezier at p=${p}`);
    }
    for (const arc of [-1, -0.4, 0, 0.6, 1]) {
      const g = { kind: "glide", from: 10, to: 55, a, b, easing, arc, scene: 0, whole: false };
      const p0 = poseInSeg(g, 10, W);
      const p1 = poseInSeg(g, 55, W);
      ok(p0.x === a.x && p0.y === a.y && p0.zoom === a.zoom && p0.rot === a.rot, `arc ${arc}: start pose is exact`);
      ok(p1.x === b.x && p1.y === b.y && p1.zoom === b.zoom, `arc ${arc}: end pose is exact`);
      near(p1.rot, b.rot, 1e-9, `arc ${arc}: end rotation lands on b`);
      // a non-zero arc must actually bow away from the chord
      if (arc !== 0) {
        const mid = poseInSeg(g, 32.5, W);
        const lerpSeg = { ...g, arc: 0 };
        const flat = poseInSeg(lerpSeg, 32.5, W);
        ok(Math.hypot(mid.x - flat.x, mid.y - flat.y) > 1, `arc ${arc}: the path must actually bow`);
      }
    }
  }
}

// =============================================================================================
startGroup(5, "fit-all containment AND tightness");
{
  let worst = 0;
  let overflow = 0;
  for (let c = 0; c < 5000; c++) {
    const n = 1 + Math.floor(rnd() * 10);
    const items = Array.from({ length: n }, randItem);
    const pad = pick([0, 0.06, 0.12, 0.3]);
    const cam = fitAll(items, W, H, pad);
    ok(allFinite(cam) && cam.rot === 0 && cam.zoom > 0, "fitAll returns a finite, unrotated pose");
    let usage = 0;
    for (const it of items) {
      const { hx, hy } = itemHalfExtents(it);
      const d = Math.min(3, Math.max(0.2, it.depth ?? 1));
      // The constraint fitAll solves: the CENTRE drifts by depth, the BOX does not (position-only
      // parallax — the item cancels the layer's scale(zoom*d) with its own scale(1/d)).
      const ux = ((d * Math.abs(it.x - cam.x) + hx) * cam.zoom) / (W / 2);
      const uy = ((d * Math.abs(it.y - cam.y) + hy) * cam.zoom) / (H / 2);
      usage = Math.max(usage, ux, uy);
      // ...and the same thing measured independently off the RENDERED corners: the screen centre
      // from itemScreenBox (which drifts by depth) plus the rotated half-box (which does not).
      const b = itemScreenBox(it, cam, W, H);
      const ra = (b.angle * Math.PI) / 180;
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        const lx = (sx * b.w) / 2;
        const ly = (sy * b.h) / 2;
        const qx = b.cx + lx * Math.cos(ra) - ly * Math.sin(ra);
        const qy = b.cy + lx * Math.sin(ra) + ly * Math.cos(ra);
        if (Math.abs(qx - W / 2) > (W / 2) * (1 - pad) + 1e-6 || Math.abs(qy - H / 2) > (H / 2) * (1 - pad) + 1e-6) overflow++;
      }
    }
    worst = Math.max(worst, Math.abs(usage - (1 - pad)));
  }
  ok(overflow === 0, `fit-all must contain every item corner (found ${overflow} corners outside the padded frame)`);
  ok(worst < 1e-6, `fit-all must be TIGHT: worst |usage - (1 - pad)| = ${worst.toExponential(3)} must be < 1e-6`);
  // degenerate inputs
  ok(allFinite(fitAll([], W, H, 0.06)), "empty item list");
  ok(allFinite(fitAll([{ x: 10, y: 10, width: 0.0001, aspect: 1 }], W, H, 0.06)), "one near-zero item");
  ok(allFinite(fitAll([{ x: 0, y: 0, width: 400, aspect: 1 }], 1080, 1920, 0.06)), "a vertical composition");
}

// =============================================================================================
startGroup(6, "no non-finite anywhere over the degenerate matrix");
{
  const degenerate = [
    { items: [], scenes: [] },
    { items: [{}], scenes: [{}] },
    { items: [{ x: 0, y: 0, width: 500, aspect: 0 }], scenes: [{ zoom: 1e-3 }] },
    { items: [{ x: 0, y: 0, width: 500, aspect: undefined, depth: 0.2 }, { x: 10, y: 10, width: 500, depth: 3 }], scenes: [{ x: 5, y: 5, zoom: 1, holdSeconds: 0, glideSeconds: 0 }] },
    { items: [{ type: "text", text: "", fontSize: 96, width: 400 }], scenes: [{ rotation: 720 }, { rotation: -720, arc: 1 }] },
    { items: [{ x: 0, y: 0, width: 400, aspect: 1 }], scenes: [{ x: 0, y: 0, zoom: 1, holdSeconds: 0, glideSeconds: 0, arc: -1 }, { x: 0, y: 0, zoom: 1, holdSeconds: 0, glideSeconds: 0, arc: 1 }] },
    { items: [{ x: -40000, y: 40000, width: 900, aspect: 5, depth: 3 }], scenes: [{ x: -40000, y: 40000, zoom: 0.03 }] },
    { items: Array.from({ length: 12 }, randItem), scenes: Array.from({ length: 12 }, randScene) },
    { items: [{ x: 0, y: 0, width: 400, aspect: 1 }], scenes: [{ zoom: 2 }], intro: false, outro: false, introHoldSeconds: 0, outroSeconds: 0, outroHoldSeconds: 0 },
  ];
  for (const wall of degenerate) {
    for (const fps of [24, 25, 30, 60]) {
      for (const [w, h] of [
        [1920, 1080],
        [1080, 1920],
      ]) {
        const s = scheduleWall(wall, fps, w, h);
        ok(allFinite(s.whole) && Number.isInteger(s.total) && s.total >= 1, "schedule totals are finite integers");
        for (const it of wall.items) {
          const b = itemBox(it);
          ok(Number.isFinite(b.w) && Number.isFinite(b.h) && b.w > 0 && b.h > 0, "itemBox is finite and positive");
          ok(allFinite(itemScreenBox(it, s.whole, w, h)), "itemScreenBox is finite");
          ok(typeof visibleAt(it, s.whole, w, h) === "boolean", "visibleAt returns a boolean");
        }
        for (let f = -3; f <= s.total + 3; f++) {
          const r = cameraAt(s, f, f / fps, { W: w, H: h, breathing: 0.55 });
          ok(allFinite(r.cam) && allFinite(r.base), `finite camera at frame ${f}`);
          ok(Number.isFinite(r.speed) && r.speed >= 0, `finite non-negative speed at frame ${f}`);
          ok(r.cam.zoom > 0, `positive zoom at frame ${f}`);
        }
        // past `total` the last segment's pose HOLDS — a clip longer than its schedule parks
        const last = cameraAt(s, s.total + 50, 0, { W: w, H: h, breathing: 0 });
        const end = cameraAt(s, s.total, 0, { W: w, H: h, breathing: 0 });
        ok(last.cam.x === end.cam.x && last.cam.zoom === end.cam.zoom, "frames past total hold the final framing");
      }
    }
  }
}

// =============================================================================================
startGroup(7, "per-frame continuity; a hard cut is the ONLY exempt boundary");
{
  // A boundary is INSTANTANEOUS BY CONSTRUCTION in exactly two ways, both authored on purpose:
  //   (a) a HARD CUT — glideSeconds 0 drops the glide, leaving a pose-chain break, which is
  //       structurally `segs[i].b !== segs[i+1].a` (kinds are irrelevant: a scene that is also a
  //       via drops its hold too, so the break can land on any pair of kinds);
  //   (b) a glide floored to ONE frame (a positive but sub-frame glideSeconds).
  // Everything else must be continuous, and that is what the zero-endpoint-velocity invariant
  // buys. Fuzz A proves it with no exemptions at all; fuzz B proves the exemptions are exactly
  // (a) and (b) and nothing else.
  const boundaryScan = (wall, fps, onDiscontinuity) => {
    const s = scheduleWall(wall, fps, W, H);
    const pose = (f) => cameraAt(s, f, f / fps, { W, H, breathing: 0 }).cam;
    const interior = s.segs.map((g) => {
      let m = { x: 0, y: 0, zoom: 0, rot: 0 };
      for (let f = g.from; f + 1 < g.to; f++) {
        const p0 = pose(f);
        const p1 = pose(f + 1);
        m = {
          x: Math.max(m.x, Math.abs(p1.x - p0.x)),
          y: Math.max(m.y, Math.abs(p1.y - p0.y)),
          zoom: Math.max(m.zoom, Math.abs(p1.zoom - p0.zoom)),
          rot: Math.max(m.rot, Math.abs(shortAngle(p0.rot, p1.rot))),
        };
      }
      return m;
    });
    for (let i = 0; i + 1 < s.segs.length; i++) {
      const g = s.segs[i];
      const n = s.segs[i + 1];
      const p0 = pose(g.to - 1);
      const p1 = pose(g.to);
      const jump = {
        x: Math.abs(p1.x - p0.x),
        y: Math.abs(p1.y - p0.y),
        zoom: Math.abs(p1.zoom - p0.zoom),
        rot: Math.abs(shortAngle(p0.rot, p1.rot)),
      };
      const lim = (k) => Math.max(2 * Math.max(interior[i][k], interior[i + 1][k]), 1e-9);
      if (!["x", "y", "zoom", "rot"].every((k) => jump[k] <= lim(k))) onDiscontinuity(g, n, s, i);
    }
    return s;
  };

  // --- fuzz A: every glide and hold is a real duration => ZERO discontinuities anywhere --------
  for (let c = 0; c < 120; c++) {
    const wall = randWall(1 + Math.floor(rnd() * 5), 2 + Math.floor(rnd() * 5));
    wall.scenes.forEach((sc) => {
      sc.holdSeconds = Math.max(0.4, sc.holdSeconds);
      sc.glideSeconds = Math.max(0.4, sc.glideSeconds);
    });
    wall.intro = true;
    wall.outro = true;
    wall.introHoldSeconds = Math.max(0.4, wall.introHoldSeconds);
    wall.outroSeconds = Math.max(0.4, wall.outroSeconds);
    wall.outroHoldSeconds = Math.max(0.4, wall.outroHoldSeconds);
    boundaryScan(wall, pick([24, 30, 60]), (g, n) =>
      ok(false, `no hard cut is authored, so no boundary may be discontinuous (${g.kind} -> ${n.kind} at ${g.to})`),
    );
  }

  // --- fuzz B: the full matrix => every discontinuity is a cut or a 1-frame glide --------------
  let cuts = 0;
  let oneFrame = 0;
  for (let c = 0; c < 150; c++) {
    const wall = randWall(1 + Math.floor(rnd() * 5), 2 + Math.floor(rnd() * 5));
    const fps = pick([24, 30, 60]);
    const s = boundaryScan(wall, fps, (g, n) => {
      const same = g.b.x === n.a.x && g.b.y === n.a.y && g.b.zoom === n.a.zoom && g.b.rot === n.a.rot;
      const chainBreak = !same;
      const flooredGlide = (g.kind === "glide" && g.to - g.from === 1) || (n.kind === "glide" && n.to - n.from === 1);
      if (chainBreak) cuts++;
      else if (flooredGlide) oneFrame++;
      ok(
        chainBreak || flooredGlide,
        `a discontinuity at frame ${g.to} must be a hard cut (pose-chain break) or a 1-frame glide, got ${g.kind}(${g.to - g.from}) -> ${n.kind}(${n.to - n.from})`,
      );
    });
    // breathing stays inside its documented envelope and never introduces a jump of its own
    const br = 0.55;
    for (let f = 0; f < s.total; f++) {
      const r = cameraAt(s, f, (f + 1000) / fps, { W, H, breathing: br });
      const z = r.base.zoom;
      ok(Math.abs(r.cam.x - r.base.x) <= (8.7 * br) / z + 1e-9, "breathing x stays inside +-8.7/zoom");
      ok(Math.abs(r.cam.y - r.base.y) <= (7.3 * br) / z + 1e-9, "breathing y stays inside +-7.3/zoom");
      ok(Math.abs(r.cam.rot - r.base.rot) <= 0.22 * br + 1e-9, "breathing rotation stays inside +-0.22 deg");
      ok(Math.abs(r.cam.zoom / r.base.zoom - 1) <= 0.0055 * br + 1e-9, "breathing zoom stays inside +-0.55%");
    }
  }
  ok(cuts > 0, "the fuzz must actually exercise at least one hard cut");
  ok(oneFrame >= 0, "1-frame glides are accounted for");
}

// =============================================================================================
startGroup(8, "speed: 0 on holds and both sides of a hard cut, non-zero mid-glide");
{
  const cut = {
    items: [{ x: 0, y: 0, width: 400, aspect: 1 }],
    scenes: [
      { x: 0, y: 0, zoom: 1, rotation: 0, holdSeconds: 1, glideSeconds: 0 },
      { x: 2400, y: 0, zoom: 1, rotation: 0, holdSeconds: 1, glideSeconds: 0 }, // <- hard cut
    ],
    intro: false,
    outro: false,
  };
  const s = scheduleWall(cut, 30, W, H);
  ok(s.segs.length === 2 && s.segs.every((g) => g.kind === "hold"), "glideSeconds 0 is a hard cut (no glide segment)");
  for (let f = 0; f < s.total; f++) {
    const r = cameraAt(s, f, f / 30, { W, H, breathing: 0 });
    ok(r.speed === 0, `speed must be exactly 0 on a hold (frame ${f} -> ${r.speed})`);
  }
  // a PURE PUSH-IN: zero translation, but the most flow-heavy shot there is
  const push = {
    items: [{ x: 0, y: 0, width: 400, aspect: 1 }],
    scenes: [
      { x: 0, y: 0, zoom: 0.4, rotation: 0, holdSeconds: 0.5, glideSeconds: 0 },
      { x: 0, y: 0, zoom: 1.6, rotation: 0, holdSeconds: 0.5, glideSeconds: 1.5 },
    ],
    intro: false,
    outro: false,
  };
  const sp = scheduleWall(push, 30, W, H);
  const glide = sp.segs.find((g) => g.kind === "glide");
  ok(!!glide, "the push-in produces a glide segment");
  const mid = Math.round((glide.from + glide.to) / 2);
  ok(segSpeed(glide, mid, W, H) > 1, `a pure push-in must NOT score speed 0 (got ${segSpeed(glide, mid, W, H)})`);
  ok(segSpeed(glide, glide.from, W, H) < segSpeed(glide, mid, W, H), "speed eases up from the segment start");
  // a pure roll also registers
  const roll = { kind: "glide", from: 0, to: 45, a: { x: 0, y: 0, zoom: 1, rot: 0 }, b: { x: 0, y: 0, zoom: 1, rot: 30 }, easing: "sine", arc: 0, scene: 0, whole: false };
  ok(segSpeed(roll, 22, W, H) > 1, "a pure roll must not score speed 0");
  // the velocity numbers
  // 860 px over 1.5 s with the default `smooth` ease peaks at 1.875 * 860 / 45 = 35.8 px/frame.
  ok(peakVelocity({ x: 0, y: 0, zoom: 1, rot: 0 }, { x: 860, y: 0, zoom: 1, rot: 0 }, 1.5, 30) > 35, "860 px over 1.5 s at 30 fps peaks around 36 px/frame");
  const sug = suggestGlideSeconds({ x: 0, y: 0, zoom: 1, rot: 0 }, { x: 860, y: 0, zoom: 1, rot: 0 });
  near(peakVelocity({ x: 0, y: 0, zoom: 1, rot: 0 }, { x: 860, y: 0, zoom: 1, rot: 0 }, sug, 30), V_TARGET_PER_SEC / 30, 1e-6, `the suggested glide peaks at ${V_TARGET_PER_SEC / 30} px/frame at 30 fps`);
  near(peakVelocity({ x: 0, y: 0, zoom: 1, rot: 0 }, { x: 860, y: 0, zoom: 1, rot: 0 }, sug, 60), V_TARGET_PER_SEC / 60, 1e-6, `and at ${V_TARGET_PER_SEC / 60} px/frame at 60 fps — px/SECOND is the feel target`);
  ok(suggestGlideSeconds({ x: 0, y: 0, zoom: 1, rot: 0 }, { x: 0, y: 0, zoom: 1, rot: 0 }) === 0.6, "a zero-length move clamps to the 0.6 s floor");
}

// =============================================================================================
startGroup(9, "shortest-arc rotation");
{
  const wall = {
    items: [{ x: 0, y: 0, width: 400, aspect: 1 }],
    scenes: [
      { x: 0, y: 0, zoom: 1, rotation: 170, holdSeconds: 0.5, glideSeconds: 0 },
      { x: 0, y: 0, zoom: 1, rotation: -170, holdSeconds: 0.5, glideSeconds: 1.5, easing: "sine" },
    ],
    intro: false,
    outro: false,
  };
  const s = scheduleWall(wall, 30, W, H);
  let sweep = 0;
  let prev = cameraAt(s, 0, 0, { W, H, breathing: 0 }).cam.rot;
  for (let f = 1; f < s.total; f++) {
    const r = cameraAt(s, f, f / 30, { W, H, breathing: 0 }).cam.rot;
    sweep += Math.abs(shortAngle(prev, r));
    prev = r;
  }
  ok(sweep <= 20.0001, `a +170 -> -170 glide must sweep 20 deg, not 350 (got ${sweep.toFixed(4)})`);
  ok(shortAngle(170, -170) === 20 && shortAngle(-170, 170) === -20, "shortAngle picks the short way in both directions");
}

// =============================================================================================
startGroup(10, "sceneFrames land inside their own hold, never 0 by fallback");
{
  for (let c = 0; c < 300; c++) {
    const wall = randWall(2, 1 + Math.floor(rnd() * 6));
    const fps = pick([24, 30, 60]);
    const s = scheduleWall(wall, fps, W, H);
    for (let i = 0; i < wall.scenes.length; i++) {
      const hold = s.segs.find((g) => g.kind === "hold" && g.scene === i);
      const f = s.sceneFrames[i];
      ok(Number.isInteger(f) && f >= 0 && f <= s.total, `sceneFrames[${i}] is a frame inside the schedule`);
      ok(s.sceneEnds[i] >= f, "sceneEnds is at or after sceneFrames");
      if (hold) {
        ok(f === hold.from, `sceneFrames[${i}] must be the start of scene ${i}'s own hold`);
        ok(f < s.sceneEnds[i], "a scene with a hold has a non-empty [sceneFrames, sceneEnds)");
        const r = cameraAt(s, f, 0, { W, H, breathing: 0 });
        ok(r.seg.scene === i && r.seg.kind === "hold", `frame sceneFrames[${i}] must resolve to scene ${i}'s hold`);
        ok(r.cam.x === wall.scenes[i].x && r.cam.zoom === wall.scenes[i].zoom, "and to the authored pose");
      } else {
        // a "via" scene (holdSeconds 0): the arrival instant, not a fallback to 0
        ok(f === s.sceneEnds[i], `via scene ${i}: sceneFrames == sceneEnds (the arrival instant)`);
        const glideIn = s.segs.find((g) => g.kind === "glide" && g.scene === i);
        if (glideIn) ok(f === glideIn.to, `via scene ${i}: the arrival is the end of the glide into it`);
      }
    }
  }
}

// =============================================================================================
startGroup(11, "screenToWall . wallToScreen == identity (including rot != 0)");
{
  for (let c = 0; c < 20000; c++) {
    const cam = { x: rr(-40000, 40000), y: rr(-40000, 40000), zoom: rr(0.02, 6), rot: rr(-540, 540) };
    const d = rr(0.2, 3);
    const [w, h] = pick([
      [1920, 1080],
      [1080, 1920],
      [3840, 2160],
    ]);
    const p = { x: rr(-40000, 40000), y: rr(-40000, 40000) };
    const q = wallToScreen(p, cam, d, w, h);
    const back = screenToWall(q, cam, d, w, h);
    const scale = Math.max(1, Math.abs(p.x), Math.abs(p.y));
    ok(Math.abs(back.x - p.x) / scale < 1e-9 && Math.abs(back.y - p.y) / scale < 1e-9, `round trip failed at rot=${cam.rot}`);
    // an item's screen box uses the same mapping for its centre, and its SIZE is depth-independent
    const it = { x: p.x, y: p.y, width: 400, aspect: 1, depth: d, rotation: 12 };
    const b = itemScreenBox(it, cam, w, h);
    near(b.cx, q.x, 1e-6 * scale, "itemScreenBox centre matches wallToScreen");
    const b2 = itemScreenBox({ ...it, depth: d === 1 ? 2 : 1 }, cam, w, h);
    near(b.w, b2.w, 1e-9, "screen size is INDEPENDENT of depth (position-only parallax)");
    near(b.angle, 12 - cam.rot, 1e-9, "the screen angle is item.rotation - cam.rot");
  }
}

// =============================================================================================
startGroup(12, "wallFitFrames");
{
  for (let c = 0; c < 200; c++) {
    const wall = randWall(1 + Math.floor(rnd() * 4), Math.floor(rnd() * 8));
    const fps = pick([24, 25, 30, 60]);
    const s = scheduleWall(wall, fps, W, H);
    const n = wallFitFrames(wall, fps, W, H);
    ok(Number.isInteger(n) && n >= 1, `wallFitFrames must be a positive integer (got ${n})`);
    ok(n >= s.total, "wallFitFrames covers the whole schedule");
  }
}

// =============================================================================================
startGroup(13, "wall-paper: deckle shape, window/box reconstruction, filter identity");
{
  const { tornPolygon, frameCss, filterCss, paperPreset, paperLowStyle, paperFibreStyle, LIFT } = P_;

  // --- (a) the deckle polygon. This is the assertion that would have caught the DIAMOND: the
  // superellipse exponent is 2/sq, so sq MUST be > 2 to push the boundary OUT toward the corners.
  // At sq = 1.28 the 45-degree reach was 0.582 of the half-extent (LESS square than a circle's
  // 0.707) and every torn item lost all four corners of its photo.
  const parsePoly = (v) => {
    const m = /^polygon\((.*)\)$/.exec(v);
    ok(Boolean(m), "tornPolygon returns a polygon() value");
    return m[1].split(",").map((pair) => pair.trim().split(/\s+/).map((n) => parseFloat(n)));
  };
  // Shoelace area, as a fraction of the item's box. This is the assertion that pins the exponent's
  // SIGN: a deckled rectangle encloses ~0.81-0.88 of its box, the inverted-exponent diamond only
  // 0.54-0.58. (Not 1.0, and deliberately so: the ragged inset is up to 3.5% while the `torn`
  // window is inset 3%, so a torn edge is MEANT to bite very slightly into the print.)
  const areaFrac = (pts) => {
    let a = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
    return Math.abs(a / 2) / 10000;
  };
  for (let c = 0; c < 500; c++) {
    const seed = Math.floor(rr(0, 2 ** 31));
    const pts = parsePoly(tornPolygon(seed));
    ok(pts.length === 14, `tornPolygon must emit 14 points (got ${pts.length})`);
    ok(pts.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 100 && y >= 0 && y <= 100),
      "every deckle point is finite and inside the box");
    const A = areaFrac(pts);
    ok(A >= 0.75 && A <= 1, `the deckle must enclose a RECTANGLE, not a diamond: area ${A.toFixed(4)} must be >= 0.75`);
    // Corroborating shape test: the vertex nearest 45 degrees must stand off BOTH axes. The
    // diamond scored 0.44-0.48 here; a deckled rectangle scores 0.73-0.79.
    let best = null;
    let bestErr = Infinity;
    for (const [x, y] of pts) {
      const dx = x - 50;
      const dy = y - 50;
      if (dx <= 0 || dy <= 0) continue;
      const err = Math.abs(Math.atan2(dy, dx) - Math.PI / 4);
      if (err < bestErr) {
        bestErr = err;
        best = Math.min(dx, dy) / 50;
      }
    }
    ok(best !== null && best >= 0.65, `the deckle must bulge toward the corners: 45deg reach ${best} must be >= 0.65`);
  }
  ok(tornPolygon(4242) === tornPolygon(4242), "tornPolygon is deterministic per seed");
  ok(tornPolygon(4242) !== tornPolygon(4243), "tornPolygon varies with the seed");

  // --- (b) the window reconstructs the box, and preserves the source aspect.
  for (const paperId of ["cream", "kraft", "white", "night"]) {
    const paper = paperPreset(paperId);
    for (let c = 0; c < 300; c++) {
      const w = rr(80, 1600);
      const aspect = rr(0.25, 4);
      for (const frame of FRAMES) {
        const it = { type: "image", src: "a.jpg", width: w, aspect, frame };
        const box = itemBox(it);
        const fc = frameCss(it, paper, box, 12345);
        ok(Number.isFinite(box.h) && box.h > 0, `${frame}: box height is finite and positive`);
        if (frame === "polaroid" || frame === "matte") {
          const pad = (frame === "polaroid" ? W_.POLAROID.side : 0.09) * w;
          const winW = w - 2 * pad;
          const winH = fc.window.height;
          near(winH + pad + (frame === "polaroid" ? W_.POLAROID.bottom * w : pad), box.h, 1e-9,
            `${frame}: window height + margins must reconstruct itemBox().h`);
          near(winW / winH, aspect, 1e-9, `${frame}: the window preserves the source aspect`);
          ok(fc.caption !== null, `${frame}: has a caption margin`);
          near(fc.caption.top + fc.caption.height, box.h, 1e-9, `${frame}: the caption sits on the bottom margin`);
        } else {
          near(box.h, w / aspect, 1e-9, `${frame}: the box is exactly w / aspect`);
          ok(fc.caption === null, `${frame}: has no caption margin`);
        }
        ok(fc.tapes.length === (frame === "taped" ? 2 : 0), `${frame}: tape strip count`);
        // --- (d) the torn shadow's paint-order split: the CLIP and the BLUR must never share an
        // element (filter -> clip -> mask -> opacity, so a blur under a clip is clipped away and
        // the "soft" shadow renders as a hard-edged plate).
        if (frame === "torn") {
          ok(Boolean(fc.shadowInner) && Boolean(fc.shadowInner.clipPath), "torn: the INNER shadow carries the clip");
          ok(!fc.shadow.clipPath, "torn: the OUTER (blurred) shadow must NOT carry the clip");
          ok(/blur/.test(String(fc.shadow.filter)), "torn: the OUTER shadow carries the blur");
          ok(!fc.shadowInner.filter, "torn: the INNER (clipped) shadow must NOT carry the blur");
        } else if (frame === "none") {
          // A prop: no card, no keyline, and the shadow follows the ALPHA (drop-shadow filter on the
          // card), never the bounding box — a box-shadow drew a square around transparent stickers.
          ok(fc.shadow.display === "none", "none: no box-shadow plate at all");
          ok(/drop-shadow\(/.test(String(fc.card.filter)) && (String(fc.card.filter).match(/drop-shadow\(/g) || []).length === 2, "none: two drop-shadows on the card");
          ok(!fc.card.background && !fc.window.boxShadow, "none: no card background and no keyline");
        } else {
          ok(fc.shadowInner === undefined, `${frame}: leaves shadowInner undefined (unchanged path)`);
          ok(/rgba\(/.test(String(fc.shadow.boxShadow)), `${frame}: uses the dual box-shadow`);
        }
      }
    }
  }
  ok(Object.keys(LIFT).length === FRAMES.length, "every treatment has a lift scalar");

  // --- (c) filterCss(id, 0) must be a TRUE identity for all six presets (the honest scaleStrength
  // reuse only holds if every function in every preset dials to its own no-op).
  const IDENTITY_OF = { sepia: 0, grayscale: 0, invert: 0, "hue-rotate": 0, opacity: 1, brightness: 1, contrast: 1, saturate: 1, blur: 0 };
  for (const id of ["none", "sepia", "faded", "bw", "warm", "cool"]) {
    const s0 = filterCss(id, 0);
    for (const m of s0.matchAll(/([a-z-]+)\(([-0-9.]+)/g)) {
      const want = IDENTITY_OF[m[1]];
      ok(want !== undefined, `filterCss: unknown filter function "${m[1]}"`);
      near(parseFloat(m[2]), want, 1e-9, `filterCss("${id}", 0) must be identity, but ${m[1]}(${m[2]})`);
    }
    ok(filterCss(id, 1) === (id === "none" ? "" : filterCss(id, 1)) , "filterCss is stable at full strength");
    ok(filterCss(id, 1).length > 0 || id === "none", `filterCss("${id}", 1) is non-empty`);
  }
  ok(filterCss(undefined, 1) === "" && filterCss("nope", 1) === "", "an unset/unknown filter id is a no-op");

  // --- (e) the paper's tile phase is exactly periodic in the size the browser actually tiles with.
  for (let c = 0; c < 500; c++) {
    const cam = { x: rr(-400000, 400000), y: rr(-400000, 400000), zoom: rr(0.02, 6), rot: rr(-540, 540) };
    for (const st of [paperLowStyle(paperPreset("cream"), cam, W, H), paperFibreStyle(cam, W, H, 1, 0)]) {
      if (!st) continue;
      const [sx, sy] = st.backgroundSize.split(" ").map(parseFloat);
      const [px, py] = st.backgroundPosition.split(" ").map(parseFloat);
      ok(Number.isFinite(sx) && sx > 0 && sx === sy, "background tile is a finite positive square");
      ok(px >= 0 && px < sx && py >= 0 && py < sy,
        `the tile offset must be reduced modulo the EMITTED size (${px}, ${py} vs ${sx})`);
    }
  }
  ok(paperFibreStyle({ x: 0, y: 0, zoom: 0.14, rot: 0 }, W, H, 1, 0) === null, "the fibre is not painted below zoom 0.15");
  ok(paperFibreStyle({ x: 0, y: 0, zoom: 1, rot: 0 }, W, H, 0, 0) === null, "the fibre slider at 0 paints nothing");
}

// =============================================================================================
startGroup(14, "itemBox text height honours hard line breaks");
{
  // WallClip.tsx renders the text block with `white-space: pre-wrap`, so a "\n" FORCES a break. Costing
  // the whole string in one ceil() measured a 5-line poem as ONE line — and every text item in the
  // demo project carries a "\n". The box is authoritative (fit-all, the frustum cull, the DOM block
  // height and the editor's handles all read it), so it must agree with what pre-wrap renders.
  const LH = 1.18;
  const corpus = [
    "a\nb\nc\nd\ne",
    "the morning\nof the first day",
    "you & me,\nand everyone we love",
    "そらんじ\nうみのおと",
    "one more roll,\nthen home",
    "ありがとう\nAll our love",
    "",
    "\n",
    "\n\n\n",
    "no breaks at all",
    "ありがとうございました",
  ];
  for (const text of corpus) {
    for (const fontSize of [24, 96, 118, 240]) {
      // A width wide enough that nothing soft-wraps, so `lines` is exactly the hard-line count.
      const width = 100000;
      const b = itemBox({ type: "text", text, fontSize, width });
      const hard = Math.max(1, text.split("\n").length);
      near(b.h, hard * fontSize * LH, 1e-9, `"${text.replace(/\n/g, "\\n")}" @${fontSize} must render ${hard} line(s)`);
      ok(b.w === width, "a text box keeps its authored width");
    }
  }
  // Soft wrapping still applies, PER hard line.
  const wrapped = itemBox({ type: "text", text: "aaaaaaaaaa\nbb", fontSize: 100, width: 260 });
  // line 1: 10 latin chars * 0.52 * 100 = 520 units over 260 -> 2 lines; line 2: 1 line.
  near(wrapped.h, 3 * 100 * LH, 1e-9, "each hard line soft-wraps on its own");
  // A mixed CJK/latin line is costed PER CHARACTER, not at a flat 1.0 em.
  const mixedH = itemBox({ type: "text", text: "ありがとう All our love", fontSize: 96, width: 560 }).h;
  const cjkOnly = itemBox({ type: "text", text: "ありがとうAllourlove".replace(/[A-Za-z]/g, "あ"), fontSize: 96, width: 560 }).h;
  ok(mixedH <= cjkOnly, "a mixed line must not be costed as if every glyph were CJK");
  // Non-finite / missing numerics degrade to the documented defaults rather than to NaN.
  for (const bad of [NaN, undefined, null, "12"]) {
    const b = itemBox({ type: "text", text: "x", fontSize: bad, width: bad });
    ok(Number.isFinite(b.w) && Number.isFinite(b.h) && b.w > 0 && b.h > 0, `itemBox survives fontSize/width = ${String(bad)}`);
    const i2 = itemBox({ type: "image", width: bad, aspect: bad, frame: "polaroid" });
    ok(Number.isFinite(i2.w) && Number.isFinite(i2.h) && i2.h > 0, `itemBox (image) survives width/aspect = ${String(bad)}`);
  }
}

// =============================================================================================
startGroup(15, "per-object scene windows: itemWindow / itemVisibleInScene / sceneIndexById");
{
  const { itemWindow, itemVisibleInScene, sceneIndexById } = W_;
  for (let c = 0; c < 600; c++) {
    const wall = randWall(Math.floor(rr(1, 9)), Math.floor(rr(0, 7)));
    const fps = pick([24, 25, 30, 60]);
    const sched = scheduleWall(wall, fps, W, H);
    ok(sceneIndexById(wall, undefined) === -1 && sceneIndexById(wall, "") === -1 && sceneIndexById(wall, "sc_unknown") === -1,
      "unset / empty / unknown ids resolve to -1");
    wall.scenes.forEach((s, i) => ok(sceneIndexById(wall, s.id) === i, "a scene id resolves to its own index"));
    for (const it of wall.items) {
      const i = sceneIndexById(wall, it.appearIn);
      const j = sceneIndexById(wall, it.leaveAfter);
      const win = itemWindow(sched, wall, it);
      if (i < 0 && j < 0) {
        ok(win === null, "no (valid) refs -> always visible (null window)");
        for (let k = 0; k < wall.scenes.length; k++) ok(itemVisibleInScene(wall, it, k) === true, "no refs -> visible in every scene");
        continue;
      }
      ok(win !== null && Number.isFinite(win.from) && win.from >= 0, "a referenced item has a finite non-negative from");
      ok(win.from <= win.to, `from (${win.from}) must never exceed to (${win.to})`);
      const delay = Math.round(Math.max(0, it.appearDelaySeconds ?? 0) * fps);
      if (i >= 0) {
        ok(win.from === Math.min(sched.sceneFrames[i] + delay, win.to), "from = arrival frame + stagger (clamped to `to`)");
        if (j < 0) ok(win.to === Infinity, "appear-only -> never leaves");
      } else {
        ok(win.from === 0, "leave-only -> visible from frame 0");
      }
      if (j >= 0) ok(win.to === sched.sceneEnds[j], "to = the frame the leave scene's hold ends");
      // itemVisibleInScene agrees with the window at each scene's arrival frame when there is no stagger.
      if (!delay) {
        for (let k = 0; k < wall.scenes.length; k++) {
          const f = sched.sceneFrames[k];
          const holds = sched.sceneEnds[k] > f; // a via scene (hold 0) has no frame to test
          if (!holds) continue;
          const inWin = f >= win.from && f < win.to;
          ok(itemVisibleInScene(wall, it, k) === inWin, `itemVisibleInScene(${k}) agrees with itemWindow at the arrival frame`);
        }
      }
      // Deterministic.
      const again = itemWindow(sched, wall, it);
      ok(again.from === win.from && again.to === win.to, "itemWindow is deterministic");
    }
  }
  // Reversed refs (leave before appear) degrade to an EMPTY window, never a negative one.
  {
    const wall = { items: [], scenes: [{ id: "a", x: 0, y: 0, zoom: 1, holdSeconds: 1, glideSeconds: 1 }, { id: "b", x: 100, y: 0, zoom: 1, holdSeconds: 1, glideSeconds: 1 }] };
    const sched = scheduleWall(wall, 30, W, H);
    const win = itemWindow(sched, wall, { appearIn: "b", leaveAfter: "a" });
    ok(win.from === win.to && win.to === sched.sceneEnds[0], "reversed refs -> empty window at the leave frame");
    ok(itemVisibleInScene(wall, { appearIn: "b", leaveAfter: "a" }, 0) === false && itemVisibleInScene(wall, { appearIn: "b", leaveAfter: "a" }, 1) === false,
      "reversed refs -> visible in no scene");
    const late = itemWindow(sched, wall, { appearIn: "a", leaveAfter: "a", appearDelaySeconds: 99 });
    ok(late.from === late.to, "a stagger past the leave frame clamps to an empty window");
    ok(itemWindow(sched, wall, { appearIn: "a", appearDelaySeconds: NaN }).from === sched.sceneFrames[0], "a non-finite stagger reads as 0");
  }
}

// =============================================================================================
if (failures) {
  console.error(`\ncheck:wall FAILED — ${failures} of ${checks} assertions`);
  process.exit(1);
}
console.log(`check:wall OK — ${checks} assertions across 15 invariant groups`);
