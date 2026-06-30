import React, { useCallback, useEffect, useRef, useState } from "react";
import { useEditor } from "../store";
import { listAudio, uploadMedia } from "../lib/api";
import { ensureProjectName } from "../lib/names";
import type { AudioTrack } from "../../../src/timeline/schema";

const newTrack = (src: string): AudioTrack => ({ src, volume: 1, from: 0, trimBefore: 0, trimAfter: 0, loop: false });
const isAudioFile = (n: string) => /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(n);

/** Soundtrack + beat-sync controls (Library "Audio" tab). Music plays under the whole video; the
 *  BPM/offset drive the beat-reactive motions (beatPulse, beatShake, …) so they lock to the song.
 *  Drop audio here (or pick files) to import it into public/media/<project>/ AND add it as a track. */
export const AudioPanel: React.FC = () => {
  const project = useEditor((s) => s.project);
  const patchProject = useEditor((s) => s.patchProject);
  const addAudio = useEditor((s) => s.addAudio);
  const patchAudio = useEditor((s) => s.patchAudio);
  const removeAudio = useEditor((s) => s.removeAudio);

  const projectName = useEditor((s) => s.projectName);
  const [files, setFiles] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback((proj = projectName) => listAudio(proj).then(setFiles), [projectName]);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const flash = (m: string) => {
    setNote(m);
    setTimeout(() => setNote((n) => (n === m ? null : n)), 3000);
  };

  // Import dropped/picked audio: upload to the project's media folder, add each as a soundtrack track,
  // and refresh the picker list. Non-audio files are ignored (with a hint).
  const importFiles = async (fileList: FileList | File[]) => {
    const arr = Array.from(fileList);
    if (!arr.length) return;
    const audioFiles = arr.filter((f) => isAudioFile(f.name));
    if (!audioFiles.length) {
      flash("Only audio files (.mp3/.wav/.m4a/…) go here — use the Assets tab for images/video.");
      return;
    }
    const proj = ensureProjectName();
    if (!proj) {
      flash("Name the project first to import audio.");
      return;
    }
    setNote(`Importing ${audioFiles.length} track${audioFiles.length > 1 ? "s" : ""}…`);
    let ok = 0;
    for (const f of audioFiles) {
      const r = await uploadMedia(f, proj);
      if (r.ok && r.ref) {
        addAudio(newTrack(r.ref));
        ok++;
      }
    }
    await refresh(proj);
    flash(`Added ${ok} track${ok === 1 ? "" : "s"}${ok < audioFiles.length ? " (some failed)" : ""}`);
  };

  const tracks = project.audio ?? [];
  const bpm = project.bpm ?? 120;
  const beatOffset = project.beatOffsetInFrames ?? 0;
  const fps = project.fps ?? 30;

  return (
    <div
      className={"audio-panel" + (dragging ? " dragging" : "")}
      onDragOver={(e) => {
        e.preventDefault();
        if (!dragging) setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void importFiles(e.dataTransfer.files);
      }}
    >
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
      <div className="lib-hint">Drag audio anywhere on this panel, or pick files — they import and become a track.</div>
      <button className="lib-item" style={{ width: "100%", textAlign: "center" }} onClick={() => inputRef.current?.click()}>
        + Add audio files…
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac"
        onChange={(e) => {
          void importFiles(e.target.files ?? []);
          e.target.value = "";
        }}
      />
      {note && <div className="muted" style={{ margin: "6px 0" }}>{note}</div>}

      <div className="lib-hint" style={{ marginTop: 8 }}>Already imported (click to add again):</div>
      <div className="lib-grid">
        {files.length === 0 && <span className="muted">no audio files found</span>}
        {files.map((f) => (
          <button key={f} className="lib-item" title={`Add ${f} as a track`} onClick={() => addAudio(newTrack(f))}>
            {f}
          </button>
        ))}
      </div>

      {dragging && <div className="drop-overlay">Drop audio to import</div>}
    </div>
  );
};
