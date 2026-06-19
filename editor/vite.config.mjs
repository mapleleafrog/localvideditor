import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..");
const publicDir = path.join(projectRoot, "public");
const mediaDir = path.join(publicDir, "media");
const projectsDir = path.join(projectRoot, "projects");

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
  },
});

export default defineConfig({
  root: here,
  publicDir,
  plugins: [react(), editorApi()],
  server: { fs: { allow: [projectRoot] } },
  build: { outDir: path.join(here, "dist"), emptyOutDir: true },
});
