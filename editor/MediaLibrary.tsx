import React, { useCallback, useEffect, useRef, useState } from "react";
import { listMedia, uploadMedia } from "./api";
import { basename, isAudioSrc, isVideoSrc } from "./model";

/** Import footage into public/media/ and add it to the timeline as a clip. */
export const MediaLibrary: React.FC<{
  onAddClip: (src: string) => void;
  onAddImageOverlay: (src: string) => void;
  notify: (kind: "ok" | "err", msg: string) => void;
}> = ({ onAddClip, onAddImageOverlay, notify }) => {
  const [files, setFiles] = useState<string[]>([]);
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    listMedia()
      .then((all) => setFiles(all.filter((f) => !isAudioSrc(f))))
      .catch(() => setFiles([]));
  }, []);
  useEffect(refresh, [refresh]);

  const ingest = useCallback(
    async (list: FileList | null) => {
      if (!list || !list.length) return;
      try {
        let last = "";
        for (const f of Array.from(list)) last = await uploadMedia(f);
        notify("ok", `Imported ${list.length} file(s)`);
        refresh();
        if (list.length === 1 && last) onAddClip(last);
      } catch (e) {
        notify("err", (e as Error).message);
      }
    },
    [notify, refresh, onAddClip],
  );

  return (
    <div className="section">
      <h3>Media</h3>
      <div
        className={`dropzone ${over ? "over" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          ingest(e.dataTransfer.files);
        }}
      >
        Drop footage here, or click to import
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="video/*,image/*"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          ingest(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="media-list">
        {files.map((f) => {
          const src = `media/${f}`;
          const video = isVideoSrc(f);
          return (
            <div key={f} className="media-item" title={`${f}\nClick: add as clip · Shift+click: add as overlay`}>
              <div
                onClick={(e) => (e.shiftKey ? onAddImageOverlay(src) : onAddClip(src))}
                style={{ cursor: "pointer" }}
              >
                {video ? (
                  <div className="thumb" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                    ▶
                  </div>
                ) : (
                  <img className="thumb" src={`/${src}`} alt={f} />
                )}
                <div>
                  <span className="badge">{video ? "VIDEO" : "IMG"}</span> {basename(f)}
                </div>
              </div>
            </div>
          );
        })}
        {!files.length ? <div className="hint">No media yet.</div> : null}
      </div>
    </div>
  );
};
