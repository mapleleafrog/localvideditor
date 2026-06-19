import React, { useMemo } from "react";
import { Player } from "@remotion/player";
import { Timeline, computeTimelineDuration } from "../src/timeline/Timeline";
import type { Project } from "../src/timeline/schema";

/** Live preview via @remotion/player — same component the CLI renders, so what you see is what you get. */
export const Preview: React.FC<{ project: Project }> = ({ project }) => {
  const durationInFrames = useMemo(() => computeTimelineDuration(project), [project]);
  return (
    <div className="preview-wrap">
      <Player
        component={Timeline}
        inputProps={project}
        durationInFrames={durationInFrames}
        compositionWidth={project.width}
        compositionHeight={project.height}
        fps={project.fps}
        controls
        loop
        acknowledgeRemotionLicense
        style={{ width: "100%", aspectRatio: `${project.width} / ${project.height}` }}
      />
    </div>
  );
};
