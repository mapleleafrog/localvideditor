import React from "react";
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  type CalculateMetadataFunction,
} from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { getMotion, getTransitionPresentation } from "../effects";
import { beatKick, clamp } from "../effects/helpers";
import { Layer } from "../components/Layer";
import type { Project, Clip, Overlay, Background } from "./schema";

const FILL: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover" };

/** http(s) URLs pass through; everything else is a public/ asset. */
const resolveSrc = (src: string) => (/^https?:\/\//.test(src) ? src : staticFile(src));

// --- one clip: full-frame media with its clip-local motion (Ken Burns etc.) ---
const ClipContent: React.FC<{ clip: Clip }> = ({ clip }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = clamp(frame / clip.durationInFrames);
  const t = frame / fps;
  const motionStyle =
    clip.motion && clip.motion !== "none"
      ? getMotion(clip.motion)({ progress, frame, fps, t, beat: beatKick(t), z: 0, params: {} })
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
const ClipTrack: React.FC<{ clips: Clip[] }> = ({ clips }) => {
  if (!clips.length) return null;
  const items: React.ReactNode[] = [];
  clips.forEach((clip, i) => {
    items.push(
      <TransitionSeries.Sequence key={`seq-${i}`} durationInFrames={clip.durationInFrames}>
        <ClipContent clip={clip} />
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
const OverlayLayer: React.FC<{ overlay: Overlay }> = ({ overlay: o }) => {
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
    ) : (
      <Img src={resolveSrc(o.src)} className="pixelated" style={{ width: o.width ?? 200, height: "auto", display: "block" }} />
    );
  return (
    <Layer
      motionIds={o.motions ?? []}
      from={o.from ?? 0}
      durationInFrames={o.durationInFrames}
      windowInFrames={o.windowInFrames}
      z={o.z}
      scale={o.scale ?? 1}
      rotation={o.rotation ?? 0}
      centered
      style={{ left: `${o.x ?? 50}%`, top: `${o.y ?? 50}%`, opacity: o.opacity ?? 1 }}
    >
      {content}
    </Layer>
  );
};

const BackgroundLayer: React.FC<{ background: Background }> = ({ background: bg }) => {
  if (!bg || bg.type === "none") return null;
  if (bg.type === "color") return <AbsoluteFill style={{ backgroundColor: bg.color ?? "#000" }} />;
  if (bg.type === "gradient")
    return <AbsoluteFill style={{ backgroundImage: bg.gradient ?? "linear-gradient(#000,#111)" }} />;
  if (bg.type === "motion" && bg.motion && bg.motion !== "none")
    return <Layer motionId={bg.motion} style={{ inset: 0, width: "100%", height: "100%" }} />;
  return <AbsoluteFill style={{ backgroundColor: "#000" }} />;
};

/** The generic, config-driven video composition. */
export const Timeline: React.FC<Project> = ({ background, clips, overlays }) => (
  <AbsoluteFill style={{ backgroundColor: "#000" }}>
    <BackgroundLayer background={background} />
    <ClipTrack clips={clips ?? []} />
    {(overlays ?? []).map((o, i) => (
      <OverlayLayer key={i} overlay={o} />
    ))}
  </AbsoluteFill>
);

/** Total length = ΣclipDurations − Σtransitions(with a next clip), covering all overlays. */
export const calculateTimelineMetadata: CalculateMetadataFunction<Project> = ({ props }) => {
  const clips = props.clips ?? [];
  const overlays = props.overlays ?? [];
  const clipsTotal = clips.reduce((s, c) => s + c.durationInFrames, 0);
  const transTotal = clips.reduce(
    (s, c, i) =>
      s + (i < clips.length - 1 && c.transitionToNext && c.transitionToNext !== "none" ? c.transitionDurationInFrames : 0),
    0,
  );
  const overlayEnd = overlays.reduce((m, o) => Math.max(m, (o.from ?? 0) + o.durationInFrames), 0);
  return {
    durationInFrames: Math.max(clipsTotal - transTotal, overlayEnd, 1),
    fps: props.fps ?? 30,
    width: props.width ?? 1920,
    height: props.height ?? 1080,
  };
};
