// Editor-only image PROXIES.
//
// The browser keeps every image it shows as a decoded bitmap (width × height × 4 bytes, whatever
// the JPEG weighed), so a wall of 12–48 MP phone photos plus an Assets grid of unused imports adds
// up to gigabytes. A proxy is a ≤ PROXY_MAX_EDGE-px copy of a raster still, made in the browser at
// import (or by "Generate proxies") and stored next to the original under `_proxy/`. The editor's
// Players and thumbnails read the proxy; SAVE, EXPORT and RENDER always read the original — the
// swap happens at the <Player inputProps> boundary (`withProxies`) and never touches the store.
// The look is identical apart from resolution: same layout, same camera, same filters.
import { useSyncExternalStore } from "react";
import type { Project } from "../../../src/timeline/schema";

export const PROXY_DIR = "_proxy";
export const PROXY_MAX_EDGE = 2048;

const map = new Map<string, string>();
let version = 0;
const subs = new Set<() => void>();
const bump = () => {
  version++;
  subs.forEach((f) => f());
};

/** Replace the whole ref → proxy-ref map (from /api/media). */
export const setProxies = (entries: Record<string, string>) => {
  map.clear();
  for (const [k, v] of Object.entries(entries)) map.set(k, v);
  bump();
};
export const addProxy = (ref: string, proxy: string) => {
  map.set(ref, proxy);
  bump();
};
export const removeProxy = (ref: string) => {
  if (map.delete(ref)) bump();
};
export const proxyFor = (ref: string | undefined): string | undefined => (ref ? map.get(ref) : undefined);
/** The proxy when one exists, else the ref itself — for thumbnails. */
export const proxyOr = (ref: string): string => map.get(ref) ?? ref;
export const proxyCount = () => map.size;

/** Re-render when the proxy map changes (returns a version counter to put in memo deps). */
export const useProxiesVersion = () =>
  useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => version,
    () => version,
  );

/** Raster stills get a proxy. GIFs (animated), SVGs (vector, tiny) and video never do. */
export const proxyEligible = (name: string) => /\.(jpe?g|png|webp)$/i.test(name);

/** Proxy file name = the ORIGINAL file name plus one more extension (photo.jpeg → photo.jpeg.jpg),
 *  so the original is recoverable by stripping the last extension and two originals can never
 *  collide on one proxy. PNG keeps PNG (alpha props); everything else becomes JPEG. */
export const proxyName = (storedName: string) => `${storedName}.${/\.png$/i.test(storedName) ? "png" : "jpg"}`;

/** Downscale a still to PROXY_MAX_EDGE on its long side, in the browser. Returns null when no
 *  proxy is needed (already that small) or the file is not a decodable raster. */
export async function makeProxy(blob: Blob, name: string): Promise<Blob | null> {
  if (!proxyEligible(name)) return null;
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(blob);
  } catch {
    return null;
  }
  try {
    const long = Math.max(bmp.width, bmp.height);
    if (long <= PROXY_MAX_EDGE) return null;
    const k = PROXY_MAX_EDGE / long;
    const w = Math.max(1, Math.round(bmp.width * k));
    const h = Math.max(1, Math.round(bmp.height * k));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, w, h);
    const png = /\.png$/i.test(name);
    return await canvas.convertToBlob(png ? { type: "image/png" } : { type: "image/jpeg", quality: 0.86 });
  } finally {
    bmp.close();
  }
}

/** The project with every proxied still swapped in — for the editor's Players and thumbnails
 *  ONLY (never the store, the JSON or the render). Returns the SAME object when nothing changes,
 *  so memoised consumers are undisturbed. Video, GIF, SVG and audio refs are untouched. */
export function withProxies<T extends Project>(p: T): T {
  if (!map.size) return p;
  let changed = false;
  const swap = (src: string | undefined): string | undefined => {
    if (!src) return src;
    const px = map.get(src);
    if (px) changed = true;
    return px ?? src;
  };
  const clips = (p.clips ?? []).map((c) => {
    if (c.type === "wall" && c.wall?.items?.length) {
      let itemsChanged = false;
      const items = c.wall.items.map((it) => {
        if (it.type !== "image" || !it.src) return it;
        const px = map.get(it.src);
        if (!px) return it;
        itemsChanged = true;
        return { ...it, src: px };
      });
      if (!itemsChanged) return c;
      changed = true;
      return { ...c, wall: { ...c.wall, items } };
    }
    if (c.type === "image" && c.src && map.has(c.src)) return { ...c, src: swap(c.src)! };
    return c;
  });
  const overlays = (p.overlays ?? []).map((o) => (o.type === "image" && o.src && map.has(o.src) ? { ...o, src: swap(o.src)! } : o));
  if (!changed) return p;
  return { ...p, clips, overlays };
}
