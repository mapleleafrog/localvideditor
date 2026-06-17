import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { renderApiPlugin } from "./render-plugin";

const here = dirname(fileURLToPath(import.meta.url));

// The editor app lives in editor/ but serves the PROJECT's public/ folder so
// Remotion's staticFile() resolves clips/sprites/media in the live <Player>.
// React/Remotion are deduped so the Player shares one React instance.
export default defineConfig({
  root: here,
  publicDir: resolve(here, "../public"),
  plugins: [react(), renderApiPlugin()],
  resolve: {
    dedupe: ["react", "react-dom", "remotion", "@remotion/player"],
  },
  server: {
    port: 5173,
    open: true,
    // Allow importing the project's src/ (Timeline + effect registry) and projects/.
    fs: { allow: [resolve(here, "..")] },
  },
});
