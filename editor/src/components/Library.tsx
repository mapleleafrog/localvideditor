import React, { useMemo, useState } from "react";
import { useEditor } from "../store";
import { readyMotions, readyTransitions } from "../lib/effects-bridge";
import { AudioPanel } from "./AudioPanel";
import { CanvasPanel } from "./CanvasPanel";
import { AssetsPanel } from "./AssetsPanel";

const MOTIONS = readyMotions().map((m) => ({ id: m.id, name: m.name, category: m.category }));
const CATS = Array.from(new Set(MOTIONS.map((m) => m.category)));
const TRANSITIONS = readyTransitions().map((t) => ({ id: t.id, name: t.name }));
const matches = (q: string, ...fields: string[]) => fields.some((f) => f.toLowerCase().includes(q));

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
                  <button key={m.id} className="lib-item" disabled={!selection} onClick={() => applyEffect(m.id)} title={m.category}>
                    {m.name}
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
                        <button key={m.id} className="lib-item" disabled={!selection} onClick={() => applyEffect(m.id)}>
                          {m.name}
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
