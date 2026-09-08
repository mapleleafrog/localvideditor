// Wall inspector — the selected item's properties, plus the wall/camera globals.
//
// Built from the shared fields.tsx primitives so it looks and behaves like the overlay inspector,
// with one deliberate difference: EVERY text and number field here is LOCALLY CONTROLLED and
// COMMITS ON BLUR/ENTER (see CommitText / CommitNum below). zundo's 600 ms leading-edge handleSet
// would otherwise fold "typing in caption A" and "typing in caption B" into a single history entry.
// One field = one patch = one undo step.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { staticFile } from "remotion";
import { useEditor } from "../store";
import type { WallItem } from "../../../src/timeline/schema";
import { FONT_OPTIONS } from "../../../src/timeline/fonts";
import { itemBox, itemDepth } from "../../../src/timeline/wall";
import { hasJapanese, wallOf, wallSummary, wallTiming } from "../lib/wall-edit";
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

export const WallInspector: React.FC = () => {
  const project = useEditor((s) => s.project);
  const wallClip = useEditor((s) => s.wallClip);
  const selection = useEditor((s) => s.selection);
  const wallSel = useEditor((s) => s.wallSel);
  const patchWall = useEditor((s) => s.patchWall);
  const patchWallItem = useEditor((s) => s.patchWallItem);
  const reorderWallItem = useEditor((s) => s.reorderWallItem);
  const removeWallItem = useEditor((s) => s.removeWallItem);
  const duplicateWallItem = useEditor((s) => s.duplicateWallItem);
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
  const t = useMemo(() => wallTiming(wall, fps, W, H), [wall, fps, W, H]);
  if (!isWall || wallClip == null) {
    return <div className="muted pad">No wall clip selected.</div>;
  }
  const ci = wallClip;
  const items = wall.items ?? [];

  const idx = selection?.kind === "wallItem" && selection.clip === ci ? selection.index : -1;
  const item = idx >= 0 ? items[idx] : undefined;

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

  const box = item ? itemBox(item) : null;
  const nat = item ? measured[item.src] : undefined;
  const isText = item ? (item.type ?? "image") === "text" : false;
  const effFont = item?.fontFamily ?? wall.handFont ?? "caveat";
  const cjkWarn = !!item && isText && hasJapanese(item.text ?? "") && effFont === "caveat";
  const capWarn = !!item && hasJapanese(item.caption ?? "") && (wall.handFont ?? "caveat") === "caveat";

  return (
    <div className="insp">
      <div className="insp-head">
        <span>Wall · clip {ci + 1}</span>
        {wallSel.length > 1 && <span className="muted">{wallSel.length} selected</span>}
      </div>
      <div className="muted wi-sum">
        {sum.text} — intro {t.intro.toFixed(1)}s + scenes {t.scenes.toFixed(1)}s + outro {t.outro.toFixed(1)}s ={" "}
        {t.total.toFixed(1)}s ({t.frames}f)
      </div>

      {item && idx >= 0 ? (
        <>
          <Section title={`Item ${idx + 1} of ${items.length}`} defaultOpen>
            <Field label="Label (editor only)">
              <CommitText value={item.label ?? ""} placeholder={item.src || "item"} onCommit={(v) => patch({ label: v || undefined })} />
            </Field>
            {!isText && (
              <>
                <Field label="Source">
                  <CommitText value={item.src} placeholder="media/photo.jpg" onCommit={(v) => patch({ src: v })} />
                </Field>
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
              </>
            )}

            <Field label="Position (wall units)">
              <div className="wi-row">
                <CommitNum value={item.x} onCommit={(v) => patch({ x: v })} suffix="x" />
                <CommitNum value={item.y} onCommit={(v) => patch({ y: v })} suffix="y" />
              </div>
            </Field>
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
            <Field label="Depth (parallax)">
              <Slider value={item.depth ?? 1} min={0.2} max={3} step={0.01} onChange={(v) => patch({ depth: v })} />
              <span className="muted wi-lint">
                drifts ×{(item.depth ?? 1).toFixed(2)} · size unchanged. Depth is parallax only — paint order is the
                item list, so depth never reorders anything.
              </span>
            </Field>

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
              <select value={item.filter ?? "none"} onChange={(e) => patch({ filter: e.target.value as WallItem["filter"] })}>
                {FILTERS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Filter strength">
              <Slider
                value={item.filterStrength ?? 1}
                min={0}
                max={1}
                step={0.05}
                disabled={(item.filter ?? "none") === "none"}
                onChange={(v) => patch({ filterStrength: v })}
              />
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

          <EffectStack
            motions={item.motions ?? []}
            motionParams={item.motionParams}
            onChange={(p) => patch(p)}
            onBrowse={() => openBrowser({ mode: "wall-item-add", clip: ci, index: idx })}
          />
          <Field label="Effect window (frames)">
            <CommitNum value={item.windowInFrames ?? 90} min={1} onCommit={(v) => patch({ windowInFrames: Math.round(v) })} />
          </Field>
        </>
      ) : (
        <div className="muted wi-empty">
          No item selected. Click one on the wall, drag a marquee with <span className="kbd">⇧</span>, or drop photos onto
          the viewport.
        </div>
      )}

      <Section title="Camera" defaultOpen={!item}>
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
      </Section>

      <Section title="Paper & finish" defaultOpen={false}>
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
            Shown in ▶ Live only. The finish is a full-frame lens layer sized in % of the composition,
            so under overscan its bloom and vignette would sit outside the recorded rectangle you are
            framing against — grading against that is worse than not grading.
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
