import React, { useState } from "react";
import { useEditor } from "../store";
import type { Overlay, MotionParam } from "../../../src/timeline/schema";
import { readyMotions, readyTransitions } from "../lib/effects-bridge";
import { FONT_OPTIONS } from "../../../src/timeline/fonts";
import { useFxPrefs } from "../lib/fx-prefs";
import { respondsToStrength } from "../lib/strength";

const IO_OPTS: [Overlay["enter"], string][] = [
  ["none", "none"],
  ["fade", "Fade"],
  ["slideLeft", "Slide from left"],
  ["slideRight", "Slide from right"],
  ["slideUp", "Slide from top"],
  ["slideDown", "Slide from bottom"],
  ["zoom", "Zoom"],
  ["pop", "Pop / bounce"],
  ["rotateIn", "Rotate in"],
  ["spin", "Spin in"],
  ["blurIn", "Blur in"],
  ["flash", "Flash"],
  ["wipe", "Wipe (reveal)"],
  ["iris", "Iris / circle"],
  ["typewriter", "Typewriter (text)"],
];

const TEXT_ANIM_OPTS: [string, string][] = [
  ["none", "None (static)"],
  ["charFadeUp", "Char fade-up"],
  ["charBlurReveal", "Char blur reveal"],
  ["typewriterChar", "Typewriter (per char)"],
  ["wordHighlight", "Word highlight"],
];

const MOTIONS = readyMotions().map((m) => ({ id: m.id, name: m.name, category: m.category }));
const TRANSITIONS = readyTransitions().map((t) => ({ id: t.id, name: t.name }));
const MOTION_CATS = Array.from(new Set(MOTIONS.map((m) => m.category)));

const EASING_OPTS: [string, string][] = [
  ["linear", "Linear"],
  ["easeIn", "Ease in"],
  ["easeOut", "Ease out"],
  ["easeInOut", "Ease in-out"],
  ["easeOutIn", "Ease out-in"],
];
const EasingSelect: React.FC<{ value?: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
  <select value={value ?? "linear"} onChange={(e) => onChange(e.target.value)}>
    {EASING_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
  </select>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="fld">
    <label>{label}</label>
    {children}
  </div>
);

const Slider: React.FC<{
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
const Section: React.FC<{ title: string; defaultOpen?: boolean; badge?: number; children: React.ReactNode }> = ({
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
  const { project, selection, patchClip, patchOverlay, removeSelected, openBrowser } = useEditor();
  const { pushRecent: pushRecentMotion } = useFxPrefs("motion");
  const { pushRecent: pushRecentTransition } = useFxPrefs("transition");

  if (!selection) {
    return <div className="muted pad">Select a clip or layer to edit it.</div>;
  }

  const maxDur = project.durationInFrames && project.durationInFrames > 0 ? project.durationInFrames : Infinity;

  // Per-effect param helpers (motionParams is index-aligned with motions).
  const setMotionParam = (oi: number, mi: number, patch: Partial<MotionParam>) => {
    const ov = project.overlays[oi];
    const params: MotionParam[] = (ov.motionParams ?? []).slice();
    while (params.length < ov.motions.length) params.push({});
    params[mi] = { ...params[mi], ...patch };
    patchOverlay(oi, { motionParams: params });
  };
  const removeEffect = (oi: number, mi: number) => {
    const ov = project.overlays[oi];
    const params = (ov.motionParams ?? []).filter((_, k) => k !== mi);
    patchOverlay(oi, { motions: ov.motions.filter((_, k) => k !== mi), motionParams: params.length ? params : undefined });
  };

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
        <Field label="Duration (frames)"><input type="number" min={1} max={Number.isFinite(maxDur) ? maxDur : undefined} value={c.durationInFrames} onChange={(e) => patchClip(i, { durationInFrames: Math.min(maxDur, Math.max(1, +e.target.value)) })} /></Field>
        <Field label="Flip horizontal">
          <input type="checkbox" checked={!!c.flipX} onChange={(e) => patchClip(i, { flipX: e.target.checked })} />
        </Field>
        <Field label="Flip vertical">
          <input type="checkbox" checked={!!c.flipY} onChange={(e) => patchClip(i, { flipY: e.target.checked })} />
        </Field>

        <Section title="Motion" defaultOpen={c.motion !== "none"}>
          <Field label="Motion">
            <select
              value={c.motion}
              onChange={(e) => {
                patchClip(i, { motion: e.target.value });
                if (e.target.value !== "none") pushRecentMotion(e.target.value);
              }}
            >
              <option value="none">none</option>
              {MOTION_CATS.map((cat) => (
                <optgroup key={cat} label={cat}>
                  {MOTIONS.filter((m) => m.category === cat).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </optgroup>
              ))}
            </select>
          </Field>
          <button onClick={() => openBrowser({ mode: "clip-motion", index: i })}>Browse…</button>
          {c.motion !== "none" && (() => {
            const responds = respondsToStrength(c.motion);
            return (
              <Field label="Effect strength">
                <Slider value={c.strength ?? 1} min={0} max={2} step={0.05} disabled={!responds} onChange={(v) => patchClip(i, { strength: v })} />
                {!responds && <span className="muted" style={{ fontSize: 11 }}>no intensity for this effect</span>}
              </Field>
            );
          })()}
        </Section>

        <Section title="Transition →next" defaultOpen={c.transitionToNext !== "none"}>
          <Field label="Transition">
            <select
              value={c.transitionToNext}
              onChange={(e) => {
                patchClip(i, { transitionToNext: e.target.value });
                if (e.target.value !== "none") pushRecentTransition(e.target.value);
              }}
            >
              <option value="none">none</option>
              {TRANSITIONS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <button onClick={() => openBrowser({ mode: "clip-transition", index: i })}>Browse…</button>
          {c.transitionToNext !== "none" && (
            <>
              <Field label="Transition (frames)"><input type="number" min={1} value={c.transitionDurationInFrames} onChange={(e) => patchClip(i, { transitionDurationInFrames: Math.max(1, +e.target.value) })} /></Field>
              <Field label="Transition easing"><EasingSelect value={c.transitionEasing} onChange={(v) => patchClip(i, { transitionEasing: v as typeof c.transitionEasing })} /></Field>
            </>
          )}
        </Section>

        {c.type === "video" && (
          <Section title="Video" defaultOpen={false}>
            <Field label="Trim before"><input type="number" min={0} value={c.trimBefore} onChange={(e) => patchClip(i, { trimBefore: Math.max(0, +e.target.value) })} /></Field>
            <Field label="Trim after"><input type="number" min={0} value={c.trimAfter} onChange={(e) => patchClip(i, { trimAfter: Math.max(0, +e.target.value) })} /></Field>
            <Field label="Volume"><Slider value={c.volume} min={0} max={1} step={0.05} onChange={(v) => patchClip(i, { volume: v })} /></Field>
          </Section>
        )}
      </div>
    );
  }

  const o = project.overlays[selection.index];
  if (!o) return <div className="muted pad">Layer gone.</div>;
  const i = selection.index;
  return (
    <div className="insp">
      <div className="insp-head">{o.type === "text" ? "Text" : o.type === "image" ? "Image" : o.type === "video" ? "Video" : "FX"} layer <button className="del" onClick={removeSelected}>Delete</button></div>
      <Field label="Type">
        <select value={o.type} onChange={(e) => patchOverlay(i, { type: e.target.value as Overlay["type"] })}>
          <option value="text">text</option>
          <option value="image">image</option>
          <option value="video">video</option>
          <option value="fx">fx (full-frame)</option>
        </select>
      </Field>
      {o.type === "text" && (
        <>
          <Field label="Text"><input value={o.text} onChange={(e) => patchOverlay(i, { text: e.target.value })} /></Field>
          <Field label="Font size"><input type="number" min={8} value={o.fontSize} onChange={(e) => patchOverlay(i, { fontSize: +e.target.value })} /></Field>
          <Field label="Font">
            <select value={o.fontFamily ?? "default"} onChange={(e) => patchOverlay(i, { fontFamily: e.target.value as Overlay["fontFamily"] })}>
              {FONT_OPTIONS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </Field>
          <Field label="Color"><input type="color" value={o.color} onChange={(e) => patchOverlay(i, { color: e.target.value })} /></Field>
          <Field label="Glow (CSS shadow)"><input value={o.glow} onChange={(e) => patchOverlay(i, { glow: e.target.value })} placeholder="0 0 18px #ff2e88" /></Field>
          <Field label="Text animation">
            <select value={o.textAnimation ?? "none"} onChange={(e) => patchOverlay(i, { textAnimation: e.target.value as Overlay["textAnimation"] })}>
              {TEXT_ANIM_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          {(o.textAnimation ?? "none") !== "none" && (
            <Field label="Stagger (frames)"><input type="number" min={0} step={1} value={o.textAnimationStagger ?? 3} onChange={(e) => patchOverlay(i, { textAnimationStagger: Math.max(0, Math.round(+e.target.value)) })} /></Field>
          )}
        </>
      )}
      {(o.type === "image" || o.type === "video") && (
        <>
          <Field label="Source"><input value={o.src} onChange={(e) => patchOverlay(i, { src: e.target.value })} placeholder="media/<project>/clip.mp4" /></Field>
          <Field label="Width (px)"><input type="number" min={1} value={o.width} onChange={(e) => patchOverlay(i, { width: +e.target.value })} /></Field>
          {o.type === "image" && (
            <Field label="Pixelated (crisp pixel-art; off = smoother motion)">
              <input type="checkbox" checked={!!o.pixelated} onChange={(e) => patchOverlay(i, { pixelated: e.target.checked })} />
            </Field>
          )}
        </>
      )}
      {o.type === "fx" && (
        <div className="muted" style={{ fontSize: 11 }}>
          Full-frame effect layer — fills the frame and renders on top of the clips. Stack motions below
          (petals, bokeh, light-leaks, scanlines…). Alpha-exports cleanly for compositing.
        </div>
      )}
      <Field label="Start (frame)"><input type="number" min={0} value={o.from} onChange={(e) => patchOverlay(i, { from: Math.max(0, +e.target.value) })} /></Field>
      <Field label="Duration (frames)"><input type="number" min={1} max={Number.isFinite(maxDur) ? maxDur : undefined} value={o.durationInFrames} onChange={(e) => patchOverlay(i, { durationInFrames: Math.min(maxDur, Math.max(1, +e.target.value)) })} /></Field>

      <Section title="Transitions" defaultOpen={(o.enter ?? "none") !== "none" || (o.exit ?? "none") !== "none"}>
        <Field label="Enter">
          <select value={o.enter ?? "none"} onChange={(e) => patchOverlay(i, { enter: e.target.value as Overlay["enter"] })}>
            {IO_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        {(o.enter ?? "none") !== "none" && (
          <>
            <Field label="Enter length (frames)"><input type="number" min={1} value={o.enterDurationInFrames ?? 15} onChange={(e) => patchOverlay(i, { enterDurationInFrames: Math.max(1, +e.target.value) })} /></Field>
            <Field label="Enter easing"><EasingSelect value={o.enterEasing} onChange={(v) => patchOverlay(i, { enterEasing: v as Overlay["enterEasing"] })} /></Field>
          </>
        )}
        <Field label="Exit">
          <select value={o.exit ?? "none"} onChange={(e) => patchOverlay(i, { exit: e.target.value as Overlay["exit"] })}>
            {IO_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        {(o.exit ?? "none") !== "none" && (
          <>
            <Field label="Exit length (frames)"><input type="number" min={1} value={o.exitDurationInFrames ?? 15} onChange={(e) => patchOverlay(i, { exitDurationInFrames: Math.max(1, +e.target.value) })} /></Field>
            <Field label="Exit easing"><EasingSelect value={o.exitEasing} onChange={(v) => patchOverlay(i, { exitEasing: v as Overlay["exitEasing"] })} /></Field>
          </>
        )}
      </Section>

      <Section title={o.type === "fx" ? "Layer" : "Transform"} defaultOpen>
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
        <Field label="Flip horizontal">
          <input type="checkbox" checked={!!o.flipX} onChange={(e) => patchOverlay(i, { flipX: e.target.checked })} />
        </Field>
        <Field label="Flip vertical">
          <input type="checkbox" checked={!!o.flipY} onChange={(e) => patchOverlay(i, { flipY: e.target.checked })} />
        </Field>
        {/* Note (not fixed here — pre-existing render-engine quirk): scaleStrength lerps opacity
            toward 1, so additive low-opacity fx (beatFlash/grainLoop/crtScanlines) go fully opaque
            at strength 0 instead of vanishing. See src/effects/compose.ts scaleStrength. */}
        <Field label="Strength (all effects)">
          <Slider value={o.strength ?? 1} min={0} max={2} step={0.05} onChange={(v) => patchOverlay(i, { strength: v })} />
        </Field>
      </Section>

      <Section title="Effects (stacked)" defaultOpen={o.motions.length > 0} badge={o.motions.length || undefined}>
        {o.motions.length === 0 && <span className="muted">no effects</span>}
        {o.motions.map((m, mi) => {
          const p = o.motionParams?.[mi] ?? {};
          const responds = respondsToStrength(m);
          // An unset per-effect strength falls back to the layer-wide strength (see Layer.tsx's
          // per-effect composition: `p?.strength ?? strength`) — show that inherited value here
          // too, or the slider would contradict the layer-wide one (e.g. layer at 0.5 but every
          // effect still reads 1.0).
          return (
            <div className="fx-item" key={mi}>
              <div className="fx-item-head">
                <span className="fx-name" title={m}>{m}</span>
                <button className="del" title="Remove effect" onClick={() => removeEffect(i, mi)}>×</button>
              </div>
              <Field label="Strength">
                <Slider
                  value={p.strength ?? o.strength ?? 1}
                  min={0} max={2} step={0.05}
                  disabled={!responds}
                  onChange={(v) => setMotionParam(i, mi, { strength: v })}
                />
                {!responds && <span className="muted" style={{ fontSize: 11 }}>no intensity for this effect</span>}
              </Field>
              <Field label="Easing"><EasingSelect value={p.easing} onChange={(v) => setMotionParam(i, mi, { easing: v as MotionParam["easing"] })} /></Field>
              <Field label="Loop"><input type="checkbox" checked={!!p.loop} onChange={(e) => setMotionParam(i, mi, { loop: e.target.checked })} /></Field>
            </div>
          );
        })}
        <div className="fx-add-row">
          <MotionAdder
            onAdd={(id) => {
              patchOverlay(i, { motions: [...o.motions, id] });
              pushRecentMotion(id);
            }}
          />
          <button onClick={() => openBrowser({ mode: "overlay-add", index: i })}>Browse…</button>
        </div>
      </Section>
    </div>
  );
};
