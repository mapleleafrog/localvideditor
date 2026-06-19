import React from "react";
import type { Clip, Overlay } from "../src/timeline/schema";
import { MOTION_OPTIONS, TRANSITION_OPTIONS } from "./options";
import { ChipPicker, ColorField, NumberField, SelectField, TextField } from "./ui";

const DEFAULT_TRANSITION_FRAMES = 24;

export const ClipInspector: React.FC<{
  clip: Clip;
  isLast: boolean;
  onChange: (c: Clip) => void;
}> = ({ clip, isLast, onChange }) => {
  const set = (patch: Partial<Clip>) => onChange({ ...clip, ...patch } as Clip);
  const t = clip.transitionToNext;
  return (
    <div className="section">
      <h3>Clip</h3>
      <TextField label="src" value={clip.src} onChange={(src) => set({ src })} />
      <NumberField label="duration (f)" value={clip.durationInFrames} min={1} onChange={(v) => set({ durationInFrames: Math.max(1, Math.round(v)) })} />
      <SelectField label="motion" value={clip.motion ?? ""} options={MOTION_OPTIONS} noneLabel="— none —" onChange={(v) => set({ motion: v || undefined })} />

      {clip.type === "video" ? (
        <>
          <NumberField label="trim before" value={clip.trimBefore ?? 0} min={0} onChange={(v) => set({ trimBefore: v > 0 ? Math.round(v) : undefined })} />
          <NumberField label="trim after" value={clip.trimAfter ?? 0} min={0} onChange={(v) => set({ trimAfter: v > 0 ? Math.round(v) : undefined })} />
          <NumberField label="volume" value={clip.volume ?? 1} min={0} max={1} step={0.05} onChange={(v) => set({ volume: v })} />
        </>
      ) : null}

      {!isLast ? (
        <>
          <SelectField
            label="transition →"
            value={t?.id ?? ""}
            options={TRANSITION_OPTIONS}
            noneLabel="— cut —"
            onChange={(id) =>
              set({ transitionToNext: id ? { id, durationInFrames: t?.durationInFrames ?? DEFAULT_TRANSITION_FRAMES } : undefined })
            }
          />
          {t ? (
            <NumberField label="trans (f)" value={t.durationInFrames} min={1} onChange={(v) => set({ transitionToNext: { id: t.id, durationInFrames: Math.max(1, Math.round(v)) } })} />
          ) : null}
        </>
      ) : null}
    </div>
  );
};

export const OverlayInspector: React.FC<{ overlay: Overlay; onChange: (o: Overlay) => void }> = ({ overlay: o, onChange }) => {
  const set = (patch: Partial<Overlay>) => onChange({ ...o, ...patch } as Overlay);
  const toggleMotion = (id: string) =>
    set({ motions: o.motions.includes(id) ? o.motions.filter((m) => m !== id) : [...o.motions, id] });

  return (
    <div className="section">
      <h3>Overlay · {o.type}</h3>

      {o.type === "text" ? (
        <>
          <TextField label="text" value={o.text} onChange={(text) => set({ text })} />
          <NumberField label="font size" value={o.fontSize} min={1} onChange={(fontSize) => set({ fontSize })} />
          <ColorField label="color" value={o.color} onChange={(color) => set({ color })} />
          <TextField label="font" value={o.fontFamily} onChange={(fontFamily) => set({ fontFamily })} />
          <TextField label="glow" value={o.glow ?? ""} onChange={(v) => set({ glow: v || undefined })} />
        </>
      ) : (
        <>
          <TextField label="src" value={o.src} onChange={(src) => set({ src })} />
          <NumberField label="width" value={o.width} min={1} onChange={(width) => set({ width })} />
        </>
      )}

      <NumberField label="from (f)" value={o.from} min={0} onChange={(v) => set({ from: Math.max(0, Math.round(v)) })} />
      <NumberField label="duration (f)" value={o.durationInFrames} min={1} onChange={(v) => set({ durationInFrames: Math.max(1, Math.round(v)) })} />
      <NumberField label="x (%)" value={o.x} onChange={(x) => set({ x })} />
      <NumberField label="y (%)" value={o.y} onChange={(y) => set({ y })} />
      <NumberField label="scale" value={o.scale} step={0.1} onChange={(scale) => set({ scale })} />
      <NumberField label="rotation" value={o.rotation} onChange={(rotation) => set({ rotation })} />
      <NumberField label="opacity" value={o.opacity} min={0} max={1} step={0.05} onChange={(opacity) => set({ opacity })} />
      <NumberField label="depth z" value={o.z ?? 0} min={0} max={1} step={0.05} onChange={(v) => set({ z: v > 0 ? v : undefined })} />
      <NumberField label="loop window" value={o.windowInFrames ?? 0} min={0} onChange={(v) => set({ windowInFrames: v > 0 ? Math.round(v) : undefined })} />

      <h3 style={{ marginTop: 12 }}>Effects (stacked)</h3>
      <ChipPicker options={MOTION_OPTIONS} selected={o.motions} onToggle={toggleMotion} />
    </div>
  );
};
