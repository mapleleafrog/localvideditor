import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promises as fs } from "node:fs";
import type { Plugin } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");
const ENTRY = resolve(projectRoot, "src/index.ts");
const OUT_DIR = resolve(projectRoot, "out");
const PROJECTS_DIR = resolve(projectRoot, "projects");
const MEDIA_DIR = resolve(projectRoot, "public/media");
const PUBLIC_DIR = resolve(projectRoot, "public");

/** Bundle once per dev session and reuse the serveUrl (the composition code rarely changes while editing). */
let bundlePromise: Promise<string> | null = null;
function getBundle() {
  if (!bundlePromise) {
    bundlePromise = (async () => {
      const { bundle } = await import("@remotion/bundler");
      return bundle({ entryPoint: ENTRY, publicDir: PUBLIC_DIR });
    })();
  }
  return bundlePromise;
}

function readJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolveBody, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolveBody(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

const sendJson = (res: ServerResponse, code: number, obj: unknown) => {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
};

const stamp = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

/** Render the current project with the SAME composition/renderer the CLI uses, streaming NDJSON
 *  progress. POST body = { project, options } (or a bare project for back-compat).
 *  options.transparent → ProRes 4444 .mov with an alpha channel (background forced to none) for
 *  compositing in DaVinci/Premiere. options.overlaysOnly → also drops clips, so you export just the
 *  animated overlays/VFX/titles as transparent elements. */
async function handleRender(req: IncomingMessage, res: ServerResponse) {
  res.writeHead(200, { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" });
  const send = (msg: unknown) => res.write(JSON.stringify(msg) + "\n");
  try {
    const body = await readJsonBody(req);
    const project = body?.project ?? body;
    const options = body?.options ?? {};
    const overlaysOnly = !!options.overlaysOnly;
    const transparent = !!options.transparent || overlaysOnly; // overlays-only is for compositing → alpha

    // Build the render-time inputProps (never persisted): transparent strips the background so the
    // root renders with alpha; overlaysOnly also empties the clip track.
    let inputProps = project;
    if (transparent) inputProps = { ...inputProps, background: { ...(project.background ?? {}), type: "none" } };
    if (overlaysOnly) inputProps = { ...inputProps, clips: [] };

    const { selectComposition, renderMedia, ensureBrowser } = await import("@remotion/renderer");
    send({ type: "status", message: "Preparing browser…" });
    await ensureBrowser();
    send({ type: "status", message: "Bundling composition…" });
    const serveUrl = await getBundle();
    send({ type: "status", message: "Resolving composition…" });
    const composition = await selectComposition({ serveUrl, id: "Timeline", inputProps });
    await fs.mkdir(OUT_DIR, { recursive: true });
    const ext = transparent ? "mov" : "mp4";
    const tag = overlaysOnly ? "overlays" : transparent ? "alpha" : "video";
    const fileName = `timeline-${tag}-${stamp()}.${ext}`;
    const outputLocation = join(OUT_DIR, fileName);
    const kind = transparent ? "transparent ProRes" : "H.264";
    send({
      type: "status",
      message: `Rendering ${composition.durationInFrames} frames (${kind})…`,
      durationInFrames: composition.durationInFrames,
    });
    await renderMedia({
      composition,
      serveUrl,
      outputLocation,
      inputProps,
      onProgress: ({ progress }) => send({ type: "progress", progress }),
      ...(transparent
        ? { codec: "prores" as const, proResProfile: "4444" as const, pixelFormat: "yuva444p10le" as const, imageFormat: "png" as const }
        : { codec: "h264" as const }),
    });
    send({ type: "done", file: outputLocation, fileName });
  } catch (err) {
    send({ type: "error", message: err instanceof Error ? err.message : String(err) });
  } finally {
    res.end();
  }
}

/** Persist a project config to projects/<name>.json (round-trips with Studio + the CLI). */
async function handleSaveProject(req: IncomingMessage, res: ServerResponse) {
  try {
    const { name, project } = await readJsonBody(req);
    const safe = String(name || "untitled").replace(/[^a-z0-9_-]/gi, "_");
    await fs.mkdir(PROJECTS_DIR, { recursive: true });
    const file = join(PROJECTS_DIR, `${safe}.json`);
    await fs.writeFile(file, JSON.stringify(project, null, 2) + "\n", "utf8");
    sendJson(res, 200, { ok: true, file: `projects/${safe}.json` });
  } catch (err) {
    sendJson(res, 500, { ok: false, message: err instanceof Error ? err.message : String(err) });
  }
}

/** List drop-in media (public/media/*) + the known root public assets for the Asset browser. */
async function handleMedia(_req: IncomingMessage, res: ServerResponse) {
  const isMedia = (f: string) => /\.(png|jpe?g|gif|webp|svg|mp4|webm|mov)$/i.test(f);
  const out: string[] = [];
  try {
    const media = await fs.readdir(MEDIA_DIR);
    media.filter(isMedia).forEach((f) => out.push(`media/${f}`));
  } catch {
    /* no media dir yet */
  }
  try {
    const root = await fs.readdir(PUBLIC_DIR, { withFileTypes: true });
    root.filter((d) => d.isFile() && isMedia(d.name)).forEach((d) => out.push(d.name));
  } catch {
    /* ignore */
  }
  sendJson(res, 200, { assets: out });
}

export function renderApiPlugin(): Plugin {
  return {
    name: "soranji-render-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || "").split("?")[0];
        if (req.method === "POST" && url === "/api/render") return void handleRender(req, res);
        if (req.method === "POST" && url === "/api/save-project") return void handleSaveProject(req, res);
        if (req.method === "GET" && url === "/api/media") return void handleMedia(req, res);
        next();
      });
    },
  };
}
