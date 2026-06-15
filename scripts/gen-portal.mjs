// Bundles src/effects/portable.ts -> public/portal/effects.bundle.js as a browser
// IIFE (window.SoranjiEffects): the single-source motion formulas, composeStyles,
// depth math, MOTION_META, and helpers that the no-npm portal (index.html) consumes.
// Modeled on scripts/gen-credits.mjs. Run: `npm run gen:portal`.
//
// `--check` rebuilds in memory and compares to the committed bundle; exits 1 if
// stale. The compare normalizes line endings so a Windows CRLF checkout of the
// committed bundle does not false-positive against esbuild's LF output.
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const entry = join(root, "src/effects/portable.ts");
const outFile = join(root, "public/portal/effects.bundle.js");
const check = process.argv.includes("--check");

const result = await build({
  entryPoints: [entry],
  bundle: true,
  format: "iife",
  globalName: "SoranjiEffects",
  platform: "browser",
  target: "es2020",
  minify: false,
  legalComments: "none",
  write: false,
});
const code = result.outputFiles[0].text;

const normalize = (s) => s.replace(/\r\n/g, "\n");

if (check) {
  const existing = existsSync(outFile) ? readFileSync(outFile, "utf8") : "";
  if (normalize(existing) !== normalize(code)) {
    console.error("portal bundle stale - run npm run gen:portal");
    process.exit(1);
  }
  console.log("portal bundle up to date");
} else {
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, code);
  console.log(`Wrote ${outFile} (${code.length} bytes)`);
}
