import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { staticFile } from "remotion";
import { getAudioDurationInSeconds } from "@remotion/media-utils";
import { Timeline } from "../../../src/timeline/Timeline";
import type { AudioTrack, Overlay } from "../../../src/timeline/schema";
import { useEditor } from "../store";
import { audioEndFrames, computeDuration } from "../lib/timeline-utils";
import { uploadMedia } from "../lib/api";
import { ensureProjectName } from "../lib/names";
import { imageNaturalSize, videoNaturalSize, placeWidth } from "../lib/image";
import { CanvasOverlay } from "./CanvasOverlay";

const resolveSrc = (src: string) => (/^https?:\/\//.test(src) ? src : staticFile(src));
const isAudioFile = (n: string) => /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(n);
const isVideoFile = (n: string) => /\.(mp4|webm|mov)$/i.test(n);
const clampPct = (v: number) => Math.max(-20, Math.min(120, v));

const mediaOverlay = (src: string, width: number, x: number, y: number, type: "image" | "video"): Overlay => ({
  type, text: "", src, from: 0, durationInFrames: 60, x, y, scale: 1, rotation: 0,
  opacity: 1, motions: [], z: 0.4, windowInFrames: 30, enter: "none", exit: "none",
  enterDurationInFrames: 15, exitDurationInFrames: 15, fontSize: 80, color: "#ffffff", glow: "", width,
});
const audioTrack = (src: string): AudioTrack => ({ src, volume: 1, from: 0, trimBefore: 0, trimAfter: 0, loop: false });

/** Read each non-looping track's length (frames) in the browser so the Player is sized to the song. */
function useAudioEnd(audio: AudioTrack[], fps: number): number {
  const [frames, setFrames] = useState<Record<string, number>>({});
  useEffect(() => {
    let cancelled = false;
    const missing = (audio ?? []).filter((a) => !a.loop && frames[a.src] === undefined);
    if (!missing.length) return;
    Promise.all(
      missing.map(async (a) => {
        try {
          return [a.src, Math.round((await getAudioDurationInSeconds(resolveSrc(a.src))) * fps)] as const;
        } catch {
          return [a.src, 0] as const;
        }
      }),
    ).then((pairs) => {
      if (!cancelled) setFrames((prev) => ({ ...prev, ...Object.fromEntries(pairs) }));
    });
    return () => {
      cancelled = true;
    };
  }, [audio, fps, frames]);
  return audioEndFrames(audio ?? [], (src) => frames[src]);
}

/** contain-fit: largest aw:ah box that fits the container -> exact composition aspect (no letterbox). */
function useContainFit(ref: React.RefObject<HTMLDivElement | null>, aw: number, ah: number) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      if (!width || !height) return;
      const s = Math.min(width / aw, height / ah);
      setBox({ w: Math.floor(aw * s), h: Math.floor(ah * s) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, aw, ah]);
  return box;
}

/** Pixel-exact live preview: the SAME Timeline composition that renders to MP4, driven by the
 *  editor's project state. The Player fills an exact composition-aspect box so the on-canvas
 *  transform tools (CanvasOverlay) can map screen px <-> composition coordinates 1:1. */
export const Preview: React.FC<{ playerRef: React.RefObject<PlayerRef | null> }> = ({ playerRef }) => {
  const project = useEditor((s) => s.project);
  const addOverlay = useEditor((s) => s.addOverlay);
  const addAudio = useEditor((s) => s.addAudio);
  const audioEnd = useAudioEnd(project.audio ?? [], project.fps ?? 30);
  const duration = computeDuration(project, audioEnd);
  const compW = project.width ?? 1920;
  const compH = project.height ?? 1080;
  const wrapRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const fit = useContainFit(wrapRef, compW, compH);
  const [dropping, setDropping] = useState(false);

  // Drop media onto the canvas: image → image layer AT the drop point; video → clip; audio → track.
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDropping(false);
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;
    const proj = ensureProjectName();
    if (!proj) return;
    const rect = boxRef.current?.getBoundingClientRect();
    const x = rect ? clampPct(((e.clientX - rect.left) / rect.width) * 100) : 50;
    const y = rect ? clampPct(((e.clientY - rect.top) / rect.height) * 100) : 50;
    for (const f of files) {
      const r = await uploadMedia(f, proj);
      if (!r.ok || !r.ref) continue;
      if (isAudioFile(f.name)) {
        addAudio(audioTrack(r.ref));
      } else {
        // image/video → a layer at the drop point, placed at native size (scaled down to fit frame)
        const vid = isVideoFile(f.name);
        const url = URL.createObjectURL(f);
        const { w, h } = await (vid ? videoNaturalSize : imageNaturalSize)(url);
        URL.revokeObjectURL(url);
        addOverlay(
          mediaOverlay(r.ref, placeWidth(w, h, compW, compH, Math.round(compW * 0.5)), Math.round(x), Math.round(y), vid ? "video" : "image"),
        );
      }
    }
  };

  return (
    <div className="preview-fit" ref={wrapRef}>
      <div
        className={"comp-box" + (dropping ? " dropping" : "")}
        ref={boxRef}
        style={{ width: fit.w || undefined, height: fit.h || undefined }}
        onDragOver={(e) => { e.preventDefault(); if (!dropping) setDropping(true); }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setDropping(false); }}
        onDrop={onDrop}
      >
        <Player
          ref={playerRef}
          component={Timeline as React.ComponentType<Record<string, unknown>>}
          inputProps={project as unknown as Record<string, unknown>}
          durationInFrames={duration}
          fps={project.fps ?? 30}
          compositionWidth={compW}
          compositionHeight={compH}
          style={{ width: "100%", height: "100%" }}
          clickToPlay={false}
        />
        {fit.w > 0 && <CanvasOverlay boxRef={boxRef} playerRef={playerRef} />}
      </div>
    </div>
  );
};
