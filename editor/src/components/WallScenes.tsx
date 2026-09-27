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
import React, { useEffect, useMemo, useRef, useState } from "react";
import { selectedSceneIds, useEditor } from "../store";
import { peakVelocity, suggestGlideSeconds } from "../../../src/timeline/wall";
import { DEFAULT_GLIDE_SECONDS, DEFAULT_SCENE, appendedScene, camFromScene, fitDurationPatch, hoverEndCam, insertedScene, lockedGlideTarget, sceneSlot, scheduleWall, speedClass, wallFitFor, wallOf, withSceneSlot, withTimingApplied, type TimingPatch } from "../lib/wall-edit";
import type { WallSchedule } from "../../../src/timeline/wall";
import { getLiveFrame, subscribeLiveFrame, useLiveFrameSelect } from "../lib/live-frame";
import { WallMiniMap } from "./WallMiniMap";
import { WallSceneThumb } from "./WallSceneThumb";
import { CommitNum } from "./WallInspector";

/** Where the Live playhead is: the scene it is ARRIVING at or holding (the glide into scene i counts
 *  as scene i), and whether it is still in that glide. −1 before the first glide starts. */
const livePhase = (sched: WallSchedule, n: number, f: number): { i: number; glide: boolean; frac: number; outro: boolean } | null => {
  if (f < 0 || !n) return null;
  const glideStart = (i: number) => (i === 0 ? 0 : (sched.sceneEnds[i - 1] ?? 0));
  let i = 0;
  while (i + 1 < n && f >= glideStart(i + 1)) i++;
  const gs = glideStart(i);
  const at = sched.sceneFrames[i] ?? 0;
  const end = sched.sceneEnds[i] ?? at;
  if (f < at) return { i, glide: true, frac: at > gs ? (f - gs) / (at - gs) : 1, outro: false };
  if (f < end || i < n - 1) return { i, glide: false, frac: end > at ? Math.min(1, (f - at) / (end - at)) : 1, outro: false };
  const total = sched.total;
  return { i, glide: false, frac: total > end ? Math.min(1, (f - end) / (total - end)) : 1, outro: true };
};

const HOVER_LABEL: Record<string, string> = { toward: "creep → next", pushIn: "push in", pullOut: "pull out", left: "drift ←", right: "drift →", up: "drift ↑", down: "drift ↓" };

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
  const stepWallScene = useEditor((s) => s.stepWallScene);
  const patchWall = useEditor((s) => s.patchWall);
  const patchClip = useEditor((s) => s.patchClip);
  const autoFit = useEditor((s) => s.wallAutoFit);
  const setAutoFit = useEditor((s) => s.setWallAutoFit);
  const flash = useEditor((s) => s.flash);
  const wallSceneSel = useEditor((s) => s.wallSceneSel);
  const setWallSceneSel = useEditor((s) => s.setWallSceneSel);
  const lock = useEditor((s) => s.wallLockBeats);
  const setLock = useEditor((s) => s.setWallLockBeats);
  const retime = useEditor((s) => s.retimeWallScenes);
  const removeScenes = useEditor((s) => s.removeWallScenes);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  // Keep the selected card in view: with 20+ scenes the strip is wider than the window and ‹ › /
  // PgUp-PgDn would otherwise step onto cards you cannot see. `block: "nearest"` so only the strip
  // scrolls, never the page.
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!wallScene || !stripRef.current) return;
    const el = stripRef.current.querySelector<HTMLElement>(`[data-scene-id="${wallScene}"]`);
    el?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [wallScene]);

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
  const nScenes = (wall.scenes ?? []).length;
  // Live playhead: the strip re-renders only when the PLAYING SCENE changes; the needle moves
  // imperatively on every frame (see lib/live-frame.ts).
  const liveIdx = useLiveFrameSelect((f) => (live ? (livePhase(sched, nScenes, f)?.i ?? -1) : -1));
  const needleRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const strip = stripRef.current;
    const needle = needleRef.current;
    if (!live || !strip || !needle) return;
    const place = () => {
      const ph = livePhase(sched, nScenes, getLiveFrame());
      const el = ph
        ? strip.querySelector<HTMLElement>(ph.outro ? "[data-outro]" : ph.glide ? `[data-glide-idx="${ph.i}"]` : `[data-card-idx="${ph.i}"]`)
        : null;
      if (!ph || !el) {
        needle.style.display = "none";
        return;
      }
      needle.style.display = "block";
      needle.style.transform = `translateX(${el.offsetLeft + ph.frac * el.offsetWidth}px)`;
    };
    place();
    return subscribeLiveFrame(place);
  }, [live, sched, nScenes]);
  // Follow the take: keep the playing card in view (same rule as the selection scroll below).
  useEffect(() => {
    if (liveIdx < 0 || !stripRef.current) return;
    stripRef.current.querySelector<HTMLElement>(`[data-card-idx="${liveIdx}"]`)?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [liveIdx]);
  const fit = useMemo(() => (isWall ? wallFitFor(project, wallClip) : null), [isWall, project, wallClip]);
  if (!isWall || wallClip == null || !clip) {
    return <div className="muted pad">No wall clip selected.</div>;
  }
  const ci = wallClip;
  const scenes = wall.scenes ?? [];
  const selIds = selectedSceneIds({ wallScene, wallSceneSel });
  const multi = selIds.length > 1;

  /** Every hold / glide edit on the strip goes through here, so 🔒 lock beats applies to all of them. */
  const retimeOne = (i: number, patch: TimingPatch) => {
    const id = scenes[i]?.id;
    if (!id) return;
    const r = retime(ci, [id], patch);
    if (lock && r.capped) flash("Lock beats: not enough time in the neighbouring hold / glide — took what was there");
    else if (lock && r.rippled) flash("Lock beats: nothing to borrow from here, so the scenes after it moved");
  };

  /** Selected scenes, deleted in one undo step. */
  const deleteSelected = () => {
    if (!selIds.length) return;
    removeScenes(ci, selIds);
    flash(`${selIds.length} scene${selIds.length === 1 ? "" : "s"} deleted (Ctrl+Z to undo)`);
  };

  /** The pose a scene glides FROM: the previous scene, or the whole-wall fit pose for scene 0. */
  const prevCam = (i: number) => (i === 0 ? sched.whole : hoverEndCam(scenes[i - 1], camFromScene(scenes[i])));

  const setAsScene = () => {
    addWallScene(ci, appendedScene(wall, wallCam));
    flash(`Scene ${scenes.length + 1} set`);
  };

  /** Insert a scene at `at` (0 = before scene 1) from the current viewport — or halfway between the
   *  neighbours when the viewport is still parked on one of them (see wall-edit#insertedScene).
   *  Everything after it moves later by the new scene's hold + glide; the toast says by how much so
   *  a beat-timed edit knows what it just shifted. */
  const insertAt = (at: number) => {
    const { scene, midpoint } = insertedScene(wall, wallCam, at);
    addWallScene(ci, scene, at);
    if (midpoint) setWallCam(camFromScene(scene));
    const shift = (scene.holdSeconds ?? 0) + (scene.glideSeconds ?? 0);
    flash(
      `Scene ${at + 1} inserted${midpoint ? " halfway between its neighbours — frame it, then ⟳ Re-frame" : " from the viewport"}` +
        (at < scenes.length ? ` · scenes after it start ${secs(shift)}s later` : ""),
    );
  };

  /** Click = select the scene (inspector shows its timing) + jump the camera to its pose. A
   *  selected scene replaces an item selection so the right rail shows exactly one thing. */
  const pick = (i: number) => {
    const s = scenes[i];
    if (!s) return;
    setWallScene(s.id ?? null);
    select({ kind: "clip", index: ci });
    setWallCam(camFromScene(s));
    // In Live the camera is the take's, so a click SEEKS the take to that scene's arrival instead.
    if (live) requestSeek(sched.sceneFrames[i] ?? 0);
  };

  /** Card click: plain = select one; Shift = range from the selected scene; Ctrl/⌘ = toggle. */
  const clickCard = (i: number, e: React.MouseEvent) => {
    const s = scenes[i];
    if (!s?.id) return;
    if (e.shiftKey && selIdx >= 0) {
      const [a, b] = selIdx < i ? [selIdx, i] : [i, selIdx];
      const ids = scenes.slice(a, b + 1).flatMap((sc) => (sc.id ? [sc.id] : []));
      setWallSceneSel(ids, wallScene);
      select({ kind: "clip", index: ci });
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      const has = selIds.includes(s.id);
      const ids = has ? selIds.filter((id) => id !== s.id) : [...selIds, s.id];
      // Keep a primary that is still selected; toggling the primary off hands it to another one.
      const primary = has ? (s.id === wallScene ? (ids[ids.length - 1] ?? null) : wallScene) : (wallScene ?? s.id);
      setWallSceneSel(ids, primary);
      select({ kind: "clip", index: ci });
      return;
    }
    pick(i);
  };

  /** Play the whole schedule in Live mode. Live shows JUST the wall (liveWallProject), so the clip
   *  starts at Player frame 0 and the schedule's own frames are the seek targets. */
  const previewAll = () => {
    setLive(true);
    requestSeek(0, { play: true, until: sched.total });
  };
  /** Back to Arrange (the editor): the Player drops the live take and shows the authoring camera. */
  const stopPreview = () => setLive(false);

  /** ⟳ Re-frame: overwrite the SELECTED scene's framing (x / y / zoom / rotation) with the current
   *  viewport camera, keeping its hold, glide, hover and easing. The pair with ⊕ Set as scene:
   *  set once, then tweak the framing as often as you like. */
  const selIdx = scenes.findIndex((s) => s.id != null && s.id === wallScene);
  const reframe = () => {
    if (selIdx < 0) return;
    patchWallScene(ci, selIdx, { x: wallCam.x, y: wallCam.y, zoom: wallCam.zoom, rotation: wallCam.rot });
    flash(`Scene ${selIdx + 1} re-framed from the viewport`);
  };

  const onDrop = (to: number) => {
    if (dragIndex !== null && dragIndex !== to) reorderWallScene(ci, dragIndex, to);
    setDragIndex(null);
  };

  const secs = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

  return (
    <div className="tl wall-scenes">
      <div className="tl-toolbar">
        <button className="primary" onClick={setAsScene} title="Append the current framing as a NEW scene at the end (Enter). To put one in the middle, use the + on a connector between two cards, or Ctrl+Enter to insert after the selected scene.">
          ⊕ Set as scene
        </button>
        <button
          onClick={() => insertAt(selIdx + 1)}
          disabled={selIdx < 0 || selIdx >= scenes.length - 1}
          title={
            selIdx < 0
              ? "Select a scene card first"
              : selIdx >= scenes.length - 1
                ? "The last scene is selected — ⊕ Set as scene appends"
                : `Insert the current framing as a new scene between ${selIdx + 1} and ${selIdx + 2} (Ctrl+Enter)`
          }
        >
          ⊕ Insert after {selIdx >= 0 ? selIdx + 1 : ""}
        </button>
        <button
          onClick={reframe}
          disabled={selIdx < 0}
          title={selIdx < 0 ? "Select a scene card first" : `Update scene ${selIdx + 1}'s framing from the viewport — timing kept (Shift+Enter)`}
        >
          ⟳ Re-frame {selIdx >= 0 ? selIdx + 1 : ""}
        </button>
        {/* ‹ › step the selected scene (and scroll its card into view) — the strip is wider than
            the window past ~8 scenes, and dragging its scrollbar to find a card is the slow way. */}
        <span className="view-toggle" title="Previous / next scene — selects it, jumps the camera and scrolls the strip to it (PgUp / PgDn)">
          <button disabled={!scenes.length || selIdx <= 0} onClick={() => stepWallScene(-1)} aria-label="Previous scene">
            ‹
          </button>
          <span className="muted" style={{ padding: "0 6px", minWidth: 52, textAlign: "center", display: "inline-block" }}>
            {selIdx >= 0 ? `${selIdx + 1} / ${scenes.length}` : `– / ${scenes.length}`}
          </span>
          <button disabled={!scenes.length || selIdx >= scenes.length - 1} onClick={() => stepWallScene(1)} aria-label="Next scene">
            ›
          </button>
        </span>
        {live ? (
          <button className="stop" onClick={stopPreview} title="Stop the preview and go back to arranging (Esc)">
            ■ Stop preview
          </button>
        ) : (
          <button onClick={previewAll} disabled={!scenes.length} title="Play every scene in order from the top (Live mode) — how they string together. To start at one scene, select its card and press ▶ Live in the nav bar.">
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
        <label
          className="wsc-check"
          title="Lock beats: keep every scene's ARRIVAL time when you change a hold or a glide. A longer glide takes its time from the hold before it; a longer hold takes it from the glide after it — so scenes you timed to the beat stay on the beat. Off = the edit pushes every later scene. (The ⏱ slot box on a card always pushes: it is the 'make this scene last N seconds' edit.)"
        >
          <input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} /> 🔒 lock beats
        </label>
        {selIds.length > 0 && !live ? (
          <button className="danger" onClick={deleteSelected} title="Delete the selected scene card(s) — Delete key; one Ctrl+Z restores them. Photos are not touched.">
            ✕ Delete {multi ? `${selIds.length} scenes` : `scene ${selIdx + 1}`}
          </button>
        ) : null}
        <span className="view-toggle">
          <button className={!live ? "on" : ""} onClick={() => setLive(false)}>
            Arrange
          </button>
          <button className={live ? "on" : ""} onClick={() => setLive(true)}>
            Live
          </button>
        </span>
        <span className="sep" />
        {/* Wall-wide timing defaults: every NEW scene takes these; Apply to all rewrites every scene. */}
        <span className="wsc-defaults" title="Defaults for every new scene (⊕ Set as scene). Apply to all overwrites every existing scene's hold and glide in one undo step.">
          <span className="muted">defaults: hold</span>
          <CommitNum
            value={wall.defaultHoldSeconds ?? DEFAULT_SCENE.holdSeconds}
            min={0}
            step={0.1}
            suffix="s"
            onCommit={(n) => patchWall(ci, { defaultHoldSeconds: n })}
          />
          <span className="muted">glide</span>
          <CommitNum
            value={wall.defaultGlideSeconds ?? DEFAULT_GLIDE_SECONDS}
            min={0}
            step={0.1}
            suffix="s"
            onCommit={(n) => patchWall(ci, { defaultGlideSeconds: n })}
          />
          <span className="muted">land</span>
          <CommitNum
            value={Math.round((wall.flowLand ?? 0.35) * 100)}
            min={-60}
            max={60}
            step={5}
            suffix="%"
            disabled={!wall.flow}
            title={
              (wall.flow ? "" : "Needs flow ON. ") +
              "Landing, wall-wide. POSITIVE = the share of each glide's time spent slowing into the next scene's drift before the scene point (settles earlier, dwell reads longer). NEGATIVE = a lead: the glide lands that share of the hop SHORT of the scene point and the slow drift carries the camera through it — the fast part covers less distance in the same time, so it is slower, and the scene point is passed mid-drift. 0 = meets the drift speed on the last frame, right on the scene point. The scene cycle (hold + glide) never changes."
            }
            onCommit={(n) => patchWall(ci, { flowLand: Math.max(-0.6, Math.min(0.6, n / 100)) })}
          />
          <button
            disabled={!scenes.length}
            onClick={() => {
              const hold = wall.defaultHoldSeconds ?? DEFAULT_SCENE.holdSeconds;
              const glide = wall.defaultGlideSeconds ?? DEFAULT_GLIDE_SECONDS;
              patchWall(ci, withTimingApplied(wall, hold, glide));
              flash(`All ${scenes.length} scenes: hold ${hold}s · glide ${glide}s (Ctrl+Z to undo)`);
            }}
            title="Write these defaults onto every scene's hold and glide (one undo step)"
          >
            Apply to all
          </button>
        </span>
        <span className="sep" />
        <label
          className="wsc-check"
          title="Seamless flow: the camera never stops — each hold drifts at a steady pace and the glides depart and land AT that pace (fast in the middle, decelerating straight into the slow drift). Overrides the glide easings."
        >
          <input type="checkbox" checked={!!wall.flow} onChange={(e) => patchWall(ci, { flow: e.target.checked || undefined })} /> flow
        </label>
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

      <div className="wsc-strip" ref={stripRef}>
        {live ? <div className="wsc-needle" ref={needleRef} aria-hidden /> : null}
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
          <span className="muted wsc-hint">Type hold / glide seconds right on the strip. Click a card for more; Shift / Ctrl-click to select several. Drag to reorder.</span>
        </div>

        {scenes.length === 0 && (
          <div className="wsc-card wsc-empty muted">Frame the viewport, then ⊕ Set as scene.</div>
        )}

        {scenes.map((s, i) => {
          const a = prevCam(i);
          const b = camFromScene(s);
          const glideLive = i === 0 ? wall.intro : true;
          // Both in 1920-wide pixels (wall.ts#SPEED_REF_WIDTH), so a 4K project's dots mean the same
          // as a 1080p one's instead of reading twice as fast.
          const v = peakVelocity(a, b, s.glideSeconds, fps, W);
          const suggested = suggestGlideSeconds(a, b, W);
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
                data-glide-idx={i}
                className={"wsc-arrow" + (glideLive ? "" : " off")}
                title={
                  glideLive
                    ? `Glide into scene ${i + 1}${dist ? ` — ${dist} screen px, ${v.toFixed(0)} px/frame peak (1080p-equivalent). Suggested ${suggested.toFixed(2)}s (click the dot to apply).` : ""}`
                    : "No glide into the first scene (intro is off)"
                }
              >
                {!live && (
                  <button
                    className="wsc-insert"
                    title={
                      i === 0
                        ? "Insert a new scene BEFORE scene 1, from the current viewport (Ctrl+Enter inserts after the selected scene)"
                        : `Insert a new scene between ${i} and ${i + 1}, from the current viewport. If the viewport is still on scene ${i} or ${i + 1}, it goes halfway between them. Scenes after it move later by its hold + glide.`
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      insertAt(i);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    aria-label={i === 0 ? "Insert scene before scene 1" : `Insert scene between ${i} and ${i + 1}`}
                  >
                    +
                  </button>
                )}
                <button
                  className="wsc-arrow-line"
                  title={`Transition into scene ${i + 1}: click to open its settings (seconds, easing, arc) on the right`}
                  onClick={(e) => {
                    e.stopPropagation();
                    pick(i);
                    flash(`Transition into scene ${i + 1} — settings on the right`);
                  }}
                >
                  {i === 0 ? "intro" : ""}→
                </button>
                <span className="wsc-arrow-box" onClick={stop} onPointerDown={stop}>
                  <CommitNum
                    value={s.glideSeconds}
                    min={0}
                    step={0.1}
                    suffix="s"
                    disabled={!glideLive}
                    onCommit={(n) => retimeOne(i, { glideSeconds: n })}
                  />
                </span>
                {glideLive && s.glideSeconds > 0 && dist > 0 ? (
                  <button
                    className={"wsc-dot-btn " + speedClass(v)}
                    onClick={(e) => {
                      e.stopPropagation();
                      const target = lockedGlideTarget(wall, i, suggested, lock);
                      if (target == null) {
                        flash("Lock beats: no spare hold before this glide to stretch into");
                        return;
                      }
                      retimeOne(i, { glideSeconds: target });
                    }}
                    title={`${v.toFixed(0)} px/frame (1080p-equivalent) — click to use the suggested ${suggested.toFixed(2)}s${lock ? " (lock beats: capped by the hold before it)" : ""}`}
                  >
                    ● {v.toFixed(0)}
                  </button>
                ) : (
                  <span className="muted wsc-dot-btn flat">{glideLive ? (dist ? "cut" : "still") : "off"}</span>
                )}
              </div>

              <div
                className={
                  "wsc-card" +
                  (via ? " via" : "") +
                  (on ? " on" : "") +
                  (s.id && multi && selIds.includes(s.id) ? " sel" : "") +
                  (liveIdx === i ? " playing" : "") +
                  (dragIndex === i ? " dragging" : "")
                }
                data-scene-id={s.id ?? undefined}
                data-card-idx={i}
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragEnd={() => setDragIndex(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(i)}
                onClick={(e) => clickCard(i, e)}
                title={`Scene ${i + 1} — arrives at ${startsAt}s. Click to select and jump the camera${live ? " (Live: jump the take here)" : ""}; Shift-click for a range, Ctrl/⌘-click to add or remove.`}
              >
                <div className="wsc-card-head">
                  <span className="wsc-idx">{i + 1}</span>
                  <span className="wsc-name-ro">{s.name || (via ? "via" : "")}</span>
                  <span className="muted wsc-at">{startsAt}s</span>
                </div>
                {/* The scene's OWN frame — what the camera records when it gets there. */}
                <div className="wsc-mini">
                  <WallSceneThumb wall={wall} scene={s} index={i} W={W} H={H} width={148} height={Math.round((148 * H) / W)} />
                </div>
                <div className="wsc-meta" onClick={stop} onPointerDown={stop}>
                  <span className="muted">hold</span>
                  <CommitNum value={s.holdSeconds} min={0} step={0.1} suffix="s" onCommit={(n) => retimeOne(i, { holdSeconds: n })} />
                  {via ? <span className="muted">via</span> : null}
                </div>
                <div
                  className="wsc-meta"
                  onClick={stop}
                  onPointerDown={stop}
                  title={
                    i < scenes.length - 1
                      ? `Scene ${i + 1}'s slot: arrival → next arrival = hold + the glide into scene ${i + 2}. Type a total and the glide becomes total − hold. Pushes every later scene by the difference.`
                      : "The last scene's slot is its hold."
                  }
                >
                  <span className="muted">⏱ slot</span>
                  <CommitNum
                    value={Math.round(sceneSlot(wall, i) * 1000) / 1000}
                    min={0}
                    step={0.1}
                    suffix="s"
                    onCommit={(n) => patchWall(ci, { scenes: withSceneSlot(wall, i, n).scenes })}
                  />
                </div>
                {(s.hover && s.hover !== "none") || appearing ? (
                  <div className="wsc-meta muted">
                    {s.hover && s.hover !== "none" ? HOVER_LABEL[s.hover] ?? s.hover : ""}
                    {appearing ? `${s.hover && s.hover !== "none" ? " · " : ""}+${appearing} appear` : ""}
                  </div>
                ) : null}
              </div>
            </React.Fragment>
          );
        })}
        {scenes.length > 0 && wall.outro ? (
          <div className="wsc-arrow" data-outro title="Outro: glide back out to the whole wall (Wall settings)">
            <span className="wsc-arrow-line">→ outro</span>
            <span className="muted">{secs(wall.outroSeconds)}s</span>
          </div>
        ) : null}
      </div>
    </div>
  );
};
