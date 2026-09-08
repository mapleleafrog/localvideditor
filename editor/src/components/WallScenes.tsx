// Wall scenes strip — the authoring loop, in the footer where the timeline lives in Edit.
// Footer = time, right rail = properties: the same mapping as the Edit shell.
//
//   1. Pan / zoom / roll until the recorded-frame rectangle contains what you want.
//   2. Drop photos, arrange them, set treatment / filter / depth / caption / motions.
//   3. ⊕ Set as scene  (Enter) — appends the pose with a glide duration a motion designer would
//      sign off (suggestGlideSeconds targets peak px/SECOND, so it is fps-independent).
//   4. Pan to the next area, repeat.   5. ⟲ Fit clip duration when the take is right.
//
// THE SPEED CHIP is the design's centrepiece in the UI: it prints peakVelocity live, colour-banded
// (<=18 glassy / 18-34 brisk / 34-55 energetic / >55 a whip), and recomputes when the easing
// changes — so the fact that `cubic` at the same duration is a SNAP ease, not a smoother one, is
// visible rather than folklore. One click applies the suggestion.
//
// ⟳ Update from viewport patches x/y/zoom/rotation ONLY, keeping the timing — that separation is
// what makes re-framing an existing scene safe. ▸ Play from here seeks with the schedule's OWN
// sceneFrames[]/sceneEnds[] arrays, never by segment search or `?? 0`.
import React, { useMemo, useState } from "react";
import { useEditor } from "../store";
import type { WallScene } from "../../../src/timeline/schema";
import { peakVelocity, suggestGlideSeconds } from "../../../src/timeline/wall";
import { clipStarts } from "../lib/timeline-utils";
import { appendedScene, camFromScene, fitDurationPatch, scheduleWall, wallFitFor, wallOf } from "../lib/wall-edit";
import { WallMiniMap } from "./WallMiniMap";
import { CommitNum, CommitText } from "./WallInspector";

const EASINGS: WallScene["easing"][] = ["smooth", "sine", "cubic", "settle"];

/** How a glide reads at 30 fps (design §3.6) — the bands the chip is coloured by. */
const speedClass = (v: number) => (v <= 18 ? "ok" : v <= 34 ? "mid" : v <= 55 ? "hot" : "bad");

export const WallScenes: React.FC = () => {
  const project = useEditor((s) => s.project);
  const wallClip = useEditor((s) => s.wallClip);
  const wallCam = useEditor((s) => s.wallCam);
  const setWallCam = useEditor((s) => s.setWallCam);
  const live = useEditor((s) => s.wallLive);
  const setLive = useEditor((s) => s.setWallLive);
  const addWallScene = useEditor((s) => s.addWallScene);
  const patchWallScene = useEditor((s) => s.patchWallScene);
  const removeWallScene = useEditor((s) => s.removeWallScene);
  const reorderWallScene = useEditor((s) => s.reorderWallScene);
  const patchWall = useEditor((s) => s.patchWall);
  const patchClip = useEditor((s) => s.patchClip);
  const requestSeek = useEditor((s) => s.requestSeek);
  const flash = useEditor((s) => s.flash);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const clip = wallClip != null ? project.clips?.[wallClip] : undefined;
  const isWall = wallClip != null && !!clip && clip.type === "wall";
  const fps = project.fps ?? 30;
  const W = project.width ?? 1920;
  const H = project.height ?? 1080;
  // MEMOISED, and computed BEFORE the early return so the hook order is stable. `scheduleWall`
  // runs `fitAll`, which is two 80-iteration ternary searches over every item — this strip
  // re-renders on every camera move, and it used to re-solve that twice per render (once here,
  // once inside wallFitFor).
  const wall = useMemo(() => (isWall ? wallOf(clip) : wallOf(undefined)), [isWall, clip]);
  const sched = useMemo(() => scheduleWall(wall, fps, W, H), [wall, fps, W, H]);
  const fit = useMemo(() => (isWall ? wallFitFor(project, wallClip) : null), [isWall, project, wallClip]);
  const starts = useMemo(() => clipStarts(project), [project]);
  if (!isWall || wallClip == null || !clip) {
    return <div className="muted pad">No wall clip selected.</div>;
  }
  const ci = wallClip;
  const scenes = wall.scenes ?? [];
  const absStart = starts[ci] ?? 0;

  /** The pose a scene glides FROM: the previous scene, or the whole-wall fit pose for scene 0. */
  const prevCam = (i: number) => (i === 0 ? sched.whole : camFromScene(scenes[i - 1]));

  const setAsScene = () => {
    addWallScene(ci, appendedScene(wall, wallCam));
    flash(`Scene ${scenes.length + 1} set`);
  };

  const playFrom = (i: number) => {
    setLive(true);
    // From the schedule's own arrays — a dropped zero-length hold can never make this fall to 0.
    requestSeek(absStart + (sched.sceneFrames[i] ?? 0), { play: true, until: absStart + (sched.sceneEnds[i] ?? sched.total) });
  };

  const onDrop = (to: number) => {
    if (dragIndex !== null && dragIndex !== to) reorderWallScene(ci, dragIndex, to);
    setDragIndex(null);
  };

  return (
    <div className="tl wall-scenes">
      <div className="tl-toolbar">
        <button className="primary" onClick={setAsScene} title="Append the current framing as a scene (Enter)">
          ⊕ Set as scene
        </button>
        <button
          // The SAME patch the Inspector, the Storyboard card and the clip context menu apply — it
          // honours project.durationInFrames, which fixes the video's length and caps every clip.
          onClick={() => {
            const p = fitDurationPatch(useEditor.getState().project, ci);
            if (p) patchClip(ci, p);
          }}
          title="Set the clip's length to exactly what the camera schedule needs"
        >
          ⟲ Fit clip duration
        </button>
        <span className="view-toggle">
          <button className={!live ? "on" : ""} onClick={() => setLive(false)}>
            Arrange
          </button>
          <button className={live ? "on" : ""} onClick={() => setLive(true)}>
            Live
          </button>
        </span>
        <span className="sep" />
        <label className="wsc-check">
          <input type="checkbox" checked={wall.intro} onChange={(e) => patchWall(ci, { intro: e.target.checked })} /> intro
        </label>
        <label className="wsc-check">
          <input type="checkbox" checked={wall.outro} onChange={(e) => patchWall(ci, { outro: e.target.checked })} /> outro
        </label>
        <span className="tl-readout muted">
          {sched.total}f · {(sched.total / fps).toFixed(1)}s · clip {clip.durationInFrames}f ·{" "}
          {fit ? <span className={"wsc-fit " + fit.state}>{fit.label}</span> : null}
        </span>
      </div>

      <div className="wsc-strip">
        {/* Timing card: what each part of the schedule contributes to the total. */}
        <div className="wsc-card wsc-timing">
          <div className="wsc-card-head">Timing</div>
          <div className="muted">
            intro {(sched.sceneFrames[0] ?? 0) / fps > 0 ? ((sched.sceneFrames[0] ?? 0) / fps).toFixed(1) : "0.0"}s
            <br />
            scenes{" "}
            {(
              Math.max(0, (sched.sceneEnds[scenes.length - 1] ?? sched.total) - (sched.sceneFrames[0] ?? 0)) / fps
            ).toFixed(1)}
            s
            <br />
            outro {(Math.max(0, sched.total - (sched.sceneEnds[scenes.length - 1] ?? sched.total)) / fps).toFixed(1)}s
            <br />= {(sched.total / fps).toFixed(1)}s ({sched.total}f)
          </div>
          <div className="wsc-mini">
            <WallMiniMap wall={wall} W={W} H={H} fps={fps} width={148} height={84} cam={wallCam} onJump={(p) => setWallCam({ ...wallCam, x: p.x, y: p.y })} />
          </div>
          <span className="muted wsc-hint">Camera navigation is not undoable; scene keyframes are.</span>
        </div>

        {scenes.length === 0 && (
          <div className="wsc-card wsc-empty muted">Frame the viewport, then ⊕ Set as scene.</div>
        )}

        {scenes.map((s, i) => {
          const a = prevCam(i);
          const b = camFromScene(s);
          const introGlide = i === 0;
          const glideLive = introGlide ? wall.intro : true;
          const v = peakVelocity(a, b, s.glideSeconds, fps);
          const suggested = suggestGlideSeconds(a, b);
          const via = s.holdSeconds === 0;
          const dist = Math.round(Math.hypot(b.x - a.x, b.y - a.y) * ((a.zoom + b.zoom) / 2));
          return (
            <div
              key={i}
              className={"wsc-card" + (via ? " via" : "") + (dragIndex === i ? " dragging" : "")}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(i)}
            >
              <div className="wsc-card-head" draggable onDragStart={() => setDragIndex(i)} onDragEnd={() => setDragIndex(null)}>
                <span className="wsc-idx">{i + 1}</span>
                <CommitText
                  className="wsc-name"
                  value={s.name ?? ""}
                  placeholder={`x ${Math.round(s.x)} y ${Math.round(s.y)}`}
                  onCommit={(v2) => patchWallScene(ci, i, { name: v2 })}
                />
                <button className="del" title="Delete scene" onClick={() => removeWallScene(ci, i)}>
                  ×
                </button>
              </div>

              {!via && (
                <div className="wsc-mini">
                  <WallMiniMap wall={wall} W={W} H={H} fps={fps} width={148} height={84} highlight={i} onJump={undefined} />
                </div>
              )}

              <div className="wsc-row">
                <label className="muted">hold</label>
                <CommitNum value={s.holdSeconds} min={0} step={0.1} onCommit={(n) => patchWallScene(ci, i, { holdSeconds: n })} />
                <span className="muted">{Math.round(s.holdSeconds * fps)}f</span>
              </div>
              <div className="wsc-row">
                {/* Scene 0's glide IS the intro glide — the field is relabelled when intro is on
                    and greyed with a hint when it is off, so it always has exactly one meaning. */}
                <label className={"muted" + (glideLive ? "" : " sld-disabled")} title={glideLive ? undefined : "no glide into the first scene"}>
                  {introGlide ? "intro glide" : "glide"}
                </label>
                <CommitNum
                  value={s.glideSeconds}
                  min={0}
                  step={0.1}
                  disabled={!glideLive}
                  title={glideLive ? undefined : "no glide into the first scene (intro is off)"}
                  onCommit={(n) => patchWallScene(ci, i, { glideSeconds: n })}
                />
                <span className="muted">{glideLive ? `${Math.round(s.glideSeconds * fps)}f` : "off"}</span>
              </div>
              <div className="wsc-row">
                <select
                  value={s.easing}
                  title="smooth = zero acceleration at both ends · cubic nearly doubles peak speed · settle overshoots (use at ≥ 1.0 s)"
                  onChange={(e) => patchWallScene(ci, i, { easing: e.target.value as WallScene["easing"] })}
                >
                  {EASINGS.map((e2) => (
                    <option key={e2} value={e2}>
                      {e2}
                    </option>
                  ))}
                </select>
                <input
                  type="range"
                  min={-1}
                  max={1}
                  step={0.05}
                  value={s.arc}
                  title={`arc ${s.arc} — the bow of the path (sign picks the side of travel)`}
                  onChange={(e) => patchWallScene(ci, i, { arc: +e.target.value })}
                />
              </div>

              {glideLive && s.glideSeconds > 0 && dist > 0 ? (
                <button
                  className={"wsc-speed " + speedClass(v)}
                  title={`${s.glideSeconds}s over ${dist} screen px — ${v.toFixed(0)} px/frame. Suggested ${suggested.toFixed(2)}s. Click to apply.`}
                  onClick={() => patchWallScene(ci, i, { glideSeconds: Math.round(suggested * 100) / 100 })}
                >
                  ● {v.toFixed(0)} px/f
                </button>
              ) : (
                <span className="muted wsc-speed flat">{glideLive ? (dist ? "cut" : "no travel") : "no glide"}</span>
              )}

              <div className="wsc-actions">
                <button title="Jump the viewport to this pose" onClick={() => setWallCam(b)}>
                  ⌖
                </button>
                <button
                  title="Update this scene's framing from the viewport (timing kept)"
                  onClick={() => patchWallScene(ci, i, { x: wallCam.x, y: wallCam.y, zoom: wallCam.zoom, rotation: wallCam.rot })}
                >
                  ⟳
                </button>
                <button title="Play from here (Live)" onClick={() => playFrom(i)}>
                  ▸
                </button>
                <button title="Duplicate scene" onClick={() => addWallScene(ci, { ...s }, i + 1)}>
                  ⧉
                </button>
                <button disabled={i === 0} title="Move earlier" onClick={() => reorderWallScene(ci, i, i - 1)}>
                  ◀
                </button>
                <button disabled={i === scenes.length - 1} title="Move later" onClick={() => reorderWallScene(ci, i, i + 1)}>
                  ▶
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
