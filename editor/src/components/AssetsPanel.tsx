import React, { useCallback, useEffect, useRef, useState } from "react";
import { staticFile } from "remotion";
import { useEditor } from "../store";
import type { Overlay } from "../../../src/timeline/schema";
import { listMedia, uploadMedia } from "../lib/api";
import { ensureProjectName } from "../lib/names";
import { imageNaturalSize, videoNaturalSize, placeWidth } from "../lib/image";
import type { AudioTrack } from "../../../src/timeline/schema";

// Fallback list until /api/media responds (the dev server scans public/ + public/media/).
const FALLBACK_ASSETS = ["clip-a.svg", "clip-b.svg", "orange-mush.gif", "pixel-mush.gif", "passport_pic_TJH.png"];

const isVideo = (f: string) => /\.(mp4|webm|mov)$/i.test(f);
const isAudio = (f: string) => /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(f);
const isImage = (f: string) => /\.(png|jpe?g|gif|webp|svg)$/i.test(f);
const audioTrack = (src: string): AudioTrack => ({ src, volume: 1, from: 0, trimBefore: 0, trimAfter: 0, loop: false });
const srcUrl = (ref: string) => (/^https?:\/\//.test(ref) ? ref : staticFile(ref));

const mediaOverlay = (src: string, width: number, type: "image" | "video"): Overlay => ({
  type, text: "", src, from: 0, durationInFrames: 60, x: 50, y: 50, scale: 1, rotation: 0,
  opacity: 1, motions: [], z: 0.4, windowInFrames: 30, enter: "none", exit: "none",
  enterDurationInFrames: 15, exitDurationInFrames: 15, fontSize: 80, color: "#ffffff", glow: "", width,
});

// Batch-arrange helpers: turn several just-imported photos into ready-to-go overlays instead of
// adding them one at a time. "Stack" = a staggered pile (polaroidFrame + alternating rotation,
// cascading in); "Grid" = an even grid filling the frame, all appearing together.
const STACK_ROTATIONS = [-4, 3, -2, 5, -3, 2, -5, 4];
const buildPhotoStack = (refs: string[], compW: number): Overlay[] => {
  const width = Math.round(compW * 0.32);
  return refs.map((src, i): Overlay => ({
    type: "image", text: "", src,
    from: i * 6, durationInFrames: 150,
    x: 50 + ((i % 3) - 1) * 3, y: 50 + (Math.floor(i / 3) % 3 - 1) * 3,
    scale: 1, rotation: STACK_ROTATIONS[i % STACK_ROTATIONS.length], opacity: 1,
    motions: ["polaroidFrame"], z: 0.4 + i * 0.05, windowInFrames: 30,
    enter: "pop", exit: "none", enterDurationInFrames: 15, exitDurationInFrames: 15,
    fontSize: 80, color: "#ffffff", glow: "", width,
  }));
};
const buildPhotoGrid = (refs: string[], compW: number): Overlay[] => {
  const cols = Math.ceil(Math.sqrt(refs.length));
  const rows = Math.ceil(refs.length / cols);
  const cellW = 100 / cols;
  const cellH = 100 / rows;
  const width = Math.round((compW / cols) * 0.85);
  return refs.map((src, i): Overlay => ({
    type: "image", text: "", src,
    from: 0, durationInFrames: 150,
    x: Math.round(cellW * ((i % cols) + 0.5)), y: Math.round(cellH * (Math.floor(i / cols) + 0.5)),
    scale: 1, rotation: 0, opacity: 1, motions: [], z: 0.4, windowInFrames: 30,
    enter: "fade", exit: "none", enterDurationInFrames: 15, exitDurationInFrames: 15,
    fontSize: 80, color: "#ffffff", glow: "", width,
  }));
};

/** Asset browser: drag-drop / pick files to import into public/media/, preview thumbnails, and
 *  click a tile to add it as an image layer. Audio files import too but show up in the Audio tab. */
export const AssetsPanel: React.FC = () => {
  const addOverlay = useEditor((s) => s.addOverlay);
  const addOverlays = useEditor((s) => s.addOverlays);
  const addAudio = useEditor((s) => s.addAudio);
  const projectName = useEditor((s) => s.projectName);
  const compW = useEditor((s) => s.project.width ?? 1920);
  const compH = useEditor((s) => s.project.height ?? 1080);

  // Add an asset as a layer at its NATIVE size (scaled down only if bigger than the frame).
  // Video files become video layers; everything else an image layer.
  const addAsset = async (ref: string) => {
    const vid = isVideo(ref);
    const { w, h } = await (vid ? videoNaturalSize : imageNaturalSize)(srcUrl(ref));
    addOverlay(mediaOverlay(ref, placeWidth(w, h, compW, compH, Math.round(compW * 0.5)), vid ? "video" : "image"));
  };
  const [assets, setAssets] = useState<string[]>(FALLBACK_ASSETS);
  const [dragging, setDragging] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // Offered right after a multi-photo import so you don't have to add each one by hand.
  const [batch, setBatch] = useState<string[] | null>(null);
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
    let audioCount = 0;
    const imageRefs: string[] = [];
    for (const f of arr) {
      const r = await uploadMedia(f, proj);
      if (!r.ok || !r.ref) continue;
      ok++;
      // Audio isn't a visual asset — route it straight to a soundtrack track so it isn't "lost"
      // (it lives in the Audio tab, not this grid).
      if (isAudio(f.name)) {
        addAudio(audioTrack(r.ref));
        audioCount++;
      } else if (isImage(f.name)) {
        imageRefs.push(r.ref);
      }
    }
    await refresh(proj);
    flash(
      `Imported ${ok}/${arr.length}` +
        (audioCount ? ` · ${audioCount} audio → Audio tab` : "") +
        (ok < arr.length ? " (some failed)" : ""),
    );
    // Multiple photos at once → offer to auto-arrange instead of adding each one by hand.
    if (imageRefs.length > 1) setBatch(imageRefs);
  };

  return (
    <div
      className={"assets-panel" + (dragging ? " dragging" : "")}
      onDragOver={(e) => { e.preventDefault(); if (!dragging) setDragging(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); importFiles(e.dataTransfer.files); }}
    >
      <div className="lib-hint">Drag files here to import, or click a tile to add it as a layer (video → video layer). Audio lands in the Audio tab.</div>
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

      {batch && (
        <div className="batch-arrange">
          <span>Arrange {batch.length} photos as:</span>
          <div className="batch-arrange-actions">
            <button
              className="lib-item"
              title="A staggered pile — polaroid framing, cascading in one after another"
              onClick={() => {
                addOverlays(buildPhotoStack(batch, compW));
                setBatch(null);
              }}
            >
              📚 Stack
            </button>
            <button
              className="lib-item"
              title="An even grid filling the frame, all appearing together"
              onClick={() => {
                addOverlays(buildPhotoGrid(batch, compW));
                setBatch(null);
              }}
            >
              ▦ Grid
            </button>
            <button className="lib-item" onClick={() => setBatch(null)}>
              Skip
            </button>
          </div>
        </div>
      )}

      <div className="asset-grid">
        {assets.map((a) => (
          <button key={a} className="asset-tile" title={a} onClick={() => addAsset(a)}>
            {isVideo(a) ? (
              <video className="asset-thumb" src={srcUrl(a)} muted preload="metadata" />
            ) : (
              <img className="asset-thumb" src={srcUrl(a)} alt="" loading="lazy" />
            )}
          </button>
        ))}
      </div>

      {dragging && <div className="drop-overlay">Drop to import</div>}
    </div>
  );
};
