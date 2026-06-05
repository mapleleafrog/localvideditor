import React from "react";
import { Composition } from "remotion";
import "./index.css";
import { SoranjiSample } from "./scenes/SoranjiSample";
import { MotionGallery, MOTION_GALLERY_FRAMES } from "./scenes/MotionGallery";
import { TransitionGallery, TRANSITION_GALLERY_FRAMES } from "./scenes/TransitionGallery";

export const RemotionRoot: React.FC = () => {
  return (
    <>
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
