import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  type CalculateMetadataFunction,
} from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { getAudioDurationInSeconds } from "@remotion/media-utils";
import { getMotion, getTransitionPresentation } from "../effects";
import { beatKick, clamp } from "../effects/helpers";
import { Layer } from "../components/Layer";
import type { Project, Clip, Overlay, Background, AudioTrack } from "./schema";

const FILL: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover" };

/** http(s) URLs pass through; everything else is a public/ asset. */
const resolveSrc = (src: string) => (/^https?:\/\//.test(src) ? src : staticFile(src));

// --- one clip: full-frame media with its clip-local motion (Ken Burns etc.) ---
const ClipContent: React.FC<{ clip: Clip; bpm: number; beatOffsetInFrames: number }> = ({
  clip,
  bpm,
  beatOffsetInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = clamp(frame / clip.durationInFrames);
  const t = frame / fps;
  const motionStyle =
    clip.motion && clip.motion !== "none"
      ? getMotion(clip.motion)({
          progress,
          frame,
          fps,
          t,
          beat: beatKick(t, bpm, 6, beatOffsetInFrames / fps),
          z: 0,
          params: {},
        })
      : {};
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <div style={{ width: "100%", height: "100%", ...motionStyle }}>
        {clip.type === "video" ? (
          <OffthreadVideo
            src={resolveSrc(clip.src)}
            trimBefore={clip.trimBefore || undefined}
            trimAfter={clip.trimAfter || undefined}
            volume={clip.volume ?? 1}
            style={FILL}
          />
        ) : (
          <Img src={resolveSrc(clip.src)} style={FILL} />
        )}
      </div>
    </AbsoluteFill>
  );
};

// --- the clip track: clips joined by transitions ---
const ClipTrack: React.FC<{ clips: Clip[]; bpm: number; beatOffsetInFrames: number }> = ({
  clips,
  bpm,
  beatOffsetInFrames,
}) => {
  if (!clips.length) return null;
  const items: React.ReactNode[] = [];
  clips.forEach((clip, i) => {
    items.push(
      <TransitionSeries.Sequence key={`seq-${i}`} durationInFrames={clip.durationInFrames}>
        <ClipContent clip={clip} bpm={bpm} beatOffsetInFrames={beatOffsetInFrames} />
      </TransitionSeries.Sequence>,
    );
    if (clip.transitionToNext && clip.transitionToNext !== "none" && i < clips.length - 1) {
      items.push(
        <TransitionSeries.Transition
          key={`tr-${i}`}
          presentation={getTransitionPresentation(clip.transitionToNext)}
          timing={linearTiming({ durationInFrames: clip.transitionDurationInFrames })}
        />,
      );
    }
  });
  return <TransitionSeries>{items}</TransitionSeries>;
};

// --- a positioned overlay with stacked effects ---
const OverlayLayer: React.FC<{ overlay: Overlay; index?: number; bpm: number; beatOffsetInFrames: number }> = ({
  overlay: o,
  index,
  bpm,
  beatOffsetInFrames,
}) => {
  // Full-frame effect layer: fills the frame, no text/image, no centering/scale — just stacked
  // full-frame motions (petals, bokeh, light-leaks, scanlines). Composites on top of the clips.
  if (o.type === "fx") {
    return (
      <Layer
        motionIds={o.motions ?? []}
        from={o.from ?? 0}
        durationInFrames={o.durationInFrames}
        windowInFrames={o.windowInFrames}
        bpm={bpm}
        beatOffsetInFrames={beatOffsetInFrames}
        enter={o.enter}
        exit={o.exit}
        enterDurationInFrames={o.enterDurationInFrames}
        exitDurationInFrames={o.exitDurationInFrames}
        dataIndex={index}
        style={{ left: 0, top: 0, width: "100%", height: "100%", opacity: o.opacity ?? 1 }}
      />
    );
  }
  const content =
    o.type === "text" ? (
      <div
        style={{
          fontSize: o.fontSize ?? 80,
          color: o.color ?? "#fff",
          fontFamily: "monospace",
          fontWeight: 700,
          whiteSpace: "nowrap",
          textShadow: o.glow || "none",
        }}
      >
        {o.text}
      </div>
    ) : o.type === "video" ? (
      // Video layer — rebased to start at the overlay's `from` so it plays from its beginning.
      <Sequence from={o.from ?? 0} layout="none">
        <OffthreadVideo src={resolveSrc(o.src)} style={{ width: o.width ?? 480, height: "auto", display: "block" }} />
      </Sequence>
    ) : (
      <Img src={resolveSrc(o.src)} className="pixelated" style={{ width: o.width ?? 200, height: "auto", display: "block" }} />
    );
  return (
    <Layer
      motionIds={o.motions ?? []}
      from={o.from ?? 0}
      durationInFrames={o.durationInFrames}
      windowInFrames={o.windowInFrames}
      bpm={bpm}
      beatOffsetInFrames={beatOffsetInFrames}
      enter={o.enter}
      exit={o.exit}
      enterDurationInFrames={o.enterDurationInFrames}
      exitDurationInFrames={o.exitDurationInFrames}
      z={o.z}
      scale={o.scale ?? 1}
      rotation={o.rotation ?? 0}
      dataIndex={index}
      centered
      style={{ left: `${o.x ?? 50}%`, top: `${o.y ?? 50}%`, opacity: o.opacity ?? 1 }}
    >
      {content}
    </Layer>
  );
};

const BackgroundLayer: React.FC<{ background: Background; bpm: number; beatOffsetInFrames: number }> = ({
  background: bg,
  bpm,
  beatOffsetInFrames,
}) => {
  if (!bg || bg.type === "none") return null;
  if (bg.type === "color") return <AbsoluteFill style={{ backgroundColor: bg.color ?? "#000" }} />;
  if (bg.type === "gradient")
    return <AbsoluteFill style={{ backgroundImage: bg.gradient ?? "linear-gradient(#000,#111)" }} />;
  if (bg.type === "motion" && bg.motion && bg.motion !== "none")
    return (
      <Layer
        motionId={bg.motion}
        bpm={bpm}
        beatOffsetInFrames={beatOffsetInFrames}
        style={{ inset: 0, width: "100%", height: "100%" }}
      />
    );
  return <AbsoluteFill style={{ backgroundColor: "#000" }} />;
};

// --- soundtrack: each track played under the whole timeline ---
const SoundtrackLayer: React.FC<{ tracks: AudioTrack[] }> = ({ tracks }) => (
  <>
    {tracks.map((a, i) => (
      <Sequence key={i} from={a.from ?? 0} name={`audio-${i}`}>
        <Audio
          src={resolveSrc(a.src)}
          volume={() => a.volume ?? 1}
          trimBefore={a.trimBefore || undefined}
          trimAfter={a.trimAfter || undefined}
          loop={a.loop ?? false}
        />
      </Sequence>
    ))}
  </>
);

/** The generic, config-driven video composition.
 *  `background.type === "none"` yields a TRANSPARENT root (no black fill) so the render can carry an
 *  alpha channel (ProRes 4444 / VP8) for compositing in DaVinci/Premiere. The render plugin sets
 *  `background:none` (and optionally empties `clips`) for its transparent / overlays-only export modes. */
export const Timeline: React.FC<Project> = ({ background, clips, overlays, audio, bpm, beatOffsetInFrames }) => {
  const bpmV = bpm ?? 120;
  const offV = beatOffsetInFrames ?? 0;
  return (
    <AbsoluteFill style={{ backgroundColor: background?.type === "none" ? "transparent" : "#000" }}>
      <BackgroundLayer background={background} bpm={bpmV} beatOffsetInFrames={offV} />
      <ClipTrack clips={clips ?? []} bpm={bpmV} beatOffsetInFrames={offV} />
      {(overlays ?? []).map((o, i) => (
        <OverlayLayer key={i} overlay={o} index={i} bpm={bpmV} beatOffsetInFrames={offV} />
      ))}
      <SoundtrackLayer tracks={audio ?? []} />
    </AbsoluteFill>
  );
};

/** Last frame any non-looping audio track is still playing — so the video can run as long as the
 *  song. `durationOf(src)` returns the source length in frames (undefined = unknown → that track
 *  doesn't extend the timeline). Looping tracks fill the timeline, they never define it. */
export const audioEndFrames = (audio: AudioTrack[], durationOf: (src: string) => number | undefined): number =>
  audio.reduce((end, a) => {
    if (a.loop) return end;
    const srcFrames = durationOf(a.src);
    if (srcFrames == null) return end;
    const playable = (a.trimAfter || srcFrames) - (a.trimBefore || 0);
    return Math.max(end, (a.from ?? 0) + Math.max(0, playable));
  }, 0);

/** Total length = max(ΣclipDurations − Σtransitions, latest overlay end, soundtrack end).
 *  Async because audio lengths are read from the files (degrades to no-extend if unavailable). */
export const calculateTimelineMetadata: CalculateMetadataFunction<Project> = async ({ props }) => {
  const clips = props.clips ?? [];
  const overlays = props.overlays ?? [];
  const audio = props.audio ?? [];
  const fps = props.fps ?? 30;
  const clipsTotal = clips.reduce((s, c) => s + c.durationInFrames, 0);
  const transTotal = clips.reduce(
    (s, c, i) =>
      s + (i < clips.length - 1 && c.transitionToNext && c.transitionToNext !== "none" ? c.transitionDurationInFrames : 0),
    0,
  );
  const overlayEnd = overlays.reduce((m, o) => Math.max(m, (o.from ?? 0) + o.durationInFrames), 0);

  const durations = new Map<string, number>();
  await Promise.all(
    audio
      .filter((a) => !a.loop)
      .map(async (a) => {
        try {
          const secs = await getAudioDurationInSeconds(resolveSrc(a.src));
          durations.set(a.src, Math.round(secs * fps));
        } catch {
          /* unreadable here (no ffmpeg/network) → just don't extend for this track */
        }
      }),
  );
  const audioEnd = audioEndFrames(audio, (src) => durations.get(src));

  return {
    durationInFrames: Math.max(clipsTotal - transTotal, overlayEnd, audioEnd, 1),
    fps,
    width: props.width ?? 1920,
    height: props.height ?? 1080,
  };
};
