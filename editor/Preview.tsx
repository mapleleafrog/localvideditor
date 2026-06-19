import React, { useEffect, useMemo, useState } from "react";
import { Player } from "@remotion/player";
import { getAudioDurationInSeconds } from "@remotion/media-utils";
import { Timeline, audioEndFrames, computeTimelineDuration } from "../src/timeline/Timeline";
import type { Project } from "../src/timeline/schema";

const resolve = (src: string) => (/^https?:\/\//.test(src) ? src : `/${src}`);

/** Live preview via @remotion/player — same component the CLI renders, so what you see is what you get. */
export const Preview: React.FC<{ project: Project }> = ({ project }) => {
  // Audio file lengths aren't in the JSON — read them (in frames) so the song can drive duration.
  const [audioFrames, setAudioFrames] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    const missing = project.audio.filter((a) => audioFrames[a.src] === undefined);
    if (!missing.length) return;
    Promise.all(
      missing.map(async (a) => {
        try {
          const secs = await getAudioDurationInSeconds(resolve(a.src));
          return [a.src, Math.round(secs * project.fps)] as const;
        } catch {
          return [a.src, 0] as const;
        }
      }),
    ).then((pairs) => {
      if (!cancelled) setAudioFrames((prev) => ({ ...prev, ...Object.fromEntries(pairs) }));
    });
    return () => {
      cancelled = true;
    };
  }, [project.audio, project.fps, audioFrames]);

  const durationInFrames = useMemo(() => {
    const audioEnd = audioEndFrames(project.audio, (src) => audioFrames[src]);
    return computeTimelineDuration(project, audioEnd);
  }, [project, audioFrames]);

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
