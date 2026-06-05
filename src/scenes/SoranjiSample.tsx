import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { getTransitionPresentation } from "../effects";
import { Mushroom } from "../components/Mushroom";
import { Layer } from "../components/Layer";

const BPM = 120;

const ClipA: React.FC = () => (
  <Img src={staticFile("clip-a.svg")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
);
const ClipB: React.FC = () => (
  <Img src={staticFile("clip-b.svg")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
);

/**
 * The fixed BPM sample: 6.0s / 120 BPM at 1920x1080 / 30fps = 180 frames.
 * Footage A->B via slidePush (78 + 120 - 18 = 180). Each sprite mounts only
 * within its own window (no duplicate overlap). beatFlash overlays the lot.
 */
export const SoranjiSample: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: "#0c1322" }}>
    {/* BACK LAYER: footage transition. */}
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={78}>
        <ClipA />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={getTransitionPresentation("slidePush", { direction: "from-right" })}
        timing={linearTiming({ durationInFrames: 18 })}
      />
      <TransitionSeries.Sequence durationInFrames={120}>
        <ClipB />
      </TransitionSeries.Sequence>
    </TransitionSeries>

    {/* FRONT LAYER: windowed sprites. */}
    <Mushroom src="orange-mush.gif" motionId="springPop" from={0} durationInFrames={40} windowInFrames={36} left="22%" top="66%" />
    <Mushroom src="orange-mush.gif" motionId="floatLoop" from={40} durationInFrames={140} left="22%" top="66%" bpm={BPM} />
    <Mushroom src="pixel-mush.gif" motionId="motionPath" from={36} durationInFrames={42} windowInFrames={42} left="0%" top="0%" bpm={BPM} />
    <Mushroom src="pixel-mush.gif" motionId="beatPulse" from={84} durationInFrames={96} left="66%" top="60%" bpm={BPM} />

    {/* BEAT FLASH full-frame overlay. */}
    <Layer motionId="beatFlash" from={0} durationInFrames={180} bpm={BPM} style={{ inset: 0, width: "100%", height: "100%" }}>
      <div />
    </Layer>
  </AbsoluteFill>
);
