import React, { useEffect, useState } from "react";
import { useEditor } from "../store";
import { listAudio } from "../lib/api";
import type { AudioTrack } from "../../../src/timeline/schema";

const newTrack = (src: string): AudioTrack => ({ src, volume: 1, from: 0, trimBefore: 0, trimAfter: 0, loop: false });

/** Soundtrack + beat-sync controls (Library "Audio" tab). Music plays under the whole video; the
 *  BPM/offset drive the beat-reactive motions (beatPulse, beatShake, …) so they lock to the song. */
export const AudioPanel: React.FC = () => {
  const project = useEditor((s) => s.project);
  const patchProject = useEditor((s) => s.patchProject);
  const addAudio = useEditor((s) => s.addAudio);
  const patchAudio = useEditor((s) => s.patchAudio);
  const removeAudio = useEditor((s) => s.removeAudio);

  const [files, setFiles] = useState<string[]>([]);
  useEffect(() => {
    listAudio().then(setFiles);
  }, []);

  const tracks = project.audio ?? [];
  const bpm = project.bpm ?? 120;
  const beatOffset = project.beatOffsetInFrames ?? 0;
  const fps = project.fps ?? 30;

  return (
    <div className="audio-panel">
      <div className="lib-cat">Beat sync</div>
      <div className="lib-hint">
        Beat-reactive motions (beatPulse, beatShake, beatFlash…) pulse on this tempo. Set it to your song&apos;s BPM,
        then nudge the offset so the kick lands on the downbeat.
      </div>
      <div className="fld">
        <label>BPM</label>
        <input
          type="number"
          min={20}
          max={300}
          value={bpm}
          onChange={(e) => patchProject({ bpm: Math.max(1, +e.target.value) })}
        />
      </div>
      <div className="fld">
        <label>Beat offset (frames)</label>
        <input
          type="number"
          value={beatOffset}
          onChange={(e) => patchProject({ beatOffsetInFrames: Math.round(+e.target.value || 0) })}
        />
        <span className="muted">{(beatOffset / fps).toFixed(2)}s</span>
      </div>

      <div className="lib-cat">Soundtrack</div>
      {tracks.length === 0 && <div className="lib-hint">No music yet — add a file below.</div>}
      {tracks.map((a, i) => (
        <div className="audio-track" key={i}>
          <div className="audio-track-head">
            <span className="audio-name" title={a.src}>
              {a.src}
            </span>
            <button className="del" title="Remove track" onClick={() => removeAudio(i)}>
              ×
            </button>
          </div>
          <div className="fld">
            <label>Volume</label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={a.volume}
              onChange={(e) => patchAudio(i, { volume: +e.target.value })}
            />
            <span className="muted">{Math.round((a.volume ?? 1) * 100)}%</span>
          </div>
          <div className="fld">
            <label>Start (frame)</label>
            <input
              type="number"
              min={0}
              value={a.from}
              onChange={(e) => patchAudio(i, { from: Math.max(0, +e.target.value) })}
            />
          </div>
          <div className="fld">
            <label>Trim in (frames)</label>
            <input
              type="number"
              min={0}
              value={a.trimBefore ?? 0}
              onChange={(e) => patchAudio(i, { trimBefore: Math.max(0, +e.target.value) })}
            />
          </div>
          <div className="fld">
            <label>Loop to fill</label>
            <input type="checkbox" checked={!!a.loop} onChange={(e) => patchAudio(i, { loop: e.target.checked })} />
          </div>
        </div>
      ))}

      <div className="lib-cat">Add music</div>
      <div className="lib-hint">Drop .mp3 / .wav / .m4a in public/media/ — they appear here.</div>
      <div className="lib-grid">
        {files.length === 0 && <span className="muted">no audio files found</span>}
        {files.map((f) => (
          <button key={f} className="lib-item" onClick={() => addAudio(newTrack(f))}>
            {f}
          </button>
        ))}
      </div>
    </div>
  );
};
