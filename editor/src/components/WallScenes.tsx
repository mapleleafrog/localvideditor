// Wall scenes strip — the SLIDE SORTER, in the footer where the timeline lives in Edit.
// Footer = time, right rail = properties: the same mapping as the Edit shell.
//
//   1. Pan / zoom / roll until the recorded-frame rectangle contains what you want.
//   2. Drop photos, arrange them, set treatment / filter / depth / caption / motions.
//   3. ⊕ Set as scene  (Enter) — appends the pose with a glide duration a motion designer would
//      sign off (suggestGlideSeconds targets peak px/SECOND, so it is fps-independent).
//   4. Pan to the next area, repeat.   5. ⟲ Fit clip duration (or leave auto-fit on).
//
// Each card is a scene: thumb + name + "hold 2.4s · glide 2.6s" + the speed dot. CLICKING A CARD
// SELECTS THE SCENE (by stable id) and jumps the camera to it; its timing, easing, arc, speed chip
// and actions are edited in the inspector's `Scene` section on the right — one place, in seconds.
// Drag a card to reorder. Scene refs on items are by id, so reordering never re-targets a prop.
import React, { useMemo, useState } from "react";
import { useEditor } from "../store";
import { peakVelocity } from "../../../src/timeline/wall";
import { appendedScene, camFromScene, fitDurationPatch, scheduleWall, wallFitFor, wallOf } from "../lib/wall-edit";
import { WallMiniMap } from "./WallMiniMap";

/** How a glide reads at 30 fps (design §3.6) — the bands the chip is coloured by. */
export const speedClass = (v: number) => (v <= 18 ? "ok" : v <= 34 ? "mid" : v <= 55 ? "hot" : "bad");

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
  const reorderWallScene = useEditor((s) => s.reorderWallScene);
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
  const prevCam = (i: number) => (i === 0 ? sched.whole : camFromScene(scenes[i - 1]));

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
          <span className="muted wsc-hint">Click a scene to edit its seconds on the right. Drag to reorder.</span>
        </div>

        {scenes.length === 0 && (
          <div className="wsc-card wsc-empty muted">Frame the viewport, then ⊕ Set as scene.</div>
        )}

        {scenes.map((s, i) => {
          const a = prevCam(i);
          const b = camFromScene(s);
          const glideLive = i === 0 ? wall.intro : true;
          const v = peakVelocity(a, b, s.glideSeconds, fps);
          const dist = Math.round(Math.hypot(b.x - a.x, b.y - a.y) * ((a.zoom + b.zoom) / 2));
          const via = s.holdSeconds === 0;
          const on = !!s.id && s.id === wallScene;
          const startsAt = secs((sched.sceneFrames[i] ?? 0) / fps);
          const appearing = (wall.items ?? []).filter((it) => it.appearIn === s.id).length;
          return (
            <div
              key={s.id ?? i}
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
              <div className="wsc-meta muted">
                {via ? "via" : `hold ${secs(s.holdSeconds)}s`}
                {glideLive && s.glideSeconds > 0 ? ` · glide ${secs(s.glideSeconds)}s` : glideLive ? " · cut" : ""}
                {appearing ? ` · +${appearing}` : ""}
              </div>
              <div className="wsc-meta muted">
                @ {startsAt}s
                {glideLive && s.glideSeconds > 0 && dist > 0 ? (
                  <span className={"wsc-dot " + speedClass(v)} title={`${v.toFixed(0)} px/frame peak`}>
                    ●
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
