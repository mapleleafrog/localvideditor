import React, { useState } from "react";
import { useEditor } from "../store";
import { readyMotions, readyTransitions } from "../lib/effects-bridge";
import { AudioPanel } from "./AudioPanel";
import { CanvasPanel } from "./CanvasPanel";
import { AssetsPanel } from "./AssetsPanel";

const MOTIONS = readyMotions().map((m) => ({ id: m.id, name: m.name, category: m.category }));
const CATS = Array.from(new Set(MOTIONS.map((m) => m.category)));
const TRANSITIONS = readyTransitions().map((t) => ({ id: t.id, name: t.name }));

export const Library: React.FC = () => {
  const { project, selection, patchOverlay, patchClip } = useEditor();
  const [tab, setTab] = useState<"effects" | "transitions" | "assets" | "audio" | "canvas">("effects");

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
            {CATS.map((cat) => (
              <div key={cat}>
                <div className="lib-cat">{cat}</div>
                <div className="lib-grid">
                  {MOTIONS.filter((m) => m.category === cat).map((m) => (
                    <button key={m.id} className="lib-item" disabled={!selection} onClick={() => applyEffect(m.id)}>
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
        {tab === "transitions" && (
          <>
            <div className="lib-hint">{selection?.kind === "clip" ? "Click to set the clip's transition" : "Select a clip first"}</div>
            <div className="lib-grid">
              {TRANSITIONS.map((t) => (
                <button key={t.id} className="lib-item" disabled={selection?.kind !== "clip"} onClick={() => applyTransition(t.id)}>
                  {t.name}
                </button>
              ))}
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
