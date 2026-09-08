import React from "react";
import { useEditor } from "../store";
import type { Clip, Overlay } from "../../../src/timeline/schema";
import { readyTransitions } from "../lib/effects-bridge";
import { FONT_OPTIONS } from "../../../src/timeline/fonts";
import { useFxPrefs } from "../lib/fx-prefs";
import { respondsToStrength } from "../lib/strength";
// Field / Slider / Section / EasingSelect (+ the shared EffectStack) live in fields.tsx so the
// overlay, clip and wall inspectors render the same controls from one implementation.
import { EasingSelect, EffectStack, Field, MOTIONS, MOTION_CATS, Section, Slider } from "./fields";
import { DEFAULT_WALL, cloneWall, fitDurationPatch, wallFitFor, wallOf, wallSummary } from "../lib/wall-edit";

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

const TRANSITIONS = readyTransitions().map((t) => ({ id: t.id, name: t.name }));

export const Inspector: React.FC = () => {
  const { project, selection, patchClip, patchOverlay, removeSelected, openBrowser, setView, setWallClip } =
    useEditor();
  const { pushRecent: pushRecentMotion } = useFxPrefs("motion");
  const { pushRecent: pushRecentTransition } = useFxPrefs("transition");

  if (!selection) {
    return <div className="muted pad">Select a clip or layer to edit it.</div>;
  }

  const maxDur = project.durationInFrames && project.durationInFrames > 0 ? project.durationInFrames : Infinity;

  // Explicit, and BEFORE the clip branch: the selection union has three members now, so the
  // overlay fallthrough at the bottom must never receive a wall item (that would patch an
  // unrelated overlay at the same index). Wall items are edited in the Wall view's inspector.
  if (selection.kind === "wallItem") {
    return <div className="muted pad">Wall item — switch to the Wall view to edit it.</div>;
  }

  if (selection.kind === "clip") {
    const c = project.clips[selection.index];
    if (!c) return <div className="muted pad">Clip gone.</div>;
    const i = selection.index;
    // A wall clip is authored in the Wall view: its content is the wall payload (items + camera
    // scenes), not a `src`, and its camera IS its motion.
    const isWall = c.type === "wall";
    const wall = isWall ? wallOf(c) : null;
    const fit = isWall ? wallFitFor(project, i) : null;
    const summary = wall ? wallSummary(wall, project.fps ?? 30, project.width ?? 1920, project.height ?? 1080) : null;
    /** The one shared "fit the clip to the camera schedule" patch (it applies the project's fixed
     *  duration as a cap) — the Scenes strip, the Storyboard card and the context menu call it too. */
    const fitWall = (k: number) => {
      const p = fitDurationPatch(useEditor.getState().project, k);
      if (p) patchClip(k, p);
    };
    const openWall = () => {
      setWallClip(i);
      setView("wall");
    };
    return (
      <div className="insp">
        <div className="insp-head">Clip {i + 1} <button className="del" onClick={removeSelected}>Delete</button></div>
        <Field label="Type">
          {/* `as Clip["type"]` with an <option> per member: a clip whose type has no matching
              option renders a BLANK select whose first touch silently rewrites it — which would
              destroy a wall clip's payload. */}
          <select
            value={c.type}
            onChange={(e) => {
              const t = e.target.value as Clip["type"];
              // Switching TO wall seeds a complete payload in the SAME patch (one undo step) —
              // zod defaults never run on the <Player inputProps> path, so a bare type change
              // would leave the clip with no wall at all.
              patchClip(i, t === "wall" ? { type: t, wall: c.wall ?? cloneWall(DEFAULT_WALL) } : { type: t });
            }}
          >
            <option value="image">image</option>
            <option value="video">video</option>
            <option value="wall">wall</option>
          </select>
        </Field>
        {/* A wall clip has no media element — its content is the wall payload. Showing an editable
            `src` here would invite typing a path that nothing reads. */}
        {!isWall && (
          <Field label="Source"><input value={c.src} onChange={(e) => patchClip(i, { src: e.target.value })} placeholder="clip-a.svg or media/x.jpg" /></Field>
        )}
        <Field label="Duration (frames)">
          <input type="number" min={1} max={Number.isFinite(maxDur) ? maxDur : undefined} value={c.durationInFrames} onChange={(e) => patchClip(i, { durationInFrames: Math.min(maxDur, Math.max(1, +e.target.value)) })} />
          {/* Manual, never automatic: an auto-refit would fold into the same 600ms undo step and
              fight the block's right-drag handle. */}
          {fit && (
            <>
              <button
                title="Set the clip length to exactly what the camera schedule needs"
                disabled={fit.state === "fit"}
                onClick={() => fitWall(i)}
              >
                ⟲ Fit to scenes ({fit.need}f)
              </button>
              <span className={"wall-fit " + fit.state} title={fit.label}>{fit.label}</span>
            </>
          )}
        </Field>
        {/* A wall has no media element to mirror, and mirroring the page would mirror the
            handwriting — disabled rather than hidden, so the menu/field shape stays constant. */}
        <Field label="Flip horizontal">
          <input
            type="checkbox"
            checked={!isWall && !!c.flipX}
            disabled={isWall}
            title={isWall ? "A wall has no media element to mirror" : undefined}
            onChange={(e) => patchClip(i, { flipX: e.target.checked || undefined })}
          />
          {isWall && <span className="muted" style={{ fontSize: 11 }}>no media element to mirror</span>}
        </Field>
        <Field label="Flip vertical">
          <input
            type="checkbox"
            checked={!isWall && !!c.flipY}
            disabled={isWall}
            title={isWall ? "A wall has no media element to mirror" : undefined}
            onChange={(e) => patchClip(i, { flipY: e.target.checked || undefined })}
          />
        </Field>

        {isWall && wall && summary && (
          <Section title="Wall" defaultOpen>
            <div className="muted" style={{ fontSize: 11 }}>{summary.text}</div>
            {fit && <div className={"wall-fit " + fit.state}>{fit.label}</div>}
            <div className="wall-insp-actions">
              <button onClick={openWall} title="Arrange the wall and set camera scenes">Edit wall…</button>
              <button
                disabled={!fit || fit.state === "fit"}
                onClick={() => fitWall(i)}
                title="Set the clip length to exactly what the camera schedule needs"
              >
                ⟲ Fit duration to scenes
              </button>
            </div>
          </Section>
        )}

        {/* HIDDEN, not disabled, for a wall clip: a clip motion is a second camera, and it would
            fight the wall's own (design §7.8 / F-30). */}
        {!isWall && (
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
        )}

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
          <input type="checkbox" checked={!!o.flipX} onChange={(e) => patchOverlay(i, { flipX: e.target.checked || undefined })} />
        </Field>
        <Field label="Flip vertical">
          <input type="checkbox" checked={!!o.flipY} onChange={(e) => patchOverlay(i, { flipY: e.target.checked || undefined })} />
        </Field>
        {/* Note (not fixed here — pre-existing render-engine quirk): scaleStrength lerps opacity
            toward 1, so additive low-opacity fx (beatFlash/grainLoop/crtScanlines) go fully opaque
            at strength 0 instead of vanishing. See src/effects/compose.ts scaleStrength. */}
        <Field label="Strength (all effects)">
          <Slider value={o.strength ?? 1} min={0} max={2} step={0.05} onChange={(v) => patchOverlay(i, { strength: v })} />
        </Field>
      </Section>

      <EffectStack
        motions={o.motions}
        motionParams={o.motionParams}
        fallbackStrength={o.strength}
        onChange={(patch) => patchOverlay(i, patch)}
        onBrowse={() => openBrowser({ mode: "overlay-add", index: i })}
      />
    </div>
  );
};
