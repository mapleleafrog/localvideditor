import React from "react";
import { useEditor } from "../store";

// Common output sizes — width/height flow straight to the Player + the render.
const PRESETS: { label: string; w: number; h: number }[] = [
  { label: "1920×1080 · 16:9 landscape (1080p)", w: 1920, h: 1080 },
  { label: "1080×1920 · 9:16 vertical (Reels/TikTok)", w: 1080, h: 1920 },
  { label: "1080×1080 · 1:1 square", w: 1080, h: 1080 },
  { label: "1080×1350 · 4:5 portrait (Instagram)", w: 1080, h: 1350 },
  { label: "1280×720 · 16:9 (720p)", w: 1280, h: 720 },
  { label: "3840×2160 · 16:9 (4K UHD)", w: 3840, h: 2160 },
];

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/** Output resolution + frame-rate editor (Library "Canvas" tab). Both the live preview and the
 *  render read project.width/height/fps, so changes here take effect everywhere immediately. */
export const CanvasPanel: React.FC = () => {
  const project = useEditor((s) => s.project);
  const patchProject = useEditor((s) => s.patchProject);

  const w = project.width ?? 1920;
  const h = project.height ?? 1080;
  const fps = project.fps ?? 30;
  const dur = project.durationInFrames ?? 0;
  const g = gcd(w, h) || 1;
  const presetIdx = PRESETS.findIndex((p) => p.w === w && p.h === h);

  const setSize = (nw: number, nh: number) =>
    patchProject({ width: Math.max(1, Math.round(nw || 1)), height: Math.max(1, Math.round(nh || 1)) });

  return (
    <div className="canvas-panel">
      <div className="lib-cat">Output resolution</div>
      <div className="lib-hint">The video&apos;s pixel size — preview and render both follow it.</div>

      <div className="fld">
        <label>Preset</label>
        <select
          value={presetIdx}
          onChange={(e) => {
            const p = PRESETS[+e.target.value];
            if (p) setSize(p.w, p.h);
          }}
        >
          {presetIdx === -1 && (
            <option value={-1}>
              Custom ({w}×{h})
            </option>
          )}
          {PRESETS.map((p, i) => (
            <option key={i} value={i}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="fld">
        <label>Width (px)</label>
        <input type="number" min={1} value={w} onChange={(e) => setSize(+e.target.value, h)} />
      </div>
      <div className="fld">
        <label>Height (px)</label>
        <input type="number" min={1} value={h} onChange={(e) => setSize(w, +e.target.value)} />
      </div>

      <button className="lib-item canvas-swap" onClick={() => setSize(h, w)} title="Rotate orientation">
        ⇅ Swap width / height
      </button>
      <div className="lib-hint" style={{ marginTop: 6 }}>
        Aspect ratio {w / g}:{h / g}
      </div>

      <div className="lib-cat">Frame rate</div>
      <div className="fld">
        <label>FPS</label>
        <input
          type="number"
          min={1}
          max={120}
          value={fps}
          onChange={(e) => patchProject({ fps: Math.max(1, Math.round(+e.target.value || 1)) })}
        />
      </div>
      <div className="lib-hint">Clip/overlay lengths are stored in frames, so changing FPS changes their real-time duration.</div>

      <div className="lib-cat">Project duration</div>
      <div className="lib-hint">Fixed video length. 0 = auto (fit clips/overlays/song). When set, it caps the length and the max a clip can be extended to.</div>
      <div className="fld">
        <label>Duration (frames)</label>
        <input
          type="number"
          min={0}
          value={dur}
          onChange={(e) => patchProject({ durationInFrames: Math.max(0, Math.round(+e.target.value || 0)) })}
        />
        <span className="muted">{dur > 0 ? `${(dur / fps).toFixed(2)}s` : "auto"}</span>
      </div>
    </div>
  );
};
