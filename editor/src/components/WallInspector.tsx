// Wall inspector — the selected item's properties, the selected SCENE's timing (in seconds), and
// the wall globals — the right rail of the Wall view.
//
// Built from the shared fields.tsx primitives so it looks and behaves like the overlay inspector,
// with one deliberate difference: EVERY text and number field here is LOCALLY CONTROLLED and
// COMMITS ON BLUR/ENTER (see CommitText / CommitNum below). zundo's 600 ms leading-edge handleSet
// would otherwise fold "typing in caption A" and "typing in caption B" into a single history entry.
// One field = one patch = one undo step.
//
// Sections, top to bottom:
//   Scene N     — when a scene card is selected in the footer strip and no item is selected:
//                 hold / glide-in seconds, easing, arc, the speed chip, re-frame / play / dup / del.
//   Photo       — the selected item's look (source, size, rotation, opacity, frame, caption, filter).
//   Appear      — PowerPoint-style timing: appear in scene X (+ stagger + entrance), leave after Y (+ exit).
//   Effects     — the stacked registry motions (run from the appear frame).
//   Advanced    — aspect, position, depth, mirror, pixelated, paint order, duplicate / delete.
//   Wall settings — camera globals + paper & finish + the viewport roll (collapsed).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { staticFile } from "remotion";
import { useEditor } from "../store";
import type { WallItem, WallScene } from "../../../src/timeline/schema";
import { FONT_OPTIONS } from "../../../src/timeline/fonts";
import { TRANSITION_KINDS, type TransitionKind } from "../../../src/effects/io";
import { EASING_NAMES, type EasingName } from "../../../src/effects/easing";
import { itemBox, itemDepth, itemWindow, peakVelocity, sceneIndexById, suggestGlideSeconds } from "../../../src/timeline/wall";
import { camFromScene, hasJapanese, hoverEndCam, sceneOptions, scheduleWall, speedClass, wallOf, wallSummary } from "../lib/wall-edit";
import { imageNaturalSize } from "../lib/image";
import { EffectStack, Field, Section, Slider } from "./fields";

const srcUrl = (ref: string) => (/^https?:\/\//.test(ref) ? ref : staticFile(ref));

// ---------------------------------------------------------------------------------------------
// Commit-on-blur primitives. Kept here (rather than in fields.tsx) because the rest of the editor
// commits on change and changing that is not this feature's business; WallScenes imports them.
// ---------------------------------------------------------------------------------------------

/** Text (or multi-line) field that commits on blur / Enter and reverts on Escape. */
export const CommitText: React.FC<{
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}> = ({ value, onCommit, placeholder, rows, className }) => {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);
  const commit = () => {
    focused.current = false;
    if (draft !== value) onCommit(draft);
  };
  const common = {
    className,
    placeholder,
    value: draft,
    onFocus: () => {
      focused.current = true;
    },
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        setDraft(value);
        focused.current = false;
        (e.target as HTMLElement).blur();
      } else if (e.key === "Enter" && !(rows && rows > 1)) {
        commit();
        (e.target as HTMLElement).blur();
      }
    },
  };
  return rows && rows > 1 ? <textarea rows={rows} {...common} /> : <input type="text" {...common} />;
};

/** Number field with the same commit rule. An emptied box reverts rather than writing NaN. */
export const CommitNum: React.FC<{
  value: number;
  onCommit: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  disabled?: boolean;
  title?: string;
}> = ({ value, onCommit, step = 1, min, max, suffix, disabled, title }) => {
  const [draft, setDraft] = useState(String(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(String(value));
  }, [value]);
  const commit = () => {
    focused.current = false;
    const n = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(n)) {
      setDraft(String(value));
      return;
    }
    const c = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
    setDraft(String(c));
    if (c !== value) onCommit(c);
  };
  return (
    <span className={"wi-num" + (disabled ? " sld-disabled" : "")} title={title}>
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        value={draft}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit();
            (e.target as HTMLElement).blur();
          } else if (e.key === "Escape") {
            setDraft(String(value));
            focused.current = false;
            (e.target as HTMLElement).blur();
          }
        }}
      />
      {suffix ? <span className="muted">{suffix}</span> : null}
    </span>
  );
};

const FRAMES: WallItem["frame"][] = ["none", "polaroid", "matte", "taped", "torn"];
const FILTERS: WallItem["filter"][] = ["none", "sepia", "faded", "bw", "warm", "cool"];
const SCENE_EASINGS: WallScene["easing"][] = ["smooth", "sine", "cubic", "settle"];
const IO_LABEL: Record<TransitionKind, string> = {
  none: "none",
  fade: "fade",
  slideLeft: "slide from right",
  slideRight: "slide from left",
  slideUp: "slide from below",
  slideDown: "slide from above",
  zoom: "zoom",
  pop: "pop",
  rotateIn: "rotate in",
  spin: "spin",
  blurIn: "blur",
  flash: "flash",
  wipe: "wipe",
  iris: "iris",
  typewriter: "typewriter",
};

const IoSelect: React.FC<{ value: TransitionKind; onChange: (k: TransitionKind) => void }> = ({ value, onChange }) => (
  <select value={value} onChange={(e) => onChange(e.target.value as TransitionKind)}>
    {TRANSITION_KINDS.map((k) => (
      <option key={k} value={k}>
        {IO_LABEL[k]}
      </option>
    ))}
  </select>
);

const EaseSelect: React.FC<{ value: EasingName | undefined; onChange: (v: EasingName | undefined) => void }> = ({ value, onChange }) => (
  <select value={value ?? ""} onChange={(e) => onChange((e.target.value || undefined) as EasingName | undefined)}>
    <option value="">linear</option>
    {EASING_NAMES.filter((n) => n !== "linear").map((n) => (
      <option key={n} value={n}>
        {n}
      </option>
    ))}
  </select>
);

export const WallInspector: React.FC = () => {
  const project = useEditor((s) => s.project);
  const wallClip = useEditor((s) => s.wallClip);
  const selection = useEditor((s) => s.selection);
  const wallSel = useEditor((s) => s.wallSel);
  const wallCam = useEditor((s) => s.wallCam);
  const setWallCam = useEditor((s) => s.setWallCam);
  const wallScene = useEditor((s) => s.wallScene);
  const setWallScene = useEditor((s) => s.setWallScene);
  const setLive = useEditor((s) => s.setWallLive);
  const requestSeek = useEditor((s) => s.requestSeek);
  const patchWall = useEditor((s) => s.patchWall);
  const patchWallItem = useEditor((s) => s.patchWallItem);
  const reorderWallItem = useEditor((s) => s.reorderWallItem);
  const removeWallItem = useEditor((s) => s.removeWallItem);
  const duplicateWallItem = useEditor((s) => s.duplicateWallItem);
  const addWallScene = useEditor((s) => s.addWallScene);
  const patchWallScene = useEditor((s) => s.patchWallScene);
  const removeWallScene = useEditor((s) => s.removeWallScene);
  const openBrowser = useEditor((s) => s.openBrowser);
  const setWallSel = useEditor((s) => s.setWallSel);
  const select = useEditor((s) => s.select);
  const flash = useEditor((s) => s.flash);

  // Measured source sizes, keyed by src — populated only by the explicit "re-read" button, so the
  // inspector never fires network reads on its own.
  const [measured, setMeasured] = useState<Record<string, { w: number; h: number }>>({});

  const clip = wallClip != null ? project.clips?.[wallClip] : undefined;
  const isWall = wallClip != null && !!clip && clip.type === "wall";
  const fps = project.fps ?? 30;
  const W = project.width ?? 1920;
  const H = project.height ?? 1080;
  // Both of these run `scheduleWall` -> `fitAll` (two 80-iteration ternary searches over every
  // item). Memoised, and computed BEFORE the early return so the hook order never changes.
  const wall = useMemo(() => (isWall ? wallOf(clip) : wallOf(undefined)), [isWall, clip]);
  const sum = useMemo(() => wallSummary(wall, fps, W, H), [wall, fps, W, H]);
  const sched = useMemo(() => scheduleWall(wall, fps, W, H), [wall, fps, W, H]);
  if (!isWall || wallClip == null) {
    return <div className="muted pad">No wall clip selected.</div>;
  }
  const ci = wallClip;
  const items = wall.items ?? [];
  const scenes = wall.scenes ?? [];
  const opts = sceneOptions(wall);

  const idx = selection?.kind === "wallItem" && selection.clip === ci ? selection.index : -1;
  const item = idx >= 0 ? items[idx] : undefined;
  const si = item ? -1 : sceneIndexById(wall, wallScene ?? undefined);
  const scene = si >= 0 ? scenes[si] : undefined;

  /** Re-read the source's intrinsic ratio (the same call AssetsPanel makes at import). Async, so
   *  the store is re-read and the item re-validated (same index, same src) before patching. */
  const rereadAspect = async (i: number) => {
    const before = useEditor.getState().project.clips?.[ci]?.wall?.items?.[i];
    if (!before || !before.src) return;
    const { w, h } = await imageNaturalSize(srcUrl(before.src));
    const st = useEditor.getState();
    const cur = st.project.clips?.[ci]?.wall?.items?.[i];
    if (!cur || cur.src !== before.src) return; // gone / replaced while loading
    if (!w || !h) {
      st.flash("Couldn't read image size");
      return;
    }
    setMeasured((m) => ({ ...m, [before.src]: { w, h } }));
    st.patchWallItem(ci, i, { aspect: w / h });
  };

  const sortByDepth = () => {
    const order = items.map((it, i) => ({ it, i })).sort((a, b) => itemDepth(a.it) - itemDepth(b.it) || a.i - b.i);
    patchWall(ci, { items: order.map((o) => o.it) });
    const where = new Map(order.map((o, k) => [o.i, k]));
    setWallSel(wallSel.map((k) => where.get(k) ?? k));
    if (idx >= 0) select({ kind: "wallItem", clip: ci, index: where.get(idx) ?? idx });
    flash("Sorted by depth (far painted first)");
  };

  const patch = (p: Partial<WallItem>) => idx >= 0 && patchWallItem(ci, idx, p);
  /** Clear an optional field rather than persisting a stale default. */
  const unset = (k: keyof WallItem) => {
    if (idx < 0 || !item) return;
    const next = { ...item };
    delete next[k];
    patchWall(ci, { items: items.map((it, i) => (i === idx ? next : it)) });
  };
  const setOrUnset = <K extends keyof WallItem>(k: K, v: WallItem[K] | undefined) => (v === undefined ? unset(k) : patch({ [k]: v } as Partial<WallItem>));

  const box = item ? itemBox(item) : null;
  const nat = item ? measured[item.src] : undefined;
  const isText = item ? (item.type ?? "image") === "text" : false;
  const effFont = item?.fontFamily ?? wall.handFont ?? "caveat";
  const cjkWarn = !!item && isText && hasJapanese(item.text ?? "") && effFont === "caveat";
  const capWarn = !!item && hasJapanese(item.caption ?? "") && (wall.handFont ?? "caveat") === "caveat";
  const win = item ? itemWindow(sched, wall, item) : null;
  const neverVisible = !!win && win.from >= win.to;
  const secs = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

  // --- scene panel maths ---
  const scenePanel = (() => {
    if (!scene || si < 0) return null;
    const a = si === 0 ? sched.whole : hoverEndCam(scenes[si - 1], camFromScene(scene));
    const b = camFromScene(scene);
    const glideLive = si === 0 ? wall.intro : true;
    const v = peakVelocity(a, b, scene.glideSeconds, fps);
    const suggested = suggestGlideSeconds(a, b);
    const dist = Math.round(Math.hypot(b.x - a.x, b.y - a.y) * ((a.zoom + b.zoom) / 2));
    const appearing = items.filter((it) => it.appearIn === scene.id).length;
    const leaving = items.filter((it) => it.leaveAfter === scene.id).length;
    // Live shows JUST the wall (liveWallProject), so the clip starts at Player frame 0.
    const playScene = () => {
      setLive(true);
      requestSeek(sched.sceneFrames[si] ?? 0, { play: true, until: sched.sceneEnds[si] ?? sched.total });
    };
    return (
      <Section title={`Scene ${si + 1} of ${scenes.length}`} defaultOpen>
        <Field label="Name">
          <CommitText value={scene.name ?? ""} placeholder={`x ${Math.round(scene.x)} y ${Math.round(scene.y)}`} onCommit={(v2) => patchWallScene(ci, si, { name: v2 })} />
        </Field>
        <div className="muted wi-lint">
          starts at {secs((sched.sceneFrames[si] ?? 0) / fps)}s · ends {secs((sched.sceneEnds[si] ?? 0) / fps)}s
          {appearing ? ` · ${appearing} object${appearing === 1 ? "" : "s"} appear here` : ""}
          {leaving ? ` · ${leaving} leave after` : ""}
        </div>
        <Field label="Hold (seconds the camera stays)">
          <div className="wi-row">
            <CommitNum value={scene.holdSeconds} min={0} step={0.1} suffix="s" onCommit={(n) => patchWallScene(ci, si, { holdSeconds: n })} />
            <span className="muted">{Math.round(scene.holdSeconds * fps)}f{scene.holdSeconds === 0 ? " · via (no stop)" : ""}</span>
          </div>
        </Field>
        <Field label="Hover during the hold (the camera never quite stops)">
          <div className="wi-row">
            <select
              value={scene.hover ?? "none"}
              onChange={(e) => {
                const v = e.target.value as WallScene["hover"];
                patchWallScene(ci, si, { hover: v === "none" ? undefined : v });
              }}
              title="A slow, eased drift across the hold — push-in is the classic. Breathing (Wall settings) is the random handheld tremor on top."
            >
              <option value="none">still</option>
              <option value="toward">creep toward the next scene (anticipates the glide)</option>
              <option value="pushIn">push in</option>
              <option value="pullOut">pull out</option>
              <option value="left">drift left</option>
              <option value="right">drift right</option>
              <option value="up">drift up</option>
              <option value="down">drift down</option>
            </select>
          </div>
          <Slider
            value={scene.hoverAmount ?? 0.5}
            min={0}
            max={1}
            step={0.05}
            disabled={!scene.hover || scene.hover === "none"}
            onChange={(v2) => patchWallScene(ci, si, { hoverAmount: v2 })}
          />
          <span className="muted wi-lint">amount 1 = +6 % zoom or 140 px of pan over the hold; 0.5 is the default on new scenes.</span>
        </Field>
        <div className="insp-sub wi-subhead">→ Transition into this scene {si > 0 ? `(from scene ${si})` : "(intro)"}</div>
        {!glideLive && (
          <span className="muted wi-lint">
            Intro is off, so nothing glides INTO scene 1 — these settings do nothing. The move from scene 1 to scene 2 lives on
            scene 2: click its card or the arrow before it.
            {scenes.length > 1 ? (
              <>
                {" "}
                <button className="muted" onClick={() => { setWallScene(scenes[1].id ?? null); setWallCam(camFromScene(scenes[1])); }}>
                  open scene 2 →
                </button>
              </>
            ) : null}
          </span>
        )}
        <Field label={si === 0 ? "Intro glide in (seconds)" : "Glide duration (seconds)"}>
          <div className="wi-row">
            <CommitNum
              value={scene.glideSeconds}
              min={0}
              step={0.1}
              suffix="s"
              disabled={!glideLive}
              title={glideLive ? undefined : "no glide into the first scene (intro is off)"}
              onCommit={(n) => patchWallScene(ci, si, { glideSeconds: n })}
            />
            {glideLive && scene.glideSeconds > 0 && dist > 0 ? (
              <button
                className={"wsc-speed " + speedClass(v)}
                title={`${scene.glideSeconds}s over ${dist} screen px — ${v.toFixed(0)} px/frame peak. Suggested ${suggested.toFixed(2)}s. Click to apply.`}
                onClick={() => patchWallScene(ci, si, { glideSeconds: Math.round(suggested * 100) / 100 })}
              >
                ● {v.toFixed(0)} px/f → {suggested.toFixed(1)}s
              </button>
            ) : (
              <span className="muted">{glideLive ? (dist ? "cut" : "no travel") : "off"}</span>
            )}
          </div>
        </Field>
        <Field label="Easing (of the glide in)">
          <select
            value={scene.easing}
            disabled={!glideLive}
            title="smooth = zero acceleration at both ends · cubic nearly doubles peak speed · settle overshoots (use at ≥ 1.0 s)"
            onChange={(e) => patchWallScene(ci, si, { easing: e.target.value as WallScene["easing"] })}
          >
            {SCENE_EASINGS.map((e2) => (
              <option key={e2} value={e2}>
                {e2}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Path arc (${scene.arc})`}>
          <Slider value={scene.arc} min={-1} max={1} step={0.05} disabled={!glideLive} onChange={(v2) => patchWallScene(ci, si, { arc: v2 })} />
        </Field>
        <Field label="Scene">
          <div className="wi-row">
            <button
              title="Update this scene's framing from the viewport (timing kept)"
              onClick={() => patchWallScene(ci, si, { x: wallCam.x, y: wallCam.y, zoom: wallCam.zoom, rotation: wallCam.rot })}
            >
              ⟳ Re-frame
            </button>
            <button title="Play this scene (Live)" onClick={playScene}>
              ▸ Play
            </button>
            <button title="Duplicate scene" onClick={() => addWallScene(ci, { ...scene }, si + 1)}>
              ⧉
            </button>
            <button className="del" title="Delete scene (objects that appeared here go back to always-on)" onClick={() => removeWallScene(ci, si)}>
              ×
            </button>
          </div>
          <button className="muted" onClick={() => setWallScene(null)} title="Deselect the scene">
            done
          </button>
        </Field>
      </Section>
    );
  })();

  return (
    <div className="insp">
      <div className="insp-head">
        <span>Wall · clip {ci + 1}</span>
        {wallSel.length > 1 && <span className="muted">{wallSel.length} selected</span>}
      </div>
      <div className="muted wi-sum">{sum.text}</div>

      {scenePanel}

      {item && idx >= 0 ? (
        <>
          <Section title={`${isText ? "Text" : "Photo"} ${idx + 1} of ${items.length}`} defaultOpen>
            <Field label="Label (editor only)">
              <CommitText value={item.label ?? ""} placeholder={item.src || "item"} onCommit={(v) => patch({ label: v || undefined })} />
            </Field>
            {!isText && (
              <Field label="Source">
                <CommitText value={item.src} placeholder="media/photo.jpg" onCommit={(v) => patch({ src: v })} />
              </Field>
            )}
            {isText && (
              <>
                <Field label="Text">
                  <CommitText value={item.text ?? ""} rows={3} onCommit={(v) => patch({ text: v })} />
                  {cjkWarn && (
                    <span className="wi-warn">Caveat has no Japanese glyphs — pick Yomogi or Zen Kurenaido below.</span>
                  )}
                </Field>
                <Field label="Font">
                  <select
                    value={item.fontFamily ?? ""}
                    onChange={(e) => patch({ fontFamily: (e.target.value || undefined) as WallItem["fontFamily"] })}
                  >
                    <option value="">wall hand font ({wall.handFont ?? "caveat"})</option>
                    {FONT_OPTIONS.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Font size (wall units)">
                  <CommitNum value={item.fontSize ?? 96} min={1} onCommit={(v) => patch({ fontSize: v })} />
                </Field>
                <Field label="Colour">
                  <input type="color" value={item.color ?? "#3a3226"} onChange={(e) => patch({ color: e.target.value })} />
                </Field>
                <Field label="Align">
                  <select value={item.align ?? "center"} onChange={(e) => patch({ align: e.target.value as WallItem["align"] })}>
                    <option value="left">left</option>
                    <option value="center">center</option>
                    <option value="right">right</option>
                  </select>
                </Field>
              </>
            )}
            <Field label="Width (outer card)">
              <div className="wi-row">
                <CommitNum value={item.width} min={1} onCommit={(v) => patch({ width: v })} />
                <span className="muted">→ {box ? Math.round(box.h) : 0} tall</span>
              </div>
            </Field>
            <Field label="Rotation">
              <Slider value={item.rotation ?? 0} min={-180} max={180} step={0.5} onChange={(v) => patch({ rotation: v })} />
            </Field>
            <Field label="Opacity">
              <Slider value={item.opacity ?? 1} min={0} max={1} step={0.05} onChange={(v) => patch({ opacity: v })} />
            </Field>
            {!isText && (
              <>
                <Field label="Frame treatment">
                  <select value={item.frame ?? "none"} onChange={(e) => patch({ frame: e.target.value as WallItem["frame"] })}>
                    {FRAMES.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Caption (polaroid / matte margin)">
                  <CommitText value={item.caption ?? ""} onCommit={(v) => patch({ caption: v })} />
                  {capWarn && (
                    <span className="wi-warn">Caveat has no Japanese glyphs — set the wall’s hand font to Yomogi or Zen Kurenaido.</span>
                  )}
                </Field>
                <Field label="Filter">
                  <div className="wi-row">
                    <select value={item.filter ?? "none"} onChange={(e) => patch({ filter: e.target.value as WallItem["filter"] })}>
                      {FILTERS.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Slider
                    value={item.filterStrength ?? 1}
                    min={0}
                    max={1}
                    step={0.05}
                    disabled={(item.filter ?? "none") === "none"}
                    onChange={(v) => patch({ filterStrength: v })}
                  />
                </Field>
              </>
            )}
          </Section>

          <Section title="Appear" defaultOpen badge={item.appearIn || item.leaveAfter ? "timed" : undefined}>
            {opts.length === 0 ? (
              <span className="muted wi-lint">Set a scene first (⊕ Set as scene), then choose when this object appears.</span>
            ) : (
              <>
                <Field label="Appears in scene">
                  <select value={item.appearIn ?? ""} onChange={(e) => setOrUnset("appearIn", e.target.value || undefined)}>
                    <option value="">always on the wall</option>
                    {opts.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
                {item.appearIn && (
                  <>
                    <Field label="Delay after arrival (seconds)">
                      <CommitNum value={item.appearDelaySeconds ?? 0} min={0} step={0.1} suffix="s" onCommit={(v) => setOrUnset("appearDelaySeconds", v || undefined)} />
                    </Field>
                    <Field label="Entrance">
                      <div className="wi-row">
                        <IoSelect value={item.enter ?? "none"} onChange={(k) => setOrUnset("enter", k === "none" ? undefined : k)} />
                        <CommitNum
                          value={item.enterSeconds ?? 0.5}
                          min={0}
                          step={0.1}
                          suffix="s"
                          disabled={(item.enter ?? "none") === "none"}
                          onCommit={(v) => setOrUnset("enterSeconds", v === 0.5 ? undefined : v)}
                        />
                        <EaseSelect value={item.enterEasing} onChange={(v) => setOrUnset("enterEasing", v)} />
                      </div>
                      <span className="muted wi-lint">Stacked effects below also start when the object appears — springPop / bounceIn make good entrances too.</span>
                    </Field>
                  </>
                )}
                <Field label="Leaves after scene">
                  <select value={item.leaveAfter ?? ""} onChange={(e) => setOrUnset("leaveAfter", e.target.value || undefined)}>
                    <option value="">stays until the end</option>
                    {opts.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
                {item.leaveAfter && (
                  <Field label="Exit">
                    <div className="wi-row">
                      <IoSelect value={item.exit ?? "none"} onChange={(k) => setOrUnset("exit", k === "none" ? undefined : k)} />
                      <CommitNum
                        value={item.exitSeconds ?? 0.5}
                        min={0}
                        step={0.1}
                        suffix="s"
                        disabled={(item.exit ?? "none") === "none"}
                        onCommit={(v) => setOrUnset("exitSeconds", v === 0.5 ? undefined : v)}
                      />
                      <EaseSelect value={item.exitEasing} onChange={(v) => setOrUnset("exitEasing", v)} />
                    </div>
                  </Field>
                )}
                {win && (
                  <span className={neverVisible ? "wi-warn" : "muted wi-lint"}>
                    {neverVisible
                      ? "Never visible — it leaves before it appears (or the delay runs past the leave scene)."
                      : `Visible ${secs(win.from / fps)}s → ${Number.isFinite(win.to) ? secs(win.to / fps) + "s" : "end"} of the clip.`}
                  </span>
                )}
              </>
            )}
          </Section>

          <EffectStack
            motions={item.motions ?? []}
            motionParams={item.motionParams}
            onChange={(p) => patch(p)}
            onBrowse={() => openBrowser({ mode: "wall-item-add", clip: ci, index: idx })}
          />
          <Field label="Effect window (frames)">
            <CommitNum value={item.windowInFrames ?? 90} min={1} onCommit={(v) => patch({ windowInFrames: Math.round(v) })} />
          </Field>

          <Section title="Advanced" defaultOpen={false}>
            {!isText && (
              <Field label="Aspect (intrinsic w/h)">
                <div className="wi-row">
                  <CommitNum value={item.aspect ?? 1} step={0.01} min={0.2} max={5} onCommit={(v) => patch({ aspect: v })} />
                  <button onClick={() => void rereadAspect(idx)} title="Read the file's real pixel ratio">
                    ↻ Re-read
                  </button>
                </div>
                {nat && (
                  <span className="muted wi-lint">
                    source {nat.w}×{nat.h} px · card {Math.round(item.width)} units
                    {nat.w > 0 && item.width > nat.w ? " — upscaled, it will read soft" : ""}
                  </span>
                )}
              </Field>
            )}
            <Field label="Position (wall units)">
              <div className="wi-row">
                <CommitNum value={item.x} onCommit={(v) => patch({ x: v })} suffix="x" />
                <CommitNum value={item.y} onCommit={(v) => patch({ y: v })} suffix="y" />
              </div>
            </Field>
            <Field label="Depth (parallax)">
              <Slider value={item.depth ?? 1} min={0.2} max={3} step={0.01} onChange={(v) => patch({ depth: v })} />
              <span className="muted wi-lint">
                drifts ×{(item.depth ?? 1).toFixed(2)} · size unchanged. Depth is parallax only — paint order is the item
                list, so depth never reorders anything.
              </span>
            </Field>
            <Field label="Mirror">
              <div className="wi-row">
                <label className="wi-check">
                  <input type="checkbox" checked={!!item.flipX} onChange={(e) => patch({ flipX: e.target.checked || undefined })} /> Flip H
                </label>
                <label className="wi-check">
                  <input type="checkbox" checked={!!item.flipY} onChange={(e) => patch({ flipY: e.target.checked || undefined })} /> Flip V
                </label>
              </div>
            </Field>
            <Field label="Pixelated scaling">
              <label className="wi-check">
                <input
                  type="checkbox"
                  checked={!!item.pixelated}
                  onChange={(e) => patch({ pixelated: e.target.checked || undefined })}
                />{" "}
                crisp (pixel art)
              </label>
              <span className="muted wi-lint">Nearest-neighbour — on a photo it will shimmer while the camera moves.</span>
            </Field>
            <Field label="Paint order (array order)">
              <div className="wi-row">
                <button disabled={idx <= 0} title="Send backward" onClick={() => reorderWallItem(ci, idx, idx - 1)}>
                  ↓
                </button>
                <button disabled={idx >= items.length - 1} title="Bring forward" onClick={() => reorderWallItem(ci, idx, idx + 1)}>
                  ↑
                </button>
                <button disabled={idx <= 0} title="Send to back" onClick={() => reorderWallItem(ci, idx, 0)}>
                  ⤓ back
                </button>
                <button
                  disabled={idx >= items.length - 1}
                  title="Bring to front"
                  onClick={() => reorderWallItem(ci, idx, items.length - 1)}
                >
                  ⤒ front
                </button>
              </div>
              <button onClick={sortByDepth} title="Reorder every item far-to-near — the physical ordering">
                Sort by depth
              </button>
            </Field>
            <Field label="Item">
              <div className="wi-row">
                <button onClick={() => duplicateWallItem(ci, idx)}>⧉ Duplicate</button>
                <button className="del" onClick={() => removeWallItem(ci, idx)}>
                  × Delete
                </button>
              </div>
            </Field>
          </Section>
        </>
      ) : scene ? null : (
        <div className="muted wi-empty">
          Click a photo on the wall to edit it, or a scene card below to set its seconds. Drop photos onto the viewport to add
          them. <span className="kbd">⇧</span>-drag for a marquee.
        </div>
      )}

      <Section title="Wall settings" defaultOpen={false}>
        <Field label="Viewport roll (not saved)">
          <div className="wi-row">
            <Slider value={wallCam.rot} min={-180} max={180} step={0.5} onChange={(v) => setWallCam({ ...wallCam, rot: v })} />
            <button title="Reset roll (0)" onClick={() => setWallCam({ ...wallCam, rot: 0 })}>
              0°
            </button>
            <button title="Zoom 1:1 (1)" onClick={() => setWallCam({ ...wallCam, zoom: 1 })}>
              1:1
            </button>
          </div>
        </Field>
        <Field label="Breathing (handheld drift)">
          <Slider value={wall.breathing} min={0} max={1} step={0.05} onChange={(v) => patchWall(ci, { breathing: v })} />
        </Field>
        <Field label="Intro (pull-out hold + glide in)">
          <label className="wi-check">
            <input type="checkbox" checked={wall.intro} onChange={(e) => patchWall(ci, { intro: e.target.checked })} /> on
          </label>
        </Field>
        <Field label="Intro hold (s)">
          <Slider
            value={wall.introHoldSeconds}
            min={0}
            max={5}
            step={0.1}
            disabled={!wall.intro}
            onChange={(v) => patchWall(ci, { introHoldSeconds: v })}
          />
        </Field>
        <Field label="Outro (glide out)">
          <label className="wi-check">
            <input type="checkbox" checked={wall.outro} onChange={(e) => patchWall(ci, { outro: e.target.checked })} /> on
          </label>
        </Field>
        <Field label="Outro glide (s)">
          <Slider
            value={wall.outroSeconds}
            min={0}
            max={8}
            step={0.1}
            disabled={!wall.outro}
            onChange={(v) => patchWall(ci, { outroSeconds: v })}
          />
        </Field>
        <Field label="Outro hold (s)">
          <Slider
            value={wall.outroHoldSeconds}
            min={0}
            max={5}
            step={0.1}
            disabled={!wall.outro}
            onChange={(v) => patchWall(ci, { outroHoldSeconds: v })}
          />
        </Field>
        <Field label="Fit padding (intro / outro / Fit all)">
          <Slider value={wall.fitPadding} min={0} max={0.4} step={0.01} onChange={(v) => patchWall(ci, { fitPadding: v })} />
        </Field>
        <Field label="Paper">
          <select value={wall.paper} onChange={(e) => patchWall(ci, { paper: e.target.value as typeof wall.paper })}>
            <option value="cream">cream</option>
            <option value="kraft">kraft</option>
            <option value="white">white</option>
            <option value="night">night</option>
          </select>
        </Field>
        <Field label="Fibre">
          <Slider value={wall.fibre} min={0} max={1} step={0.05} onChange={(v) => patchWall(ci, { fibre: v })} />
        </Field>
        <Field label="Finish (bloom / grain / vignette)">
          <Slider value={wall.finish} min={0} max={1} step={0.05} onChange={(v) => patchWall(ci, { finish: v })} />
          <span className="muted wi-lint">
            Shown in ▶ Live only. The finish is a full-frame lens layer sized in % of the composition, so under overscan
            its bloom and vignette would sit outside the recorded rectangle you are framing against.
          </span>
        </Field>
        <Field label="Viewfinder">
          <label className="wi-check">
            <input type="checkbox" checked={wall.viewfinder} onChange={(e) => patchWall(ci, { viewfinder: e.target.checked })} />{" "}
            REC marks
          </label>
        </Field>
        <Field label="Hand font (captions + text items)">
          <select value={wall.handFont} onChange={(e) => patchWall(ci, { handFont: e.target.value as typeof wall.handFont })}>
            <option value="caveat">Caveat (latin only)</option>
            <option value="yomogi">Yomogi (JP)</option>
            <option value="zenKurenaido">Zen Kurenaido (JP)</option>
          </select>
        </Field>
      </Section>
    </div>
  );
};
