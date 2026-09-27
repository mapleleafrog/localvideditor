// A scene card's thumbnail: the scene's OWN recorded frame (not the whole-wall plan), drawn from
// the same camera maths the renderer uses — `itemScreenBox` at the scene's pose, so parallax,
// rotation and roll land where they do in the MP4. Items the scene hides (appear-in / leave-after)
// are left out, so the card shows what is actually on screen at that scene.
//
// Cheap on purpose (one per card, 20+ cards, re-rendered on every scene edit): no schedule, no
// frame loop — a plain SVG in screen space with only the items that intersect the frame. Photos
// draw from the 320 px THUMB tier (`thumbFor`); an item with no thumb yet (or a video / webm prop)
// is a tinted block, never the full-size original — 50 originals decoded into 20 cards would put
// the multi-GB image memory straight back.
import React, { memo } from "react";
import type { Wall, WallScene } from "../../../src/timeline/schema";
import { POLAROID, itemAspect, itemScreenBox, itemVisibleInScene, sceneCam, visibleAt } from "../../../src/timeline/wall";
import { paperPreset } from "../../../src/timeline/wall-paper";
import { thumbFor, useProxiesVersion } from "../lib/proxies";

const isRaster = (src: string) => /\.(jpe?g|png|webp|gif|svg)$/i.test(src);
const url = (ref: string) => (/^https?:\/\//.test(ref) ? ref : "/" + ref.replace(/^\/+/, ""));
/** gif / svg have no thumb tier (never proxied) and are small — draw them as-is. */
const thumbUrl = (src: string): string | null => {
  if (!src || !isRaster(src)) return null;
  const t = thumbFor(src);
  if (t) return url(t);
  return /\.(gif|svg)$/i.test(src) ? url(src) : null;
};

interface Props {
  wall: Wall;
  scene: WallScene;
  index: number;
  W: number;
  H: number;
  width: number;
  height: number;
}

const Thumb: React.FC<Props> = ({ wall, scene, index, W, H, width, height }) => {
  useProxiesVersion(); // re-draw when ⚡ Generate editor copies adds a thumb
  const cam = sceneCam(scene);
  const paper = paperPreset(wall.paper);
  const items = (wall.items ?? []).filter((it) => itemVisibleInScene(wall, it, index) && visibleAt(it, cam, W, H, 0.02));
  return (
    <svg className="wsc-thumb" width={width} height={height} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect x={0} y={0} width={W} height={H} fill={paper.base} />
      {items.map((it, k) => {
        const b = itemScreenBox(it, cam, W, H);
        const g = `translate(${b.cx} ${b.cy}) rotate(${b.angle})${it.flipX ? " scale(-1 1)" : ""}${it.flipY ? " scale(1 -1)" : ""}`;
        const op = it.opacity ?? 1;
        if ((it.type ?? "image") === "text") {
          const fs = (it.fontSize ?? 96) * cam.zoom;
          const lines = (it.text ?? "").split("\n");
          // Hard lines only (no re-wrap), centred on the box like the renderer's flex block.
          const y0 = (-(lines.length - 1) / 2) * 1.18 * fs;
          return (
            <g key={k} transform={g} opacity={op}>
              <text textAnchor="middle" dominantBaseline="middle" fontSize={fs} fill={it.color || paper.ink} fontFamily="Caveat, cursive">
                {lines.map((ln, j) => (
                  <tspan key={j} x={0} y={y0 + j * 1.18 * fs}>
                    {ln}
                  </tspan>
                ))}
              </text>
            </g>
          );
        }
        // Media window inside the card (the same margins itemBox uses).
        const frame = it.frame ?? "none";
        const w = b.w;
        const inner = w / itemAspect(it);
        let win = { x: -w / 2, y: -b.h / 2, w, h: b.h };
        if (frame === "polaroid") win = { x: -w / 2 + POLAROID.side * w, y: -b.h / 2 + POLAROID.side * w, w: (1 - 2 * POLAROID.side) * w, h: (1 - 2 * POLAROID.side) * inner };
        else if (frame === "matte") win = { x: -w / 2 + 0.09 * w, y: -b.h / 2 + 0.09 * w, w: 0.82 * w, h: 0.82 * inner };
        const href = thumbUrl(it.src ?? "");
        return (
          <g key={k} transform={g} opacity={op}>
            {frame === "polaroid" || frame === "matte" ? (
              <rect x={-w / 2} y={-b.h / 2} width={w} height={b.h} fill={frame === "polaroid" ? "#f4f1ea" : paper.matte} />
            ) : null}
            {href ? (
              <image href={href} x={win.x} y={win.y} width={win.w} height={win.h} preserveAspectRatio="xMidYMid slice" />
            ) : (
              <rect x={win.x} y={win.y} width={win.w} height={win.h} fill="rgba(90,80,70,.45)" />
            )}
          </g>
        );
      })}
    </svg>
  );
};

/** Memoised on its inputs: `wall` is referentially stable between edits, so scrolling the strip,
 *  moving the camera or playing Live never re-draws a card. */
export const WallSceneThumb = memo(Thumb);
