import React, { useCallback, useEffect, useRef, useState } from "react";
import { staticFile } from "remotion";
import { useEditor } from "../store";
import type { Overlay } from "../../../src/timeline/schema";
import { listMedia, uploadMedia } from "../lib/api";
import { ensureProjectName } from "../lib/names";
import { imageNaturalSize, placeWidth } from "../lib/image";

// Fallback list until /api/media responds (the dev server scans public/ + public/media/).
const FALLBACK_ASSETS = ["clip-a.svg", "clip-b.svg", "orange-mush.gif", "pixel-mush.gif", "passport_pic_TJH.png"];

const isVideo = (f: string) => /\.(mp4|webm|mov)$/i.test(f);
const srcUrl = (ref: string) => (/^https?:\/\//.test(ref) ? ref : staticFile(ref));

const imageOverlay = (src: string, width: number): Overlay => ({
  type: "image", text: "", src, from: 0, durationInFrames: 60, x: 50, y: 50, scale: 1, rotation: 0,
  opacity: 1, motions: [], z: 0.4, windowInFrames: 30, enter: "none", exit: "none",
  enterDurationInFrames: 15, exitDurationInFrames: 15, fontSize: 80, color: "#ffffff", glow: "", width,
});

/** Asset browser: drag-drop / pick files to import into public/media/, preview thumbnails, and
 *  click a tile to add it as an image layer. Audio files import too but show up in the Audio tab. */
export const AssetsPanel: React.FC = () => {
  const addOverlay = useEditor((s) => s.addOverlay);
  const projectName = useEditor((s) => s.projectName);
  const compW = useEditor((s) => s.project.width ?? 1920);
  const compH = useEditor((s) => s.project.height ?? 1080);

  // Add an asset as an image layer at its NATIVE size (scaled down only if bigger than the frame).
  const addImage = async (ref: string) => {
    const { w, h } = await imageNaturalSize(srcUrl(ref));
    addOverlay(imageOverlay(ref, placeWidth(w, h, compW, compH, Math.round(compW * 0.5))));
  };
  const [assets, setAssets] = useState<string[]>(FALLBACK_ASSETS);
  const [dragging, setDragging] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(
    (proj = projectName) => listMedia(proj).then((a) => { if (a.length) setAssets(a); }),
    [projectName],
  );
  useEffect(() => { refresh(); }, [refresh]);

  const flash = (m: string) => {
    setNote(m);
    setTimeout(() => setNote((n) => (n === m ? null : n)), 3000);
  };

  const importFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (!arr.length) return;
    const proj = ensureProjectName();
    if (!proj) {
      flash("Name the project first to import media.");
      return;
    }
    setNote(`Importing ${arr.length} file${arr.length > 1 ? "s" : ""}…`);
    let ok = 0;
    for (const f of arr) {
      const r = await uploadMedia(f, proj);
      if (r.ok) ok++;
    }
    await refresh(proj);
    flash(`Imported ${ok}/${arr.length}${ok < arr.length ? " (some failed)" : ""}`);
  };

  return (
    <div
      className={"assets-panel" + (dragging ? " dragging" : "")}
      onDragOver={(e) => { e.preventDefault(); if (!dragging) setDragging(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); importFiles(e.dataTransfer.files); }}
    >
      <div className="lib-hint">Drag files here to import, or click a tile to add it as an image layer. Audio lands in the Audio tab.</div>
      <button className="lib-item" style={{ width: "100%", textAlign: "center" }} onClick={() => inputRef.current?.click()}>
        + Add files…
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        accept="image/*,video/*,audio/*"
        onChange={(e) => { void importFiles(e.target.files ?? []); e.target.value = ""; }}
      />
      {note && <div className="muted" style={{ margin: "6px 0" }}>{note}</div>}

      <div className="asset-grid">
        {assets.map((a) => (
          <button key={a} className="asset-tile" title={`Add ${a}`} onClick={() => addImage(a)}>
            {isVideo(a) ? (
              <video className="asset-thumb" src={srcUrl(a)} muted preload="metadata" />
            ) : (
              <img className="asset-thumb" src={srcUrl(a)} alt="" loading="lazy" />
            )}
            <span className="asset-name">{a}</span>
          </button>
        ))}
      </div>

      {dragging && <div className="drop-overlay">Drop to import</div>}
    </div>
  );
};
