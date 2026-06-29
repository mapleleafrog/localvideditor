import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promises as fs } from "node:fs";
import { cpus } from "node:os";
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

/** Collect a request body as raw bytes (for binary uploads). Capped to avoid runaway memory. */
function readRawBody(req: IncomingMessage, maxBytes = 2 * 1024 * 1024 * 1024): Promise<Buffer> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > maxBytes) {
        reject(new Error("Upload too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolveBody(Buffer.concat(chunks)));
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

/** Filesystem-safe single path segment (project name / filename). No separators, no traversal. */
const safeSeg = (s: string) => (s || "").split(/[\\/]/).pop()!.replace(/[^a-z0-9._-]/gi, "_").replace(/^\.+/, "");
const qparam = (req: IncomingMessage, key: string) =>
  new URL(req.url || "", "http://localhost").searchParams.get(key) || "";

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
    // Use the whole machine: one render tab per core, GPU-accelerated browser rendering.
    const concurrency = Math.max(1, options.concurrency ?? cpus().length);
    send({
      type: "status",
      message: `Rendering ${composition.durationInFrames} frames (${kind}) · ${concurrency} cores · GPU…`,
      durationInFrames: composition.durationInFrames,
    });
    await renderMedia({
      composition,
      serveUrl,
      outputLocation,
      inputProps,
      concurrency,
      // GPU-accelerated rendering (ANGLE) — big win for filter-heavy comps (drop-shadow/blur/glow).
      chromiumOptions: { gl: "angle" },
      onProgress: ({ progress }) => send({ type: "progress", progress }),
      ...(transparent
        ? { codec: "prores" as const, proResProfile: "4444" as const, pixelFormat: "yuva444p10le" as const, imageFormat: "png" as const }
        : // H.264 with max-quality frame capture (jpegQuality 100) + high-quality encode (low CRF), software x264.
          { codec: "h264" as const, jpegQuality: 100, crf: 16 }),
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

/** Import a dropped/picked file so the editor can use it via staticFile(). Raw bytes in the body,
 *  filename in ?name=, optional ?project= → public/media/<project>/ (else flat public/media/).
 *  Sanitizes the name and avoids clobbering by suffixing photo.jpg → photo-1.jpg. */
async function handleUpload(req: IncomingMessage, res: ServerResponse) {
  try {
    const safe = safeSeg(qparam(req, "name")) || "upload.bin";
    const project = safeSeg(qparam(req, "project"));
    const dir = project ? join(MEDIA_DIR, project) : MEDIA_DIR;
    const prefix = project ? `media/${project}` : "media";
    const buf = await readRawBody(req);
    await fs.mkdir(dir, { recursive: true });

    const dot = safe.lastIndexOf(".");
    const stem = dot > 0 ? safe.slice(0, dot) : safe;
    const ext = dot > 0 ? safe.slice(dot) : "";
    let finalName = safe;
    for (let i = 1; ; i++) {
      try {
        await fs.access(join(dir, finalName));
        finalName = `${stem}-${i}${ext}`;
      } catch {
        break; // free name
      }
    }
    await fs.writeFile(join(dir, finalName), buf);
    sendJson(res, 200, { ok: true, ref: `${prefix}/${finalName}` });
  } catch (err) {
    sendJson(res, 500, { ok: false, message: err instanceof Error ? err.message : String(err) });
  }
}

/** List media for the asset/audio pickers, split into visual assets + audio tracks.
 *  Includes root public/ (shared), flat public/media/ (legacy/shared), and — if ?project= is given —
 *  that project's public/media/<project>/ folder. */
async function handleMedia(req: IncomingMessage, res: ServerResponse) {
  const project = safeSeg(qparam(req, "project"));
  const isVisual = (f: string) => /\.(png|jpe?g|gif|webp|svg|mp4|webm|mov)$/i.test(f);
  const isAudio = (f: string) => /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(f);
  const assets: string[] = [];
  const audio: string[] = [];
  const sort = (name: string, ref: string) => {
    if (isVisual(name)) assets.push(ref);
    else if (isAudio(name)) audio.push(ref);
  };
  try {
    const root = await fs.readdir(PUBLIC_DIR, { withFileTypes: true });
    root.filter((d) => d.isFile()).forEach((d) => sort(d.name, d.name));
  } catch {
    /* ignore */
  }
  try {
    const media = await fs.readdir(MEDIA_DIR, { withFileTypes: true });
    media.filter((d) => d.isFile()).forEach((d) => sort(d.name, `media/${d.name}`));
  } catch {
    /* no media dir yet */
  }
  if (project) {
    try {
      const files = await fs.readdir(join(MEDIA_DIR, project));
      files.forEach((f) => sort(f, `media/${project}/${f}`));
    } catch {
      /* no folder for this project yet */
    }
  }
  sendJson(res, 200, { assets, audio });
}

/** Delete a project: removes projects/<name>.json and its public/media/<name>/ folder. */
async function handleDeleteProject(req: IncomingMessage, res: ServerResponse) {
  try {
    const { name } = await readJsonBody(req);
    const safe = safeSeg(String(name || ""));
    if (!safe) return sendJson(res, 400, { ok: false, message: "missing project name" });
    await fs.rm(join(PROJECTS_DIR, `${safe}.json`), { force: true });
    await fs.rm(join(MEDIA_DIR, safe), { recursive: true, force: true });
    sendJson(res, 200, { ok: true });
  } catch (err) {
    sendJson(res, 500, { ok: false, message: err instanceof Error ? err.message : String(err) });
  }
}

export function renderApiPlugin(): Plugin {
  return {
    name: "soranji-render-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || "").split("?")[0];
        if (req.method === "POST" && url === "/api/render") return void handleRender(req, res);
        if (req.method === "POST" && url === "/api/save-project") return void handleSaveProject(req, res);
        if (req.method === "POST" && url === "/api/upload") return void handleUpload(req, res);
        if (req.method === "POST" && url === "/api/delete-project") return void handleDeleteProject(req, res);
        if (req.method === "GET" && url === "/api/media") return void handleMedia(req, res);
        next();
      });
    },
  };
}
