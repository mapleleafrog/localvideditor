import React from "react";
import { Composition } from "remotion";
import "./index.css";
import { SoranjiSample } from "./scenes/SoranjiSample";
import { MotionGallery, MOTION_GALLERY_FRAMES } from "./scenes/MotionGallery";
import { TransitionGallery, TRANSITION_GALLERY_FRAMES } from "./scenes/TransitionGallery";
import { Timeline, calculateTimelineMetadata } from "./timeline/Timeline";
import { projectSchema } from "./timeline/schema";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Timeline"
        component={Timeline}
        schema={projectSchema}
        // Inlined literal (NOT an imported const) so Remotion Studio can SAVE
        // visual edits back to this file. Edit clips/overlays in the Props panel.
        defaultProps={{
          background: {
            type: "motion",
            color: "#0c1322",
            gradient: "linear-gradient(#1b2a6b, #0e3b4d)",
            motion: "synthGrid",
          },
          clips: [
            {
              type: "image",
              src: "clip-a.svg",
              durationInFrames: 90,
              motion: "kenBurns",
              transitionToNext: "dreamyZoom",
              transitionDurationInFrames: 24,
              trimBefore: 0,
              trimAfter: 0,
              volume: 1,
            },
            {
              type: "image",
              src: "clip-b.svg",
              durationInFrames: 120,
              motion: "slowZoomIn",
              transitionToNext: "none",
              transitionDurationInFrames: 20,
              trimBefore: 0,
              trimAfter: 0,
              volume: 1,
            },
          ],
          overlays: [
            {
              type: "text",
              text: "Soranji",
              src: "orange-mush.gif",
              from: 12,
              durationInFrames: 96,
              x: 50,
              y: 28,
              scale: 1,
              rotation: 0,
              opacity: 1,
              motions: ["floatLoop", "neonGlow"],
              z: 0.4,
              windowInFrames: 24,
              enter: "none",
              exit: "none",
              enterDurationInFrames: 15,
              exitDurationInFrames: 15,
              fontSize: 120,
              color: "#ffffff",
              glow: "0 0 18px #ff2e88, 0 0 36px #ff2e88",
              width: 200,
            },
            {
              type: "image",
              text: "Title",
              src: "orange-mush.gif",
              from: 40,
              durationInFrames: 120,
              x: 76,
              y: 68,
              scale: 1,
              rotation: 0,
              opacity: 1,
              motions: ["floatLoop", "pixelBob"],
              z: 0.45,
              windowInFrames: 30,
              enter: "none",
              exit: "none",
              enterDurationInFrames: 15,
              exitDurationInFrames: 15,
              fontSize: 80,
              color: "#ffffff",
              glow: "",
              width: 200,
            },
          ],
          audio: [],
          bpm: 120,
          beatOffsetInFrames: 0,
          fps: 30,
          width: 1920,
          height: 1080,
        }}
        calculateMetadata={calculateTimelineMetadata}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="SoranjiSample"
        component={SoranjiSample}
        durationInFrames={180}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="MotionGallery"
        component={MotionGallery}
        durationInFrames={MOTION_GALLERY_FRAMES}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="TransitionGallery"
        component={TransitionGallery}
        durationInFrames={TRANSITION_GALLERY_FRAMES}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
