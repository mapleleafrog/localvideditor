import React from "react";
import { useEditor } from "../store";
import type { Overlay } from "../../../src/timeline/schema";
import { readyMotions, readyTransitions } from "../lib/effects-bridge";

const IO_OPTS: [Overlay["enter"], string][] = [
  ["none", "none"],
  ["fade", "Fade"],
  ["slideLeft", "Slide from left"],
  ["slideRight", "Slide from right"],
  ["slideUp", "Slide from top"],
  ["slideDown", "Slide from bottom"],
  ["zoom", "Zoom"],
];

const MOTIONS = readyMotions().map((m) => ({ id: m.id, name: m.name, category: m.category }));
const TRANSITIONS = readyTransitions().map((t) => ({ id: t.id, name: t.name }));
const MOTION_CATS = Array.from(new Set(MOTIONS.map((m) => m.category)));

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="fld">
    <label>{label}</label>
    {children}
  </div>
);

const Slider: React.FC<{
  value: number; min: number; max: number; step: number; onChange: (n: number) => void; suffix?: string;
}> = ({ value, min, max, step, onChange, suffix }) => (
  <div className="sld">
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
    <input
      type="number" className="sld-num" min={min} max={max} step={step} value={value}
      onChange={(e) => onChange(+e.target.value)}
    />
    {suffix ? <span className="muted">{suffix}</span> : null}
  </div>
);

const MotionAdder: React.FC<{ onAdd: (id: string) => void }> = ({ onAdd }) => (
  <select
    value=""
    onChange={(e) => { if (e.target.value) onAdd(e.target.value); }}
  >
    <option value="">+ add effect…</option>
    {MOTION_CATS.map((cat) => (
      <optgroup key={cat} label={cat}>
        {MOTIONS.filter((m) => m.category === cat).map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </optgroup>
    ))}
  </select>
);

export const Inspector: React.FC = () => {
  const { project, selection, patchClip, patchOverlay, removeSelected } = useEditor();

  if (!selection) {
    return <div className="muted pad">Select a clip or layer to edit it.</div>;
  }

  if (selection.kind === "clip") {
    const c = project.clips[selection.index];
    if (!c) return <div className="muted pad">Clip gone.</div>;
    const i = selection.index;
    return (
      <div className="insp">
        <div className="insp-head">Clip {i + 1} <button className="del" onClick={removeSelected}>Delete</button></div>
        <Field label="Type">
          <select value={c.type} onChange={(e) => patchClip(i, { type: e.target.value as "image" | "video" })}>
            <option value="image">image</option>
            <option value="video">video</option>
          </select>
        </Field>
        <Field label="Source"><input value={c.src} onChange={(e) => patchClip(i, { src: e.target.value })} placeholder="clip-a.svg or media/x.jpg" /></Field>
        <Field label="Duration (frames)"><input type="number" min={1} value={c.durationInFrames} onChange={(e) => patchClip(i, { durationInFrames: Math.max(1, +e.target.value) })} /></Field>
        <Field label="Motion">
          <select value={c.motion} onChange={(e) => patchClip(i, { motion: e.target.value })}>
            <option value="none">none</option>
            {MOTION_CATS.map((cat) => (
              <optgroup key={cat} label={cat}>
                {MOTIONS.filter((m) => m.category === cat).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field label="Transition →next">
          <select value={c.transitionToNext} onChange={(e) => patchClip(i, { transitionToNext: e.target.value })}>
            <option value="none">none</option>
            {TRANSITIONS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        {c.transitionToNext !== "none" && (
          <Field label="Transition (frames)"><input type="number" min={1} value={c.transitionDurationInFrames} onChange={(e) => patchClip(i, { transitionDurationInFrames: Math.max(1, +e.target.value) })} /></Field>
        )}
        {c.type === "video" && (
          <>
            <Field label="Trim before"><input type="number" min={0} value={c.trimBefore} onChange={(e) => patchClip(i, { trimBefore: Math.max(0, +e.target.value) })} /></Field>
            <Field label="Trim after"><input type="number" min={0} value={c.trimAfter} onChange={(e) => patchClip(i, { trimAfter: Math.max(0, +e.target.value) })} /></Field>
            <Field label="Volume"><Slider value={c.volume} min={0} max={1} step={0.05} onChange={(v) => patchClip(i, { volume: v })} /></Field>
          </>
        )}
      </div>
    );
  }

  const o = project.overlays[selection.index];
  if (!o) return <div className="muted pad">Layer gone.</div>;
  const i = selection.index;
  return (
    <div className="insp">
      <div className="insp-head">{o.type === "text" ? "Text" : o.type === "image" ? "Image" : "FX"} layer <button className="del" onClick={removeSelected}>Delete</button></div>
      <Field label="Type">
        <select value={o.type} onChange={(e) => patchOverlay(i, { type: e.target.value as "text" | "image" | "fx" })}>
          <option value="text">text</option>
          <option value="image">image</option>
          <option value="fx">fx (full-frame)</option>
        </select>
      </Field>
      {o.type === "text" && (
        <>
          <Field label="Text"><input value={o.text} onChange={(e) => patchOverlay(i, { text: e.target.value })} /></Field>
          <Field label="Font size"><input type="number" min={8} value={o.fontSize} onChange={(e) => patchOverlay(i, { fontSize: +e.target.value })} /></Field>
          <Field label="Color"><input type="color" value={o.color} onChange={(e) => patchOverlay(i, { color: e.target.value })} /></Field>
          <Field label="Glow (CSS shadow)"><input value={o.glow} onChange={(e) => patchOverlay(i, { glow: e.target.value })} placeholder="0 0 18px #ff2e88" /></Field>
        </>
      )}
      {o.type === "image" && (
        <>
          <Field label="Source"><input value={o.src} onChange={(e) => patchOverlay(i, { src: e.target.value })} /></Field>
          <Field label="Width (px)"><input type="number" min={1} value={o.width} onChange={(e) => patchOverlay(i, { width: +e.target.value })} /></Field>
        </>
      )}
      {o.type === "fx" && (
        <div className="muted" style={{ fontSize: 11 }}>
          Full-frame effect layer — fills the frame and renders on top of the clips. Stack motions below
          (petals, bokeh, light-leaks, scanlines…). Alpha-exports cleanly for compositing.
        </div>
      )}
      <div className="insp-sub">Timing</div>
      <Field label="Start (frame)"><input type="number" min={0} value={o.from} onChange={(e) => patchOverlay(i, { from: Math.max(0, +e.target.value) })} /></Field>
      <Field label="Duration (frames)"><input type="number" min={1} value={o.durationInFrames} onChange={(e) => patchOverlay(i, { durationInFrames: Math.max(1, +e.target.value) })} /></Field>

      <div className="insp-sub">Transitions</div>
      <Field label="Enter">
        <select value={o.enter ?? "none"} onChange={(e) => patchOverlay(i, { enter: e.target.value as Overlay["enter"] })}>
          {IO_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Field>
      {(o.enter ?? "none") !== "none" && (
        <Field label="Enter length (frames)"><input type="number" min={1} value={o.enterDurationInFrames ?? 15} onChange={(e) => patchOverlay(i, { enterDurationInFrames: Math.max(1, +e.target.value) })} /></Field>
      )}
      <Field label="Exit">
        <select value={o.exit ?? "none"} onChange={(e) => patchOverlay(i, { exit: e.target.value as Overlay["exit"] })}>
          {IO_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Field>
      {(o.exit ?? "none") !== "none" && (
        <Field label="Exit length (frames)"><input type="number" min={1} value={o.exitDurationInFrames ?? 15} onChange={(e) => patchOverlay(i, { exitDurationInFrames: Math.max(1, +e.target.value) })} /></Field>
      )}

      <div className="insp-sub">{o.type === "fx" ? "Layer" : "Transform"}</div>
      {o.type !== "fx" && (
        <>
          <Field label="X (%)"><Slider value={o.x} min={-20} max={120} step={0.5} onChange={(v) => patchOverlay(i, { x: v })} /></Field>
          <Field label="Y (%)"><Slider value={o.y} min={-20} max={120} step={0.5} onChange={(v) => patchOverlay(i, { y: v })} /></Field>
          <Field label="Scale"><Slider value={o.scale} min={0.1} max={4} step={0.05} onChange={(v) => patchOverlay(i, { scale: v })} /></Field>
          <Field label="Rotation"><Slider value={o.rotation} min={-180} max={180} step={1} onChange={(v) => patchOverlay(i, { rotation: v })} suffix="°" /></Field>
        </>
      )}
      <Field label="Opacity"><Slider value={o.opacity} min={0} max={1} step={0.05} onChange={(v) => patchOverlay(i, { opacity: v })} /></Field>
      {o.type !== "fx" && (
        <Field label="Depth z"><Slider value={o.z} min={0} max={1} step={0.05} onChange={(v) => patchOverlay(i, { z: v })} /></Field>
      )}
      <div className="insp-sub">Effects (stacked)</div>
      <div className="chips">
        {o.motions.map((m, mi) => (
          <span key={mi} className="chip">
            {m}
            <button onClick={() => patchOverlay(i, { motions: o.motions.filter((_, k) => k !== mi) })}>×</button>
          </span>
        ))}
        {o.motions.length === 0 && <span className="muted">no effects</span>}
      </div>
      <MotionAdder onAdd={(id) => patchOverlay(i, { motions: [...o.motions, id] })} />
    </div>
  );
};
