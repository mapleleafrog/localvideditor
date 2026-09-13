// Wall view — the authoring viewport.
//
// THE VIEWPORT IS THE RENDERER. It mounts the shipping `<Player component={Timeline}>` on a derived
// project whose wall clip carries ONE synthetic scene at the authoring camera (see
// wall-edit.ts#authoringProject). There is no second renderer, no injected media components and no
// parallel CSS, so the pixels under the drag handles are produced by the code that makes the MP4 —
// an editor-only rendering bug cannot exist, and a renderer bug shows up here immediately.
//
// OVERSCAN IS A COMPOSITION-SIZE CHANGE, NEVER A ZOOM DIVIDE (design §0.4). Because the camera
// transform reads useVideoConfig(), enlarging the Player's composition to (W*k, H*k) moves the
// frame centre to (kW/2, kH/2) and every wall point lands at s + ((k-1)W/2, (k-1)H/2) — so the
// recorded frame is EXACTLY the centred W x H sub-rectangle, which WallOverlay draws bright with
// the outside dimmed. `cam.zoom` is untouched, so every zoom-dependent look term (the paper-fibre
// gain, the glide lift, the shadow scale) is bit-identical at 1x, 1.6x and 2.5x. The competing
// "divide zoom by k" formulation silently changes the fibre gain: a framing made at 2.5x overscan
// would show bare paper where the MP4 shows texture.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { Timeline } from "../../../src/timeline/Timeline";
import { useEditor, type WallOverscan } from "../store";
import { useContainFit } from "../lib/fit";
import { useAudioEnd } from "../lib/audio";
import { clipStarts, computeDuration } from "../lib/timeline-utils";
import { uploadMedia } from "../lib/api";
import { ensureProjectName } from "../lib/names";
import { imageNaturalSize, videoNaturalSize } from "../lib/image";
import { authoringProject, camFromScene, fitAll, importWidth, isWallClip, liveWallProject, newSeed, newWallItemFromAsset, spiralOffset, wallOf } from "../lib/wall-edit";
import { wallViewport, zoomAtCursor, panBy, screenPtToWall, ZOOM_MAX, ZOOM_MIN } from "../lib/wall-coords";
import { WallOverlay } from "./WallOverlay";
import { WallMiniMap } from "./WallMiniMap";

const OVERSCANS: WallOverscan[] = [1, 1.6, 2.5];
const isVideoFile = (n: string) => /\.(mp4|webm|mov|m4v)$/i.test(n);
const isMediaFile = (n: string) => /\.(png|jpe?g|gif|webp|svg|mp4|webm|mov|m4v)$/i.test(n);

/** `playerRef` is the app's single Player ref — Preview and WallView are never mounted at the same
 *  time (the view is either "edit" or "wall"), so sharing it lets the global keymap's Space toggle
 *  playback in Live mode without a second ref. */
export const WallView: React.FC<{ playerRef?: React.RefObject<PlayerRef | null> }> = ({ playerRef }) => {
  const project = useEditor((s) => s.project);
  const wallClip = useEditor((s) => s.wallClip);
  const setWallClip = useEditor((s) => s.setWallClip);
  const wallCam = useEditor((s) => s.wallCam);
  const setWallCam = useEditor((s) => s.setWallCam);
  const overscan = useEditor((s) => s.wallOverscan);
  const setOverscan = useEditor((s) => s.setWallOverscan);
  const live = useEditor((s) => s.wallLive);
  const setLive = useEditor((s) => s.setWallLive);
  const hand = useEditor((s) => s.wallHand);
  const setHand = useEditor((s) => s.setWallHand);
  const wallFramed = useEditor((s) => s.wallFramed);
  const setWallFramed = useEditor((s) => s.setWallFramed);
  const wallSel = useEditor((s) => s.wallSel);
  const selection = useEditor((s) => s.selection);
  const playhead = useEditor((s) => s.playhead);
  const seekRequest = useEditor((s) => s.seekRequest);

  const wrapRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const spaceRef = useRef(false);
  const camRef = useRef(wallCam);
  camRef.current = wallCam;
  const [dropping, setDropping] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const compW = project.width ?? 1920;
  const compH = project.height ?? 1080;
  const fps = project.fps ?? 30;
  // Measured only in Live mode — while arranging, the derived project has no audio at all, so
  // there is nothing to size against and no reason to fetch the song.
  // Live plays the real take at the real size; overscan is an arranging aid only.
  const k = live ? 1 : overscan;
  const fit = useContainFit(wrapRef, compW * k, compH * k);
  const vp = useMemo(() => wallViewport(compW, compH, k, fit.w), [compW, compH, k, fit.w]);
  // Read by the native wheel listener, which is registered once and must not close over a stale vp.
  const vpRef = useRef(vp);
  vpRef.current = vp;

  // Re-validated on EVERY render: an undo that reorders or removes clips must not leave the view
  // authoring a stale clip (the EffectBrowser pattern).
  const clip = wallClip != null ? project.clips?.[wallClip] : undefined;
  const valid = !!clip && clip.type === "wall" && wallClip != null;
  // ▶ Live plays JUST the wall (liveWallProject: the wall clip alone, audio shifted onto it) —
  // never the surrounding footage or the project's overlays. The clip therefore starts at frame 0
  // of the Player, which is what the strip's / inspector's seeks assume.
  const liveProj = useMemo(
    () => (valid && wallClip != null ? (liveWallProject(project, wallClip) ?? project) : project),
    [valid, project, wallClip],
  );
  const audioTracks = useMemo(() => (live ? (liveProj.audio ?? []) : []), [live, liveProj.audio]);
  const audioEnd = useAudioEnd(audioTracks, fps);
  const wallClips = project.clips.map((c, i) => ({ c, i })).filter(({ c }) => c.type === "wall");

  // Adopt a wall clip when the view opens on none (or on one that has gone away).
  useEffect(() => {
    if (valid) return;
    const first = wallClips[0]?.i;
    if (first != null) setWallClip(first);
  }, [valid, wallClips, setWallClip]);

  // Opening a DIFFERENT wall clip frames it: scene 1 if it has one, else the whole wall. Without
  // this, a wall authored around (2000, 900) opens on blank paper at the origin.
  //
  // "Have I framed this clip" is STORE state, not a component ref: this view unmounts on every trip
  // to Edit or Storyboard, so a ref reset the camera to scene 1 each time you came back — throwing
  // away the framing you were composing, with no undo (camera navigation is deliberately outside
  // zundo). It also lets a caller pre-frame the view: the clip context menu's "Fit camera to all
  // items" claims the clip before switching, and this effect then leaves its pose alone.
  useEffect(() => {
    if (!valid || wallClip == null) return;
    if (wallFramed === wallClip) return;
    setWallFramed(wallClip);
    const w = wallOf(project.clips[wallClip]);
    const s = (w.scenes ?? [])[0];
    setWallCam(s ? camFromScene(s) : fitAll(w.items ?? [], compW, compH, w.fitPadding ?? 0.06));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valid, wallClip, wallFramed]);

  // Space is the pan modifier while arranging. A ref, so holding it costs no re-render; App's
  // keymap preventDefaults the key but the event still reaches this window listener.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceRef.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceRef.current = false;
    };
    const blur = () => {
      spaceRef.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  // Wheel: cursor-anchored zoom, or a two-finger pan. Registered as a NATIVE NON-PASSIVE listener
  // (the pattern TimelinePanel already uses) so preventDefault actually suppresses page scroll.
  useEffect(() => {
    const el = boxRef.current;
    if (!el || live) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const cursor = { x: e.clientX - r.left, y: e.clientY - r.top };
      const cam = camRef.current;
      // A trackpad two-finger swipe carries deltaX; a mouse wheel does not. Ctrl/Alt (and the
      // pinch gesture, which arrives as ctrl+wheel) always mean zoom.
      if (!e.ctrlKey && !e.metaKey && !e.altKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        setWallCam(panBy(cam, { x: -e.deltaX, y: -e.deltaY }, vpRef.current));
        return;
      }
      setWallCam(zoomAtCursor(cam, cursor, e.deltaY, vpRef.current));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // `valid`/`fit.w` are deps because the box only exists once there IS a wall clip and a measured
    // box — without them the listener would never attach for a clip created after the view opened.
  }, [live, valid, fit.w, setWallCam]);

  // One-shot seek/play request from the Scenes strip ("Play from here"), keyed on `n` so asking
  // for the frame you are already on still re-fires. The `until` listener removes itself.
  //
  // Same consumed-nonce guard as Preview.tsx (and for the same reason — the request is never
  // cleared, so it outlives its sender): without it, `live` in the dep array made pressing ▶ Live
  // replay whichever scene was last played instead of playing from where the user is.
  const seenSeek = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    if (seenSeek.current === undefined) {
      seenSeek.current = seekRequest?.n ?? null;
      return;
    }
    if (!seekRequest || seekRequest.n === seenSeek.current) return;
    seenSeek.current = seekRequest.n;
    if (!live) return;
    const p = playerRef?.current;
    if (!p) return;
    p.seekTo(seekRequest.frame);
    if (!seekRequest.play) return;
    const until = seekRequest.until;
    p.play();
    if (until == null) return;
    const onFrame = (e: { detail: { frame: number } }) => {
      if (e.detail.frame >= until) {
        p.pause();
        p.removeEventListener("frameupdate", onFrame);
      }
    };
    p.addEventListener("frameupdate", onFrame);
    return () => p.removeEventListener("frameupdate", onFrame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekRequest?.n]);

  const derived = useMemo(
    () => (valid && wallClip != null ? authoringProject(project, wallClip, wallCam) : project),
    [valid, project, wallClip, wallCam],
  );
  const inputProps = live ? liveProj : derived;
  // Live plays the REAL take, so it must be sized the way the render is: max(clips - transitions,
  // overlay end, AUDIO end). The audio term is measured in the browser (the JSON does not carry a
  // track's length), so Live has to read it too or a song-length project stops short here while the
  // Edit preview and the MP4 run on.
  // Arranging shows the authoring camera as a STILL by default (one frame, nothing moves, cheap
  // while dragging). "Motion" loops 3 s of that same still camera so animated GIFs, video items
  // and stacked item effects can be seen moving while you place them — the camera itself does not
  // move (the derived project has one scene and no breathing), so it is still a framing tool.
  const [motion, setMotion] = useState(true);
  const ARRANGE_LOOP_FRAMES = Math.max(1, Math.round(3 * fps));
  const duration = live ? computeDuration(liveProj, audioEnd) : motion ? ARRANGE_LOOP_FRAMES : 1;

  const flash = (m: string) => {
    setNote(m);
    window.setTimeout(() => setNote((n) => (n === m ? null : n)), 3000);
  };

  /**
   * Import files onto the wall at a wall point. Multiple files fan out on a golden-angle spiral so
   * they land as a cluster rather than a stack.
   *
   * ASYNC SAFETY: after EVERY await the store is re-read and the target re-validated as a wall
   * clip, so a reorder, an undo or a delete during a 20-file upload cannot clobber another clip.
   */
  const importAt = useCallback(
    async (files: File[], at: { x: number; y: number }) => {
      const media = files.filter((f) => isMediaFile(f.name));
      if (!media.length) return;
      const ci0 = useEditor.getState().wallClip;
      if (ci0 == null || !isWallClip(useEditor.getState().project, ci0)) return;
      const proj = ensureProjectName();
      if (!proj) {
        flash("Name the project first to import media.");
        return;
      }
      flash(`Importing ${media.length} file${media.length > 1 ? "s" : ""}…`);
      let ok = 0;
      for (let n = 0; n < media.length; n++) {
        const f = media[n];
        const r = await uploadMedia(f, proj);
        if (!r.ok || !r.ref) continue;
        const url = URL.createObjectURL(f);
        const { w, h } = await (isVideoFile(f.name) ? videoNaturalSize : imageNaturalSize)(url);
        URL.revokeObjectURL(url);
        const st = useEditor.getState();
        const ci = st.wallClip;
        // Re-validated AFTER the awaits — the clip may have been reordered or removed meanwhile.
        if (ci == null || !isWallClip(st.project, ci)) {
          flash("Wall clip changed — import stopped.");
          return;
        }
        const cam = st.wallCam;
        const width = importWidth(w, st.project.width ?? 1920, cam.zoom);
        // `width` is ALREADY in wall units — dividing the fan-out by zoom again (as this used to)
        // made the ring spacing scale as 1/zoom. One shared helper, one constant (wall-edit.ts).
        const off = spiralOffset(n, width);
        st.addWallItem(
          ci,
          newWallItemFromAsset(r.ref, {
            x: at.x + off.x,
            y: at.y + off.y,
            width,
            aspect: w > 0 && h > 0 ? w / h : undefined,
            seed: newSeed(),
            label: f.name,
          }),
        );
        ok++;
      }
      flash(`Added ${ok}/${media.length} to the wall`);
    },
    [],
  );

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDropping(false);
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;
    const r = boxRef.current?.getBoundingClientRect();
    const at = r
      ? screenPtToWall({ x: e.clientX - r.left, y: e.clientY - r.top }, camRef.current, vpRef.current, 1)
      : { x: camRef.current.x, y: camRef.current.y };
    await importAt(files, at);
  };

  if (!valid || wallClip == null || !clip) {
    return (
      <div className="wall-view">
        <div className="muted pad">
          No wall clip in this project. Add one from the Topbar (<strong>+ Create a wall clip</strong>) or the
          timeline’s <strong>+ Wall</strong> button.
        </div>
      </div>
    );
  }

  const wall = wallOf(clip);
  const items = wall.items ?? [];
  // Same fallback the keymap and WallOverlay use: a bare primary selection (a right-click, say,
  // which sets `selection` but not `wallSel`) counts as a selection of one.
  const selIdx = wallSel.length
    ? wallSel
    : selection?.kind === "wallItem" && selection.clip === wallClip
      ? [selection.index]
      : [];
  const selItems = selIdx.map((i) => items[i]).filter(Boolean);
  const absStart = clipStarts(project)[wallClip] ?? 0;

  return (
    <div className="wall-view">
      <div className="wall-nav">
        <button
          title="Fit every item in the recorded frame (F)"
          onClick={() => setWallCam(fitAll(items, compW, compH, wall.fitPadding ?? 0.06))}
        >
          ⤢ Fit all
        </button>
        <button
          title="Fit the selected items (⇧F)"
          disabled={!selItems.length}
          onClick={() => setWallCam(fitAll(selItems, compW, compH, wall.fitPadding ?? 0.06))}
        >
          ⤡ Fit selection
        </button>
        <button
          className={hand ? "on" : ""}
          title="Hand tool — every drag pans (H). Space also pans while held."
          onClick={() => setHand(!hand)}
        >
          ✋
        </button>

        <span className="sep" />
        <span className="view-toggle" title="Overscan — see the wall outside the recorded frame while arranging">
          {OVERSCANS.map((o) => (
            <button key={o} className={overscan === o ? "on" : ""} disabled={live} onClick={() => setOverscan(o)}>
              {o}×
            </button>
          ))}
        </span>
        {!live && (
          <button
            className={motion ? "on" : ""}
            onClick={() => setMotion(!motion)}
            title="Loop the still camera so GIFs, video items and stacked effects animate while you arrange (turn off if dragging feels heavy)"
          >
            ⟳ Motion
          </button>
        )}
        <button
          className={live ? "stop" : ""}
          onClick={() => setLive(!live)}
          title={live ? "Stop the preview and go back to arranging (Esc)" : "Play the real camera schedule — just the wall, with the song"}
        >
          {live ? "■ Stop preview" : "▶ Live"}
        </button>

        {wallClips.length > 1 && (
          <select
            value={wallClip}
            title="Which wall clip this view is authoring"
            onChange={(e) => setWallClip(+e.target.value)}
          >
            {wallClips.map(({ i }) => (
              <option key={i} value={i}>
                Wall · clip {i + 1}
              </option>
            ))}
          </select>
        )}

        <button title="Import photos / props onto the wall at the current framing" onClick={() => fileRef.current?.click()}>
          + Photos…
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          accept="image/*,video/*"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            void importAt(files, { x: camRef.current.x, y: camRef.current.y });
          }}
        />

        <span className="spacer" />
        {note && <span className="muted">{note}</span>}
        <span className="muted wall-readout">
          x {Math.round(wallCam.x)} · y {Math.round(wallCam.y)} · {wallCam.zoom.toFixed(2)}× ·{" "}
          {wallCam.rot.toFixed(1)}° · {items.length} item{items.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="preview-fit wall-stage" ref={wrapRef}>
        <div
          className={"comp-box" + (dropping ? " dropping" : "")}
          ref={boxRef}
          style={{ width: fit.w || undefined, height: fit.h || undefined }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!dropping) setDropping(true);
          }}
          onDragLeave={(e) => {
            if (e.currentTarget === e.target) setDropping(false);
          }}
          onDrop={onDrop}
        >
          <Player
            ref={playerRef}
            component={Timeline as React.ComponentType<Record<string, unknown>>}
            inputProps={inputProps as unknown as Record<string, unknown>}
            durationInFrames={duration}
            fps={fps}
            compositionWidth={Math.round(compW * k)}
            compositionHeight={Math.round(compH * k)}
            style={{ width: "100%", height: "100%" }}
            clickToPlay={false}
            controls={live}
            autoPlay={!live && motion}
            loop={!live && motion}
          />
          {!live && fit.w > 0 && (
            <WallOverlay
              ci={wallClip}
              wall={wall}
              cam={wallCam}
              vp={vp}
              boxW={fit.w}
              boxH={fit.h}
              onCam={setWallCam}
              hand={hand}
              spaceRef={spaceRef}
              frame={playhead}
            />
          )}
        </div>

        {!live && (
          <div className="wall-mini-wrap" title="Plan view — click or drag to move the camera">
            <WallMiniMap
              wall={wall}
              W={compW}
              H={compH}
              fps={fps}
              width={228}
              height={140}
              cam={wallCam}
              onJump={(p) => setWallCam({ ...camRef.current, x: p.x, y: p.y })}
            />
            <div className="wall-mini-zoom">
              <button
                title="Zoom out"
                onClick={() => setWallCam({ ...wallCam, zoom: Math.max(ZOOM_MIN, wallCam.zoom / 1.25) })}
              >
                −
              </button>
              <span className="muted">{wallCam.zoom.toFixed(2)}×</span>
              <button
                title="Zoom in"
                onClick={() => setWallCam({ ...wallCam, zoom: Math.min(ZOOM_MAX, wallCam.zoom * 1.25) })}
              >
                +
              </button>
            </div>
          </div>
        )}
        {live && <div className="wall-live-note muted">Live — the real schedule from frame {absStart}. Press ▮ Arrange to keep editing.</div>}
      </div>
    </div>
  );
};
