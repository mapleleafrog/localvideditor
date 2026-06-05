// Minimal static file server for previewing index.html (verification only).
import http from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";

const root = process.cwd();
const PORT = 4173;
const TYPES = {
  ".html": "text/html",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".css": "text/css",
  ".js": "text/javascript",
  ".mp4": "video/mp4",
  ".json": "application/json",
};

http
  .createServer(async (req, res) => {
    try {
      let url = decodeURIComponent(req.url.split("?")[0]);
      if (url === "/") url = "/index.html";
      const file = join(root, url);
      const data = await readFile(file);
      res.setHeader("content-type", TYPES[extname(file)] || "application/octet-stream");
      res.end(data);
    } catch {
      res.statusCode = 404;
      res.end("not found");
    }
  })
  .listen(PORT, () => console.log(`static server on http://localhost:${PORT}`));
