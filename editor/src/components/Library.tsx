import React, { useMemo, useState } from "react";
import { useEditor } from "../store";
import { readyMotions, readyTransitions } from "../lib/effects-bridge";
import { FxPreview } from "./FxPreview";
import { AudioPanel } from "./AudioPanel";
import { CanvasPanel } from "./CanvasPanel";
import { AssetsPanel } from "./AssetsPanel";
import { useFxPrefs } from "../lib/fx-prefs";

const MOTIONS = readyMotions().map((m) => ({ id: m.id, name: m.name, category: m.category }));
const CATS = Array.from(new Set(MOTIONS.map((m) => m.category)));
const TRANSITIONS = readyTransitions().map((t) => ({ id: t.id, name: t.name }));
const matches = (q: string, ...fields: string[]) => fields.some((f) => f.toLowerCase().includes(q));

/** Thin wrapper around FxPreview: per-tile hover state so a grid of ~100 tiles only ever runs ONE
 *  rAF loop at a time (only the hovered tile is `active`). */
const EffectSwatch: React.FC<{ id: string }> = ({ id }) => {
  const [hover, setHover] = useState(false);
  return (
    <span onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <FxPreview id={id} active={hover} />
    </span>
  );
};

export const Library: React.FC = () => {
  const { project, selection, patchOverlay, patchClip, openBrowser } = useEditor();
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

  const { favoriteIds: favMotionIds, pushRecent: pushRecentMotion } = useFxPrefs("motion");
  const { pushRecent: pushRecentTransition } = useFxPrefs("transition");
  const favoriteMotions = useMemo(
    () => favMotionIds.map((id) => MOTIONS.find((m) => m.id === id)).filter((m): m is (typeof MOTIONS)[number] => !!m),
    [favMotionIds],
  );

  const applyEffect = (id: string) => {
    if (!selection) return;
    if (selection.kind === "overlay") {
      const o = project.overlays[selection.index];
      patchOverlay(selection.index, { motions: [...o.motions, id] });
    } else {
      patchClip(selection.index, { motion: id });
    }
    pushRecentMotion(id);
  };
  const applyTransition = (id: string) => {
    if (selection?.kind === "clip") {
      patchClip(selection.index, { transitionToNext: id });
      pushRecentTransition(id);
    }
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
            {favoriteMotions.length > 0 && (
              <div className="lib-favorites">
                <div className="lib-favorites-title">★ Favorites</div>
                <div className="lib-grid">
                  {favoriteMotions.map((m) => (
                    <button key={m.id} className="lib-item has-swatch" disabled={!selection} onClick={() => applyEffect(m.id)} title={m.category}>
                      <EffectSwatch id={m.id} />
                      <span className="lib-item-label">{m.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button
              className="lib-browse-all"
              disabled={!selection}
              title={selection ? "Open the full effect browser" : "Select a clip or layer first"}
              onClick={() =>
                selection &&
                openBrowser(
                  selection.kind === "overlay"
                    ? { mode: "overlay-add", index: selection.index }
                    : { mode: "clip-motion", index: selection.index },
                )
              }
            >
              ⊞ Browse all…
            </button>
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
            <button
              className="lib-browse-all"
              disabled={selection?.kind !== "clip"}
              title={selection?.kind === "clip" ? "Open the full transition browser" : "Select a clip first"}
              onClick={() => selection?.kind === "clip" && openBrowser({ mode: "clip-transition", index: selection.index })}
            >
              ⊞ Browse all…
            </button>
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
