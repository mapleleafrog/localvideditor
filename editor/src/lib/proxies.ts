// Editor-only image PROXIES, in two tiers.
//
// The browser keeps every image it shows as a decoded bitmap (width × height × 4 bytes, whatever the
// JPEG weighed) and that memory is NOT in the JS heap — measured: with the heap, DOM node count and
// listener count all perfectly flat, the renderer's RSS still ratchets up and never comes back down.
// So the fix is not "find the leak", it is "decode fewer and smaller pixels, and let Chrome reclaim".
//
// Two tiers, because one size cannot serve both consumers:
//   PROXY (2048 px) — what the <Player> shows. A wall item fills a real part of the frame.
//   THUMB (320 px)  — what the Assets grid, timeline tips and Storyboard cards show. Those draw into
//                     a ~64-96 px cell, so serving them 2048 px decoded ~41× more pixels than the
//                     screen could ever use (2048·1365·4 = 11.2 MB vs 320·213·4 = 0.27 MB each).
// Both are made in the browser at import (or by "Generate proxies") and stored beside the original
// under `_proxy/`. SAVE, EXPORT and RENDER always read the ORIGINAL — the swap happens only at the
// <Player inputProps> boundary (`withProxies`) and in thumbnail `src`s, never in the store or JSON.
// The look is identical apart from resolution: same layout, same camera, same filters.
import { useSyncExternalStore } from "react";
import type { Project } from "../../../src/timeline/schema";

export const PROXY_DIR = "_proxy";
export const PROXY_MAX_EDGE = 2048;
export const THUMB_MAX_EDGE = 320;

export type Tier = "proxy" | "thumb";
export const TIER_EDGE: Record<Tier, number> = { proxy: PROXY_MAX_EDGE, thumb: THUMB_MAX_EDGE };
export const TIER_QUALITY: Record<Tier, number> = { proxy: 86, thumb: 80 };

const maps: Record<Tier, Map<string, string>> = { proxy: new Map(), thumb: new Map() };
let version = 0;
const subs = new Set<() => void>();
const bump = () => {
  version++;
  subs.forEach((f) => f());
};

/** Replace both ref → derived-ref maps (from /api/media). */
export const setProxies = (proxies: Record<string, string>, thumbs: Record<string, string> = {}) => {
  maps.proxy.clear();
  maps.thumb.clear();
  for (const [k, v] of Object.entries(proxies)) maps.proxy.set(k, v);
  for (const [k, v] of Object.entries(thumbs)) maps.thumb.set(k, v);
  bump();
};
export const addProxy = (ref: string, derived: string, tier: Tier = "proxy") => {
  maps[tier].set(ref, derived);
  bump();
};
export const removeProxy = (ref: string) => {
  const hit = maps.proxy.delete(ref);
  const hit2 = maps.thumb.delete(ref);
  if (hit || hit2) bump();
};
export const proxyFor = (ref: string | undefined): string | undefined => (ref ? maps.proxy.get(ref) : undefined);
export const thumbFor = (ref: string | undefined): string | undefined => (ref ? maps.thumb.get(ref) : undefined);
/** The 2048 px proxy when one exists, else the ref itself — for the <Player>. */
export const proxyOr = (ref: string): string => maps.proxy.get(ref) ?? ref;
/** The 320 px thumb, falling back to the proxy, then the original — for editor chrome. */
export const thumbOr = (ref: string): string => maps.thumb.get(ref) ?? maps.proxy.get(ref) ?? ref;
export const proxyCount = () => maps.proxy.size;
export const thumbCount = () => maps.thumb.size;

/** Re-render when either map changes (returns a version counter to put in memo deps). */
export const useProxiesVersion = () =>
  useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => version,
    () => version,
  );

/** Raster stills get proxies. GIFs (animated), SVGs (vector, tiny) and video never do. */
export const proxyEligible = (name: string) => /\.(jpe?g|png|webp)$/i.test(name);

/** Derived-file name = the ORIGINAL name + a TIER STAMP + an extension:
 *    photo.jpeg → photo.jpeg.e2048q86.jpg / photo.jpeg.e320q80.jpg
 *  The stamp carries every parameter that changes the pixels, so bumping an edge or a quality
 *  constant makes the old files miss instead of silently serving the wrong size, and the original
 *  is still recoverable by stripping the stamp. PNG stays PNG (alpha props); everything else JPEG. */
export const proxyName = (storedName: string, tier: Tier = "proxy") =>
  `${storedName}.e${TIER_EDGE[tier]}q${TIER_QUALITY[tier]}.${/\.png$/i.test(storedName) ? "png" : "jpg"}`;

/** Both downscaled tiers from ONE decode of the source — a 48 MP photo is decoded once, not twice.
 *  Returns only the tiers that are actually smaller than the original (a 900 px photo needs no
 *  2048 tier but still wants a 320 one). Null entries mean "serve the bigger tier instead". */
export async function makeTiers(blob: Blob, name: string): Promise<Partial<Record<Tier, Blob>>> {
  if (!proxyEligible(name)) return {};
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(blob);
  } catch {
    return {};
  }
  try {
    const png = /\.png$/i.test(name);
    const long = Math.max(bmp.width, bmp.height);
    const out: Partial<Record<Tier, Blob>> = {};
    for (const tier of ["proxy", "thumb"] as Tier[]) {
      const edge = TIER_EDGE[tier];
      if (long <= edge) continue;
      const k = edge / long;
      const w = Math.max(1, Math.round(bmp.width * k));
      const h = Math.max(1, Math.round(bmp.height * k));
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bmp, 0, 0, w, h);
      out[tier] = await canvas.convertToBlob(
        png ? { type: "image/png" } : { type: "image/jpeg", quality: TIER_QUALITY[tier] / 100 },
      );
    }
    return out;
  } finally {
    bmp.close();
  }
}

/** Back-compat shim: the 2048 tier alone. */
export async function makeProxy(blob: Blob, name: string): Promise<Blob | null> {
  return (await makeTiers(blob, name)).proxy ?? null;
}

/** The project with every proxied still swapped in — for the editor's Players ONLY (never the store,
 *  the JSON or the render). Returns the SAME object when nothing changes, so memoised consumers are
 *  undisturbed. Video, GIF, SVG and audio refs are untouched. */
export function withProxies<T extends Project>(p: T): T {
  const map = maps.proxy;
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
