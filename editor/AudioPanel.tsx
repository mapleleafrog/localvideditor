import React, { useCallback, useEffect, useRef, useState } from "react";
import type { AudioTrack } from "../src/timeline/schema";
import { listMedia, uploadMedia } from "./api";
import { basename, isAudioSrc } from "./model";
import { NumberField } from "./ui";

/** Import music / audio and lay it under the timeline as one or more tracks. */
export const AudioPanel: React.FC<{
  tracks: AudioTrack[];
  onAdd: (src: string) => void;
  onUpdate: (i: number, track: AudioTrack) => void;
  onDelete: (i: number) => void;
  notify: (kind: "ok" | "err", msg: string) => void;
}> = ({ tracks, onAdd, onUpdate, onDelete, notify }) => {
  const [files, setFiles] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    listMedia()
      .then((all) => setFiles(all.filter(isAudioSrc)))
      .catch(() => setFiles([]));
  }, []);
  useEffect(refresh, [refresh]);

  const ingest = useCallback(
    async (list: FileList | null) => {
      if (!list || !list.length) return;
      try {
        let last = "";
        for (const f of Array.from(list)) last = await uploadMedia(f);
        notify("ok", `Imported ${list.length} audio file(s)`);
        refresh();
        if (last) onAdd(last);
      } catch (e) {
        notify("err", (e as Error).message);
      }
    },
    [notify, refresh, onAdd],
  );

  return (
    <div className="section">
      <h3>Audio / Music</h3>
      <div className="btnrow" style={{ marginBottom: 8 }}>
        <button type="button" onClick={() => inputRef.current?.click()}>
          + Import music
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          ingest(e.target.files);
          e.target.value = "";
        }}
      />

      {files.length ? (
        <div className="chips" style={{ marginBottom: 8 }}>
          {files.map((f) => (
            <button key={f} type="button" className="chip" title="Add as audio track" onClick={() => onAdd(`media/${f}`)}>
              ♪ {basename(f)}
            </button>
          ))}
        </div>
      ) : null}

      {tracks.map((a, i) => (
        <div key={i} className="ov-item" style={{ display: "block" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <span className="grow">♪ {basename(a.src)}</span>
            <button className="ghost" type="button" onClick={() => onDelete(i)}>
              ×
            </button>
          </div>
          <NumberField label="volume" value={a.volume} min={0} max={1} step={0.05} onChange={(volume) => onUpdate(i, { ...a, volume })} />
          <NumberField label="start (f)" value={a.from} min={0} onChange={(from) => onUpdate(i, { ...a, from: Math.max(0, Math.round(from)) })} />
          <NumberField label="trim in (f)" value={a.trimBefore ?? 0} min={0} onChange={(v) => onUpdate(i, { ...a, trimBefore: v > 0 ? Math.round(v) : undefined })} />
          <label className="field" style={{ cursor: "pointer" }}>
            <span style={{ color: "var(--muted)", fontSize: 11 }}>loop</span>
            <input
              type="checkbox"
              checked={a.loop}
              style={{ width: "auto", justifySelf: "start" }}
              onChange={(e) => onUpdate(i, { ...a, loop: e.target.checked })}
            />
          </label>
        </div>
      ))}
      {!tracks.length ? <div className="hint">No audio. Import music to set your video to a song.</div> : null}
    </div>
  );
};
