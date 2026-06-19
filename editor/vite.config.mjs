import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..");
const publicDir = path.join(projectRoot, "public");
const mediaDir = path.join(publicDir, "media");
const projectsDir = path.join(projectRoot, "projects");
const outDir = path.join(projectRoot, "out");
const remotionBin = path.join(projectRoot, "node_modules", ".bin", "remotion");

const MEDIA_RE = /\.(mp4|webm|mov|m4v|gif|png|jpe?g|webp|svg|avif|mp3|wav|m4a|aac|ogg|flac)$/i;
const safeName = (name) => path.basename(String(name || "")).replace(/[^\w.\-]+/g, "_");

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });

const json = (res, code, obj) => {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
};

/** Tiny dev API so the browser editor can persist to disk: list/upload media + save projects. */
const editorApi = () => ({
  name: "editor-api",
  configureServer(server) {
    fs.mkdirSync(mediaDir, { recursive: true });
    fs.mkdirSync(projectsDir, { recursive: true });

    server.middlewares.use("/api/media", (req, res) => {
      const files = fs.existsSync(mediaDir) ? fs.readdirSync(mediaDir).filter((f) => MEDIA_RE.test(f)) : [];
      json(res, 200, { files });
    });

    server.middlewares.use("/api/upload", async (req, res) => {
      if (req.method !== "POST") return json(res, 405, { error: "POST only" });
      const url = new URL(req.url, "http://localhost");
      const name = safeName(url.searchParams.get("name"));
      if (!name) return json(res, 400, { error: "missing name" });
      try {
        fs.writeFileSync(path.join(mediaDir, name), await readBody(req));
        json(res, 200, { ok: true, src: `media/${name}` });
      } catch (e) {
        json(res, 500, { error: String(e?.message ?? e) });
      }
    });

    server.middlewares.use("/api/projects", (req, res) => {
      const files = fs.existsSync(projectsDir)
        ? fs.readdirSync(projectsDir).filter((f) => f.endsWith(".json"))
        : [];
      json(res, 200, { files });
    });

    server.middlewares.use("/api/save", async (req, res) => {
      if (req.method !== "POST") return json(res, 405, { error: "POST only" });
      const url = new URL(req.url, "http://localhost");
      const name = safeName(url.searchParams.get("name")) || "project.json";
      const file = name.endsWith(".json") ? name : `${name}.json`;
      try {
        const body = (await readBody(req)).toString("utf8");
        JSON.parse(body); // validate it's JSON before writing
        fs.writeFileSync(path.join(projectsDir, file), body);
        json(res, 200, { ok: true, path: `projects/${file}` });
      } catch (e) {
        json(res, 500, { error: String(e?.message ?? e) });
      }
    });

    server.middlewares.use("/api/load", (req, res) => {
      const url = new URL(req.url, "http://localhost");
      const name = safeName(url.searchParams.get("name"));
      const file = path.join(projectsDir, name);
      if (!name || !fs.existsSync(file)) return json(res, 404, { error: "not found" });
      json(res, 200, { contents: fs.readFileSync(file, "utf8") });
    });

    // Render the project to out/<name>.mp4, streaming the remotion CLI log back.
    server.middlewares.use("/api/render", async (req, res) => {
      if (req.method !== "POST") return json(res, 405, { error: "POST only" });
      const url = new URL(req.url, "http://localhost");
      const base = (safeName(url.searchParams.get("name")) || "video").replace(/\.(json|mp4)$/i, "");
      let body;
      try {
        body = (await readBody(req)).toString("utf8");
        JSON.parse(body);
      } catch (e) {
        return json(res, 400, { error: `bad project JSON: ${e?.message ?? e}` });
      }
      fs.mkdirSync(outDir, { recursive: true });
      const propsPath = path.join(outDir, `${base}.props.json`);
      const mp4Path = path.join(outDir, `${base}.mp4`);
      fs.writeFileSync(propsPath, body);

      res.statusCode = 200;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache");
      const write = (d) => {
        try {
          res.write(d);
        } catch {
          /* client gone */
        }
      };
      write(`Rendering Timeline → out/${base}.mp4 …\n`);
      const child = spawn(remotionBin, ["render", "Timeline", mp4Path, `--props=${propsPath}`], {
        cwd: projectRoot,
      });
      child.stdout.on("data", write);
      child.stderr.on("data", write);
      child.on("error", (e) => write(`\nERROR: ${e.message}\n`));
      child.on("close", (code) => {
        if (code === 0 && fs.existsSync(mp4Path)) write(`\n__DONE__ ${base}.mp4\n`);
        else write(`\n__FAILED__ exit ${code}\n`);
        res.end();
      });
      req.on("close", () => {
        try {
          child.kill();
        } catch {
          /* already gone */
        }
      });
    });

    // Stream a finished render for download.
    server.middlewares.use("/api/output", (req, res) => {
      const url = new URL(req.url, "http://localhost");
      const name = safeName(url.searchParams.get("name"));
      const file = path.join(outDir, name);
      if (!name || !fs.existsSync(file)) return json(res, 404, { error: "not found" });
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
      fs.createReadStream(file).pipe(res);
    });
  },
});

export default defineConfig({
  root: here,
  publicDir,
  plugins: [react(), editorApi()],
  server: { fs: { allow: [projectRoot] } },
  build: { outDir: path.join(here, "dist"), emptyOutDir: true },
});
