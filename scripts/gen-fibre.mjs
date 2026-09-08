// One-shot generator for `PAPER_FIBRE_URI` in src/timeline/wall-paper.ts.
//
// Produces a SEAMLESS ANISOTROPIC value-noise 128x128 8-bit greyscale PNG, stretched ~20:1
// horizontally: paper fibre is DIRECTIONAL and STATIC, film grain is isotropic and jitters, and
// conflating the two is the difference between "paper" and "video noise". (The wall's film grain
// is a separate lens layer — getMotion("grainLoop") — outside the camera.)
//
// It is a committed raster data-URI rather than an SVG feTurbulence for three load-bearing reasons:
//   1. Chrome rasterises an SVG background at its USED size. `background-size` changes on every
//      frame that `zoom` changes, so an SVG tile would be re-rasterised every frame of every glide.
//   2. A file loaded via staticFile() in a CSS background-image is NOT delayRender-gated (unlike
//      <Img>), so the first frames of a render could paint without it.
//   3. Being local to wall-paper.ts (never exported from portable.ts), public/portal/
//      effects.bundle.js cannot go stale — `npm run check:portal` is untouched.
//
// NOT wired into any npm script. Run it by hand and paste the printed data-URI into wall-paper.ts:
//     node scripts/gen-fibre.mjs
//
// Parameters (also recorded in the wall-paper.ts comment):
//   size 128 | octaves (fx,fy) = (1,20) (2,40) (4,64), amplitudes 0.5 0.3 0.2
//   value noise on a PERIODIC lattice (seamless by construction), smoothstep interpolation
//   deterministic hash (no Math.random), quantised to 16 levels, mapped to grey 255*(1 - 0.35*n)
import { deflateSync } from "node:zlib";

const SIZE = 128;
const OCTAVES = [
  { fx: 1, fy: 20, a: 0.5 },
  { fx: 2, fy: 40, a: 0.3 },
  { fx: 4, fy: 64, a: 0.2 },
];
const DEPTH = 0.35; // darkest fibre = 65% grey; multiply blend at ~8.5% opacity on top of that
const LEVELS = 16; // quantise so deflate has something to chew on (banding invisible at that alpha)

// Deterministic lattice hash in [0,1) — same family as effects/helpers.ts#seededRandom.
const hash = (ix, iy, o) => {
  const x = Math.sin(ix * 127.1 + iy * 311.7 + o * 74.7) * 43758.5453;
  return x - Math.floor(x);
};
const fade = (t) => t * t * (3 - 2 * t);

// Periodic value noise: lattice indices wrap modulo the octave's own frequency, so the tile is
// seamless in BOTH axes by construction (no mirroring, no blending seam).
const valueNoise = (u, v, fx, fy, o) => {
  const gx = u * fx;
  const gy = v * fy;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const tx = fade(gx - x0);
  const ty = fade(gy - y0);
  const wrap = (i, n) => ((i % n) + n) % n;
  const a = hash(wrap(x0, fx), wrap(y0, fy), o);
  const b = hash(wrap(x0 + 1, fx), wrap(y0, fy), o);
  const c = hash(wrap(x0, fx), wrap(y0 + 1, fy), o);
  const d = hash(wrap(x0 + 1, fx), wrap(y0 + 1, fy), o);
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
};

// --- pixels ----------------------------------------------------------------------------------
const amp = OCTAVES.reduce((s, o) => s + o.a, 0);
const raw = new Float64Array(SIZE * SIZE);
let lo = Infinity;
let hi = -Infinity;
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let n = 0;
    OCTAVES.forEach((o, i) => {
      n += o.a * valueNoise(x / SIZE, y / SIZE, o.fx, o.fy, i + 1);
    });
    n /= amp;
    raw[y * SIZE + x] = n;
    if (n < lo) lo = n;
    if (n > hi) hi = n;
  }
}

// PNG scanlines: filter byte 0 (None) + one byte per pixel (8-bit greyscale).
const rowBytes = SIZE + 1;
const pixels = Buffer.alloc(rowBytes * SIZE);
for (let y = 0; y < SIZE; y++) {
  pixels[y * rowBytes] = 0;
  for (let x = 0; x < SIZE; x++) {
    const n = (raw[y * SIZE + x] - lo) / (hi - lo || 1);
    const q = Math.round(n * (LEVELS - 1)) / (LEVELS - 1);
    pixels[y * rowBytes + 1 + x] = Math.max(0, Math.min(255, Math.round(255 * (1 - DEPTH * q))));
  }
}

// --- PNG container ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 0; // colour type 0 = greyscale
ihdr[10] = 0; // deflate
ihdr[11] = 0; // adaptive filtering
ihdr[12] = 0; // no interlace

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(pixels, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const uri = `data:image/png;base64,${png.toString("base64")}`;
console.error(`png ${png.length} B -> data-URI ${uri.length} chars (${SIZE}x${SIZE}, ${LEVELS} levels)`);
process.stdout.write(uri + "\n");
