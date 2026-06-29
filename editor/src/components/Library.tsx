import React, { useEffect, useState } from "react";
import { useEditor } from "../store";
import type { Overlay } from "../../../src/timeline/schema";
import { readyMotions, readyTransitions } from "../lib/effects-bridge";
import { listMedia } from "../lib/api";
import { AudioPanel } from "./AudioPanel";
import { CanvasPanel } from "./CanvasPanel";

const MOTIONS = readyMotions().map((m) => ({ id: m.id, name: m.name, category: m.category }));
const CATS = Array.from(new Set(MOTIONS.map((m) => m.category)));
const TRANSITIONS = readyTransitions().map((t) => ({ id: t.id, name: t.name }));
// Fallback list until /api/media responds (the dev server scans public/ + public/media/).
const FALLBACK_ASSETS = ["clip-a.svg", "clip-b.svg", "orange-mush.gif", "pixel-mush.gif", "passport_pic_TJH.png"];

export const Library: React.FC = () => {
  const { project, selection, patchOverlay, patchClip, addOverlay } = useEditor();
  const [tab, setTab] = useState<"effects" | "transitions" | "assets" | "audio" | "canvas">("effects");
  const [assets, setAssets] = useState<string[]>(FALLBACK_ASSETS);

  useEffect(() => {
    listMedia().then((a) => {
      if (a.length) setAssets(a);
    });
  }, []);

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
  const addAsset = (src: string) => {
    const o: Overlay = {
      type: "image", text: "", src, from: 0, durationInFrames: 60, x: 50, y: 50, scale: 1, rotation: 0,
      opacity: 1, motions: [], z: 0.4, windowInFrames: 30, fontSize: 80, color: "#ffffff", glow: "", width: 240,
    };
    addOverlay(o);
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
        {tab === "assets" && (
          <>
            <div className="lib-hint">Click to add as an image layer. Drop more files in public/media/.</div>
            <div className="lib-grid">
              {assets.map((a) => (
                <button key={a} className="lib-item" onClick={() => addAsset(a)}>{a}</button>
              ))}
            </div>
          </>
        )}
        {tab === "audio" && <AudioPanel />}
        {tab === "canvas" && <CanvasPanel />}
      </div>
    </div>
  );
};
