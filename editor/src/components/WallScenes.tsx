// Wall scenes strip — the SLIDE SORTER, in the footer where the timeline lives in Edit.
// Footer = time, right rail = properties: the same mapping as the Edit shell.
//
//   1. Pan / zoom / roll until the recorded-frame rectangle contains what you want.
//   2. Drop photos, arrange them, set treatment / filter / depth / caption / motions.
//   3. ⊕ Set as scene  (Enter) — appends the pose with a glide duration a motion designer would
//      sign off (suggestGlideSeconds targets peak px/SECOND, so it is fps-independent).
//   4. Pan to the next area, repeat.   5. ⟲ Fit clip duration (or leave auto-fit on).
//
// Each card is a scene: thumb + name + an inline HOLD box (seconds). Between cards sits an arrow
// connector with the GLIDE box for the move into the next scene and its speed dot — the two
// numbers the user actually tunes, typed straight into the strip. CLICKING A CARD SELECTS THE
// SCENE (by stable id) and jumps the camera to it; easing, arc and the rest live in the
// inspector's `Scene` section. ▶ Preview all plays the whole schedule in Live mode. Drag a card to
// reorder. Scene refs on items are by id, so reordering never re-targets a prop.
import React, { useMemo, useState } from "react";
import { useEditor } from "../store";
import { peakVelocity, suggestGlideSeconds } from "../../../src/timeline/wall";
import { appendedScene, camFromScene, fitDurationPatch, hoverEndCam, scheduleWall, speedClass, wallFitFor, wallOf } from "../lib/wall-edit";
import { WallMiniMap } from "./WallMiniMap";
import { CommitNum } from "./WallInspector";

const HOVER_LABEL: Record<string, string> = { pushIn: "push in", pullOut: "pull out", left: "drift ←", right: "drift →", up: "drift ↑", down: "drift ↓" };

export const WallScenes: React.FC = () => {
  const project = useEditor((s) => s.project);
  const wallClip = useEditor((s) => s.wallClip);
  const wallCam = useEditor((s) => s.wallCam);
  const setWallCam = useEditor((s) => s.setWallCam);
  const wallScene = useEditor((s) => s.wallScene);
  const setWallScene = useEditor((s) => s.setWallScene);
  const select = useEditor((s) => s.select);
  const live = useEditor((s) => s.wallLive);
  const setLive = useEditor((s) => s.setWallLive);
  const addWallScene = useEditor((s) => s.addWallScene);
  const patchWallScene = useEditor((s) => s.patchWallScene);
  const reorderWallScene = useEditor((s) => s.reorderWallScene);
  const requestSeek = useEditor((s) => s.requestSeek);
  const patchWall = useEditor((s) => s.patchWall);
  const patchClip = useEditor((s) => s.patchClip);
  const autoFit = useEditor((s) => s.wallAutoFit);
  const setAutoFit = useEditor((s) => s.setWallAutoFit);
  const flash = useEditor((s) => s.flash);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const clip = wallClip != null ? project.clips?.[wallClip] : undefined;
  const isWall = wallClip != null && !!clip && clip.type === "wall";
  const fps = project.fps ?? 30;
  const W = project.width ?? 1920;
  const H = project.height ?? 1080;
  // MEMOISED, and computed BEFORE the early return so the hook order is stable. `scheduleWall`
  // runs `fitAll`, which is two 80-iteration ternary searches over every item — this strip
  // re-renders on every camera move.
  const wall = useMemo(() => (isWall ? wallOf(clip) : wallOf(undefined)), [isWall, clip]);
  const sched = useMemo(() => scheduleWall(wall, fps, W, H), [wall, fps, W, H]);
  const fit = useMemo(() => (isWall ? wallFitFor(project, wallClip) : null), [isWall, project, wallClip]);
  if (!isWall || wallClip == null || !clip) {
    return <div className="muted pad">No wall clip selected.</div>;
  }
  const ci = wallClip;
  const scenes = wall.scenes ?? [];

  /** The pose a scene glides FROM: the previous scene, or the whole-wall fit pose for scene 0. */
  const prevCam = (i: number) => (i === 0 ? sched.whole : hoverEndCam(scenes[i - 1]));

  const setAsScene = () => {
    addWallScene(ci, appendedScene(wall, wallCam));
    flash(`Scene ${scenes.length + 1} set`);
  };

  /** Click = select the scene (inspector shows its timing) + jump the camera to its pose. A
   *  selected scene replaces an item selection so the right rail shows exactly one thing. */
  const pick = (i: number) => {
    const s = scenes[i];
    if (!s) return;
    setWallScene(s.id ?? null);
    select({ kind: "clip", index: ci });
    setWallCam(camFromScene(s));
  };

  /** Play the whole schedule in Live mode. Live shows JUST the wall (liveWallProject), so the clip
   *  starts at Player frame 0 and the schedule's own frames are the seek targets. */
  const previewAll = () => {
    setLive(true);
    requestSeek(0, { play: true, until: sched.total });
  };
  /** Back to Arrange (the editor): the Player drops the live take and shows the authoring camera. */
  const stopPreview = () => setLive(false);

  const onDrop = (to: number) => {
    if (dragIndex !== null && dragIndex !== to) reorderWallScene(ci, dragIndex, to);
    setDragIndex(null);
  };

  const secs = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

  return (
    <div className="tl wall-scenes">
      <div className="tl-toolbar">
        <button className="primary" onClick={setAsScene} title="Append the current framing as a scene (Enter)">
          ⊕ Set as scene
        </button>
        {live ? (
          <button className="stop" onClick={stopPreview} title="Stop the preview and go back to arranging (Esc)">
            ■ Stop preview
          </button>
        ) : (
          <button onClick={previewAll} disabled={!scenes.length} title="Play every scene in order (Live mode) — how they string together">
            ▶ Preview all
          </button>
        )}
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
        <label className="wsc-check" title="Keep the clip exactly as long as the camera schedule — refits after every scene edit (same undo step). Dragging the block on the timeline still overrides it until the next scene edit.">
          <input type="checkbox" checked={autoFit} onChange={(e) => setAutoFit(e.target.checked)} /> auto-fit
        </label>
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
          {scenes.length} scene{scenes.length === 1 ? "" : "s"} · {secs(sched.total / fps)}s ({sched.total}f) · clip{" "}
          {clip.durationInFrames}f {fit ? <span className={"wsc-fit " + fit.state}>{fit.label}</span> : null}
        </span>
      </div>

      <div className="wsc-strip">
        {/* Overview card: the whole wall with every frustum + glide path; click to jump. */}
        <div className="wsc-card wsc-timing">
          <div className="wsc-card-head">Overview</div>
          <div className="wsc-mini">
            <WallMiniMap wall={wall} W={W} H={H} fps={fps} width={148} height={84} cam={wallCam} onJump={(p) => setWallCam({ ...wallCam, x: p.x, y: p.y })} />
          </div>
          <div className="muted">
            intro {secs((sched.sceneFrames[0] ?? 0) / fps)}s · scenes{" "}
            {secs(Math.max(0, (sched.sceneEnds[scenes.length - 1] ?? sched.total) - (sched.sceneFrames[0] ?? 0)) / fps)}s · outro{" "}
            {secs(Math.max(0, sched.total - (sched.sceneEnds[scenes.length - 1] ?? sched.total)) / fps)}s
          </div>
          <span className="muted wsc-hint">Type hold / glide seconds right on the strip. Click a card for more. Drag to reorder.</span>
        </div>

        {scenes.length === 0 && (
          <div className="wsc-card wsc-empty muted">Frame the viewport, then ⊕ Set as scene.</div>
        )}

        {scenes.map((s, i) => {
          const a = prevCam(i);
          const b = camFromScene(s);
          const glideLive = i === 0 ? wall.intro : true;
          const v = peakVelocity(a, b, s.glideSeconds, fps);
          const suggested = suggestGlideSeconds(a, b);
          const dist = Math.round(Math.hypot(b.x - a.x, b.y - a.y) * ((a.zoom + b.zoom) / 2));
          const via = s.holdSeconds === 0;
          const on = !!s.id && s.id === wallScene;
          const startsAt = secs((sched.sceneFrames[i] ?? 0) / fps);
          const appearing = (wall.items ?? []).filter((it) => it.appearIn === s.id).length;
          const stop = (e: React.SyntheticEvent) => e.stopPropagation();
          return (
            <React.Fragment key={s.id ?? i}>
              {/* Connector: the glide INTO this scene (for scene 0 the intro glide, when intro is on). */}
              <div
                className={"wsc-arrow" + (glideLive ? "" : " off")}
                title={
                  glideLive
                    ? `Glide into scene ${i + 1}${dist ? ` — ${dist} screen px, ${v.toFixed(0)} px/frame peak. Suggested ${suggested.toFixed(2)}s (click the dot to apply).` : ""}`
                    : "No glide into the first scene (intro is off)"
                }
              >
                <span className="wsc-arrow-line">{i === 0 ? "intro" : ""}→</span>
                <span className="wsc-arrow-box" onClick={stop} onPointerDown={stop}>
                  <CommitNum
                    value={s.glideSeconds}
                    min={0}
                    step={0.1}
                    suffix="s"
                    disabled={!glideLive}
                    onCommit={(n) => patchWallScene(ci, i, { glideSeconds: n })}
                  />
                </span>
                {glideLive && s.glideSeconds > 0 && dist > 0 ? (
                  <button
                    className={"wsc-dot-btn " + speedClass(v)}
                    onClick={(e) => {
                      e.stopPropagation();
                      patchWallScene(ci, i, { glideSeconds: Math.round(suggested * 100) / 100 });
                    }}
                    title={`${v.toFixed(0)} px/frame — click to use the suggested ${suggested.toFixed(2)}s`}
                  >
                    ● {v.toFixed(0)}
                  </button>
                ) : (
                  <span className="muted wsc-dot-btn flat">{glideLive ? (dist ? "cut" : "still") : "off"}</span>
                )}
              </div>

              <div
                className={"wsc-card" + (via ? " via" : "") + (on ? " on" : "") + (dragIndex === i ? " dragging" : "")}
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragEnd={() => setDragIndex(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(i)}
                onClick={() => pick(i)}
                title={`Scene ${i + 1} — starts at ${startsAt}s. Click to select and jump the camera.`}
              >
                <div className="wsc-card-head">
                  <span className="wsc-idx">{i + 1}</span>
                  <span className="wsc-name-ro">{s.name || `x ${Math.round(s.x)} y ${Math.round(s.y)}`}</span>
                </div>
                {!via && (
                  <div className="wsc-mini">
                    <WallMiniMap wall={wall} W={W} H={H} fps={fps} width={148} height={84} highlight={i} onJump={undefined} />
                  </div>
                )}
                <div className="wsc-meta" onClick={stop} onPointerDown={stop}>
                  <span className="muted">hold</span>
                  <CommitNum value={s.holdSeconds} min={0} step={0.1} suffix="s" onCommit={(n) => patchWallScene(ci, i, { holdSeconds: n })} />
                  {via ? <span className="muted">via</span> : null}
                </div>
                <div className="wsc-meta muted">
                  @ {startsAt}s{s.hover && s.hover !== "none" ? ` · ${HOVER_LABEL[s.hover] ?? s.hover}` : ""}
                  {appearing ? ` · +${appearing} appear` : ""}
                </div>
              </div>
            </React.Fragment>
          );
        })}
        {scenes.length > 0 && wall.outro ? (
          <div className="wsc-arrow" title="Outro: glide back out to the whole wall (Wall settings)">
            <span className="wsc-arrow-line">→ outro</span>
            <span className="muted">{secs(wall.outroSeconds)}s</span>
          </div>
        ) : null}
      </div>
    </div>
  );
};
