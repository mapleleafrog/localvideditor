import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { getTransitionPresentation, readyTransitions } from "../effects";

// Showcase: a continuous reel cycling clip A/B with every PREVIEW-SAFE ready
// transition between them (engine:"webgl" shader transitions are excluded so
// the reel previews without the Chrome canvas-draw-element flag; they still
// render fine via `remotion render`).
const SEG = 26;
const TRANS = 16;
const TRANSITIONS = readyTransitions({ previewSafe: true });
export const TRANSITION_GALLERY_FRAMES = Math.max(
  SEG,
  (TRANSITIONS.length + 1) * SEG - TRANSITIONS.length * TRANS,
);

const Clip: React.FC<{ src: string; label: string }> = ({ src, label }) => (
  <AbsoluteFill>
    <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    <div
      style={{
        position: "absolute",
        left: 48,
        bottom: 48,
        color: "#fff",
        fontFamily: "monospace",
        fontSize: 38,
        fontWeight: 700,
        textShadow: "0 2px 8px rgba(0,0,0,0.8)",
      }}
    >
      {label}
    </div>
  </AbsoluteFill>
);

export const TransitionGallery: React.FC = () => {
  const items: React.ReactNode[] = [
    <TransitionSeries.Sequence key="seq-0" durationInFrames={SEG}>
      <Clip src="clip-a.svg" label={`▶ ${TRANSITIONS[0]?.id ?? ""}`} />
    </TransitionSeries.Sequence>,
  ];
  TRANSITIONS.forEach((t, i) => {
    items.push(
      <TransitionSeries.Transition
        key={`tr-${t.id}`}
        presentation={getTransitionPresentation(t.id)}
        timing={linearTiming({ durationInFrames: TRANS })}
      />,
      <TransitionSeries.Sequence key={`seq-${i + 1}`} durationInFrames={SEG}>
        <Clip
          src={i % 2 === 0 ? "clip-b.svg" : "clip-a.svg"}
          label={`${t.id}  →  ${TRANSITIONS[i + 1]?.id ?? "end"}`}
        />
      </TransitionSeries.Sequence>,
    );
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <TransitionSeries>{items}</TransitionSeries>
    </AbsoluteFill>
  );
};
