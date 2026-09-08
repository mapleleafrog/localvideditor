import React, { useEffect, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { Timeline } from "../../../src/timeline/Timeline";
import type { AudioTrack, Overlay } from "../../../src/timeline/schema";
import { useEditor } from "../store";
import { computeDuration } from "../lib/timeline-utils";
import { uploadMedia } from "../lib/api";
import { ensureProjectName } from "../lib/names";
import { imageNaturalSize, videoNaturalSize, placeWidth } from "../lib/image";
import { useContainFit } from "../lib/fit";
import { useAudioEnd } from "../lib/audio";
import { CanvasOverlay } from "./CanvasOverlay";

const isAudioFile = (n: string) => /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(n);
const isVideoFile = (n: string) => /\.(mp4|webm|mov)$/i.test(n);
const clampPct = (v: number) => Math.max(-20, Math.min(120, v));

const mediaOverlay = (src: string, width: number, x: number, y: number, type: "image" | "video"): Overlay => ({
  type, text: "", src, from: 0, durationInFrames: 60, x, y, scale: 1, rotation: 0,
  opacity: 1, motions: [], z: 0.4, windowInFrames: 30, enter: "none", exit: "none",
  enterDurationInFrames: 15, exitDurationInFrames: 15, fontSize: 80, color: "#ffffff", glow: "", width,
});
const audioTrack = (src: string): AudioTrack => ({ src, volume: 1, from: 0, trimBefore: 0, trimAfter: 0, loop: false });

/** Pixel-exact live preview: the SAME Timeline composition that renders to MP4, driven by the
 *  editor's project state. The Player fills an exact composition-aspect box so the on-canvas
 *  transform tools (CanvasOverlay) can map screen px <-> composition coordinates 1:1. */
export const Preview: React.FC<{ playerRef: React.RefObject<PlayerRef | null> }> = ({ playerRef }) => {
  const project = useEditor((s) => s.project);
  const addOverlay = useEditor((s) => s.addOverlay);
  const addAudio = useEditor((s) => s.addAudio);
  const seekRequest = useEditor((s) => s.seekRequest);
  const audioEnd = useAudioEnd(project.audio ?? [], project.fps ?? 30);
  const duration = computeDuration(project, audioEnd);
  const compW = project.width ?? 1920;
  const compH = project.height ?? 1080;
  const wrapRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const fit = useContainFit(wrapRef, compW, compH);
  const [dropping, setDropping] = useState(false);

  // One-shot seek/play request (the Scenes strip's "Play from here", and anything else that wants
  // to drive the Player). Keyed on `n` so asking for the frame you are already on still re-fires;
  // the `until` listener pauses and REMOVES ITSELF, so it can never outlive its own request.
  // The Wall view's Live mode runs the identical effect on the same shared ref (the two views are
  // never mounted at once).
  //
  // `seekRequest` is a message that OUTLIVES the component that sent it (it is transient store
  // state, not cleared on consumption — clearing it inside this effect would re-run the effect and
  // tear down the `until` listener it just installed). So each consumer remembers the nonce it has
  // already acted on, seeded on MOUNT with whatever is parked: otherwise "▸ Play from here" in the
  // Wall view, followed by a trip back to Edit, made the Edit player seek into the wall clip and
  // start playing on its own.
  const seenSeek = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    if (seenSeek.current === undefined) {
      seenSeek.current = seekRequest?.n ?? null;
      return;
    }
    if (!seekRequest || seekRequest.n === seenSeek.current) return;
    seenSeek.current = seekRequest.n;
    const p = playerRef.current;
    if (!p) return;
    p.seekTo(seekRequest.frame);
    if (!seekRequest.play) return;
    const until = seekRequest.until;
    p.play();
    if (until == null) return;
    const onFrame = (e: { detail: { frame: number } }) => {
      if (e.detail.frame >= until) {
        p.pause();
        p.removeEventListener("frameupdate", onFrame);
      }
    };
    p.addEventListener("frameupdate", onFrame);
    return () => p.removeEventListener("frameupdate", onFrame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekRequest?.n]);

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
