import React, { useEffect, useMemo, useState } from "react";
import { useEditor } from "../store";
import { readyMotions, readyTransitions, getMotion } from "../lib/effects-bridge";
import { beatKick } from "../../../src/effects/helpers";
import { AudioPanel } from "./AudioPanel";
import { CanvasPanel } from "./CanvasPanel";
import { AssetsPanel } from "./AssetsPanel";

const MOTIONS = readyMotions().map((m) => ({ id: m.id, name: m.name, category: m.category }));
const CATS = Array.from(new Set(MOTIONS.map((m) => m.category)));
const TRANSITIONS = readyTransitions().map((t) => ({ id: t.id, name: t.name }));
const matches = (q: string, ...fields: string[]) => fields.some((f) => f.toLowerCase().includes(q));

const PREVIEW_FPS = 30;
const PREVIEW_WINDOW = 45; // ~1.5s loop, long enough to read most motions

/** Hover-only live preview: runs the actual motion formula over a small swatch via rAF, so you can
 *  tell "wiggle vs. bob vs. zoom" apart without clicking. Only the hovered tile animates — the other
 *  ~100 stay static, so this doesn't run 100 rAF loops at once. */
const EffectSwatch: React.FC<{ id: string }> = ({ id }) => {
  const [hover, setHover] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({});
  useEffect(() => {
    if (!hover) {
      setStyle({});
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = (now - start) / 1000;
      const frame = Math.floor(elapsed * PREVIEW_FPS) % PREVIEW_WINDOW;
      setStyle(
        getMotion(id)({
          progress: frame / PREVIEW_WINDOW,
          frame,
          fps: PREVIEW_FPS,
          t: elapsed,
          beat: beatKick(elapsed, 120, 6, 0),
          z: 0.4,
          params: {},
        }),
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [id, hover]);
  return (
    <span className="fx-swatch" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <span className="fx-swatch-inner" style={style} />
    </span>
  );
};

export const Library: React.FC = () => {
  const { project, selection, patchOverlay, patchClip } = useEditor();
  const [tab, setTab] = useState<"effects" | "transitions" | "assets" | "audio" | "canvas">("effects");
  const [fxQuery, setFxQuery] = useState("");
  const [trQuery, setTrQuery] = useState("");
  // Categories collapse by default once there are enough of them to scroll — searching bypasses this.
  const [openCats, setOpenCats] = useState<Set<string>>(new Set(CATS.slice(0, 1)));
  const toggleCat = (cat: string) =>
    setOpenCats((s) => {
      const next = new Set(s);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });

  const applyEffect = (id: string) => {
    if (!selection) return;
    if (selection.kind === "overlay") {
      const o = project.overlays[selection.index];
      patchOverlay(selection.index, { motions: [...o.motions, id] });
    } else {
      patchClip(selection.index, { motion: id });
    }
  };
  const applyTransition = (id: string) => {
    if (selection?.kind === "clip") patchClip(selection.index, { transitionToNext: id });
  };

  const fxQ = fxQuery.trim().toLowerCase();
  const filteredMotions = useMemo(
    () => (fxQ ? MOTIONS.filter((m) => matches(fxQ, m.name, m.id, m.category)) : MOTIONS),
    [fxQ],
  );
  const trQ = trQuery.trim().toLowerCase();
  const filteredTransitions = useMemo(
    () => (trQ ? TRANSITIONS.filter((t) => matches(trQ, t.name, t.id)) : TRANSITIONS),
    [trQ],
  );

  return (
    <div className="lib">
      <div className="lib-tabs">
        <button className={tab === "effects" ? "on" : ""} onClick={() => setTab("effects")}>Effects</button>
        <button className={tab === "transitions" ? "on" : ""} onClick={() => setTab("transitions")}>Transitions</button>
        <button className={tab === "assets" ? "on" : ""} onClick={() => setTab("assets")}>Assets</button>
        <button className={tab === "audio" ? "on" : ""} onClick={() => setTab("audio")}>Audio</button>
        <button className={tab === "canvas" ? "on" : ""} onClick={() => setTab("canvas")}>Canvas</button>
      </div>
      <div className="lib-body">
        {tab === "effects" && (
          <>
            <div className="lib-hint">
              {selection
                ? selection.kind === "overlay" ? "Click to stack on the selected layer" : "Click to set the clip's motion"
                : "Select a clip or layer first"}
            </div>
            <input
              className="lib-search"
              placeholder="Search effects…"
              value={fxQuery}
              onChange={(e) => setFxQuery(e.target.value)}
            />
            {fxQ ? (
              <div className="lib-grid">
                {filteredMotions.map((m) => (
                  <button key={m.id} className="lib-item has-swatch" disabled={!selection} onClick={() => applyEffect(m.id)} title={m.category}>
                    <EffectSwatch id={m.id} />
                    <span className="lib-item-label">{m.name}</span>
                  </button>
                ))}
                {filteredMotions.length === 0 && <span className="muted">no matches</span>}
              </div>
            ) : (
              CATS.map((cat) => {
                const open = openCats.has(cat);
                return (
                  <details key={cat} className="lib-section" open={open} onToggle={(e) => { if ((e.target as HTMLDetailsElement).open !== open) toggleCat(cat); }}>
                    <summary className="lib-cat">{cat}</summary>
                    <div className="lib-grid">
                      {MOTIONS.filter((m) => m.category === cat).map((m) => (
                        <button key={m.id} className="lib-item has-swatch" disabled={!selection} onClick={() => applyEffect(m.id)}>
                          <EffectSwatch id={m.id} />
                          <span className="lib-item-label">{m.name}</span>
                        </button>
                      ))}
                    </div>
                  </details>
                );
              })
            )}
          </>
        )}
        {tab === "transitions" && (
          <>
            <div className="lib-hint">{selection?.kind === "clip" ? "Click to set the clip's transition" : "Select a clip first"}</div>
            <input
              className="lib-search"
              placeholder="Search transitions…"
              value={trQuery}
              onChange={(e) => setTrQuery(e.target.value)}
            />
            <div className="lib-grid">
              {filteredTransitions.map((t) => (
                <button key={t.id} className="lib-item" disabled={selection?.kind !== "clip"} onClick={() => applyTransition(t.id)}>
                  {t.name}
                </button>
              ))}
              {filteredTransitions.length === 0 && <span className="muted">no matches</span>}
            </div>
          </>
        )}
        {tab === "assets" && <AssetsPanel />}
        {tab === "audio" && <AudioPanel />}
        {tab === "canvas" && <CanvasPanel />}
      </div>
    </div>
  );
};
