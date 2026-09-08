// Measured soundtrack length, in frames.
//
// Lives here rather than inside Preview.tsx because BOTH players need it: `computeDuration` sizes
// the composition as max(Σclips − Σtransitions, overlay end, AUDIO end), and the audio term is the
// only one that cannot be computed from the JSON — it has to be read off the decoded file. The Wall
// view's Live mode was sizing its Player without it, so playing a song-length project there stopped
// short of what the Edit preview and the MP4 produce.
import { useEffect, useState } from "react";
import { staticFile } from "remotion";
import { getAudioDurationInSeconds } from "@remotion/media-utils";
import type { AudioTrack } from "../../../src/timeline/schema";
import { audioEndFrames } from "./timeline-utils";

const resolveSrc = (src: string) => (/^https?:\/\//.test(src) ? src : staticFile(src));

/** Read each non-looping track's length (frames) in the browser so the Player is sized to the song.
 *  Looping tracks fill the timeline and never define it, so they are never measured. */
export function useAudioEnd(audio: AudioTrack[], fps: number): number {
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
