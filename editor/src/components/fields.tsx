// Shared inspector field primitives.
//
// Field / Slider / Section / EasingSelect were MOVED BYTE-FOR-BYTE out of Inspector.tsx (they are
// reproduced here unchanged, not rewritten) so the overlay inspector, the clip inspector and the
// wall-item inspector all render the same controls. `Section`'s controlled-<details> behaviour is
// deliberate: a bare `open` prop would let re-renders while typing fight the user's manual
// expand/collapse.
//
// <EffectStack> is the overlay "Effects (stacked)" section extracted whole, so overlay, clip-motion
// and wall-item stacks share ONE implementation of the per-effect strength/easing/loop model.
import React, { useState } from "react";
import type { MotionParam } from "../../../src/timeline/schema";
import { readyMotions } from "../lib/effects-bridge";
import { useFxPrefs } from "../lib/fx-prefs";
import { respondsToStrength } from "../lib/strength";

export const MOTIONS = readyMotions().map((m) => ({ id: m.id, name: m.name, category: m.category }));
export const MOTION_CATS = Array.from(new Set(MOTIONS.map((m) => m.category)));

const EASING_OPTS: [string, string][] = [
  ["linear", "Linear"],
  ["easeIn", "Ease in"],
  ["easeOut", "Ease out"],
  ["easeInOut", "Ease in-out"],
  ["easeOutIn", "Ease out-in"],
];
export const EasingSelect: React.FC<{ value?: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
  <select value={value ?? "linear"} onChange={(e) => onChange(e.target.value)}>
    {EASING_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
  </select>
);

export const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="fld">
    <label>{label}</label>
    {children}
  </div>
);

export const Slider: React.FC<{
  value: number; min: number; max: number; step: number; onChange: (n: number) => void; suffix?: string; disabled?: boolean;
}> = ({ value, min, max, step, onChange, suffix, disabled }) => (
  <div className={"sld" + (disabled ? " sld-disabled" : "")}>
    <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(+e.target.value)} />
    <input
      type="number" className="sld-num" min={min} max={max} step={step} value={value} disabled={disabled}
      onChange={(e) => onChange(+e.target.value)}
    />
    {suffix ? <span className="muted">{suffix}</span> : null}
  </div>
);

/** Collapsible group — cuts down the constant scrolling on layers with lots of props/effects.
 *  State is a controlled <details> (not a bare `open` prop) so re-renders while editing a field
 *  don't fight the user's manual expand/collapse. */
export const Section: React.FC<{ title: string; defaultOpen?: boolean; badge?: number; children: React.ReactNode }> = ({
  title,
  defaultOpen = true,
  badge,
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details className="insp-section" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="insp-sub">
        {title}
        {!!badge && <span className="insp-badge">{badge}</span>}
      </summary>
      <div className="insp-section-body">{children}</div>
    </details>
  );
};

export const MotionAdder: React.FC<{ onAdd: (id: string) => void }> = ({ onAdd }) => (
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

/**
 * The stacked-effects editor, shared by every host that owns a `motions` + `motionParams` pair
 * (overlays today, wall items next). The host owns the patch: `onChange` always receives BOTH
 * arrays so one call is one immutable rebuild = one undo step.
 *
 * `fallbackStrength` is the host's layer-wide strength: an unset per-effect strength inherits it at
 * render time (Layer.tsx composes `p?.strength ?? strength`), so the slider must show the inherited
 * value rather than a hardcoded 1.0.
 */
export const EffectStack: React.FC<{
  motions: string[];
  motionParams?: MotionParam[];
  fallbackStrength?: number;
  onChange: (patch: { motions: string[]; motionParams: MotionParam[] | undefined }) => void;
  onBrowse: () => void;
}> = ({ motions, motionParams, fallbackStrength, onChange, onBrowse }) => {
  const { pushRecent } = useFxPrefs("motion");

  // Per-effect param helpers (motionParams is index-aligned with motions).
  const setMotionParam = (mi: number, patch: Partial<MotionParam>) => {
    const params: MotionParam[] = (motionParams ?? []).slice();
    while (params.length < motions.length) params.push({});
    params[mi] = { ...params[mi], ...patch };
    onChange({ motions, motionParams: params });
  };
  const removeEffect = (mi: number) => {
    const params = (motionParams ?? []).filter((_, k) => k !== mi);
    onChange({ motions: motions.filter((_, k) => k !== mi), motionParams: params.length ? params : undefined });
  };

  return (
    <Section title="Effects (stacked)" defaultOpen={motions.length > 0} badge={motions.length || undefined}>
      {motions.length === 0 && <span className="muted">no effects</span>}
      {motions.map((m, mi) => {
        const p = motionParams?.[mi] ?? {};
        const responds = respondsToStrength(m);
        // An unset per-effect strength falls back to the layer-wide strength (see Layer.tsx's
        // per-effect composition: `p?.strength ?? strength`) — show that inherited value here
        // too, or the slider would contradict the layer-wide one (e.g. layer at 0.5 but every
        // effect still reads 1.0).
        return (
          <div className="fx-item" key={mi}>
            <div className="fx-item-head">
              <span className="fx-name" title={m}>{m}</span>
              <button className="del" title="Remove effect" onClick={() => removeEffect(mi)}>×</button>
            </div>
            <Field label="Strength">
              <Slider
                value={p.strength ?? fallbackStrength ?? 1}
                min={0} max={2} step={0.05}
                disabled={!responds}
                onChange={(v) => setMotionParam(mi, { strength: v })}
              />
              {!responds && <span className="muted" style={{ fontSize: 11 }}>no intensity for this effect</span>}
            </Field>
            <Field label="Easing"><EasingSelect value={p.easing} onChange={(v) => setMotionParam(mi, { easing: v as MotionParam["easing"] })} /></Field>
            <Field label="Loop"><input type="checkbox" checked={!!p.loop} onChange={(e) => setMotionParam(mi, { loop: e.target.checked })} /></Field>
          </div>
        );
      })}
      <div className="fx-add-row">
        <MotionAdder
          onAdd={(id) => {
            onChange({ motions: [...motions, id], motionParams });
            pushRecent(id);
          }}
        />
        <button onClick={onBrowse}>Browse…</button>
      </div>
    </Section>
  );
};
