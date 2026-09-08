// Wall mode — the RENDERER.
//
// This file is the ONLY frame reader in the feature: one useCurrentFrame(), one useVideoConfig(),
// pure useMemo()s, ZERO useState / useEffect / rAF / timers / @keyframes. Every value on screen is
// a pure function of (frame, absStart, fps, wall, W, H), and all randomness is seededRandom(seed+k)
// with no frame term. That is the whole preview == MP4 argument at the renderer level.
//
// The maths lives in wall.ts (camera / schedule / boxes) and the CSS in wall-paper.ts (paper,
// treatments, shadows, filters, lens layers) — both pure, both shared with the editor and with
// `npm run check:wall`, so gesture maths and render maths cannot disagree.
//
// Two clocks, stated at the boundary: TransitionSeries.Sequence makes useCurrentFrame() CLIP-LOCAL
// (exactly right for the camera schedule — a wall clip's camera starts when the clip starts) and
// exactly wrong for breathing, item motions, the REC blink and the timecode, which must not reset
// at a cut. Hence the `absStart` prop.
import React, { useMemo } from "react";
import { AbsoluteFill, Img, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Gif } from "@remotion/gif";
import type { CSSProperties } from "react";
import { getMotion, stackMotions } from "../effects";
import { beatKick, clamp } from "../effects/helpers";
import type { Wall, WallItem } from "./schema";
import { resolveHandFontFamily } from "./fonts";
import {
  cameraAt,
  finite,
  itemBox,
  itemDepth,
  layerTransform,
  scheduleWall,
  visibleAt,
  type Cam,
  type WallSeg,
} from "./wall";
import {
  bloomStyle,
  fadedWashStyle,
  filterCss,
  frameCss,
  itemSeed,
  paperCoverStyle,
  paperFibreStyle,
  paperLowStyle,
  paperPreset,
  toeStyle,
  vignetteStyle,
  warmStyle,
  type PaperPreset,
} from "./wall-paper";

/** http(s) URLs pass through; everything else is a public/ asset. */
const resolveSrc = (src: string) => (/^https?:\/\//.test(src) ? src : staticFile(src));

const GIF_RE = /\.gif$/i;
const VIDEO_RE = /\.(webm|mp4|mov)$/i;
/** WebM/MOV are assumed to carry alpha unless overridden — `transparent` forces PNG frame
 *  extraction so the alpha survives (without it Remotion extracts JPEG and alpha becomes black). */
const ALPHA_RE = /\.(webm|mov)$/i;

/** <Gif> rasterises into a canvas at the given backing size and the camera then scales it, so a
 *  1x backing looks soft on any tight scene. 2x supersampling, capped at 2048 for bounded memory. */
const GIF_SS = 2;
const gifPx = (v: number) => Math.min(2048, Math.max(1, Math.round(v * GIF_SS)));

/** Empty-src placeholder. NEVER <Img src=""> — its delayRender handle rejects on load failure and
 *  hard-fails the whole render. */
const PLACEHOLDER = "#c9c4bb";

const deg = (v: number) => v.toFixed(4);
const num = (v: number) => v.toFixed(6);

// ---------------------------------------------------------------------------------------------
// Paper — two children of one rotated cover square (design §4).
// ---------------------------------------------------------------------------------------------

const PaperCover: React.FC<{ cam: Cam; paper: PaperPreset; fibre: number; speed: number; W: number; H: number; z: number }> = ({
  cam,
  paper,
  fibre,
  speed,
  W,
  H,
  z,
}) => {
  const fib = paperFibreStyle(cam, W, H, fibre, speed);
  return (
    <div className="wl-cover" style={{ ...paperCoverStyle(cam, W, H), zIndex: z }}>
      {/* The base colour lives INSIDE the cover's blending group (the wrapper's transform +
          isolation:isolate): a `multiply` fibre on a sibling outside it would multiply against
          transparency and degenerate to normal compositing. */}
      <div className="wl-paper-low" style={paperLowStyle(paper, cam, W, H)} />
      {fib ? <div className="wl-paper-fibre" style={fib} /> : null}
    </div>
  );
};

// ---------------------------------------------------------------------------------------------
// One item — one camera layer, flat sibling, z-index 10 + i (design §0.2, §5.1).
// ---------------------------------------------------------------------------------------------

interface ItemViewProps {
  it: WallItem;
  index: number;
  /** CAM(depth) — supplied by WallClip's per-depth transform cache. */
  camTransform: string;
  visible: boolean;
  paper: PaperPreset;
  /** wall.handFont, used when the item sets no fontFamily of its own. */
  handFont: string | undefined;
  frame: number;
  fps: number;
  tAbs: number;
  beat: number;
  zIndex: number;
}

const WallItemView: React.FC<ItemViewProps> = ({
  it,
  index,
  camTransform,
  visible,
  paper,
  handFont,
  frame,
  fps,
  tAbs,
  beat,
  zIndex,
}) => {
  const box = itemBox(it);
  const depth = itemDepth(it);
  const isText = (it.type ?? "image") === "text";

  // Item motions go through the SAME stacker overlays use (effects/stack.ts), so the two can never
  // drift. `t` is ABSOLUTE, so a swayLoop on a wall item is on the same clock as everything else.
  //
  // The last two arguments are the LAYER-LEVEL loop / strength fallbacks, and wall items have no
  // schema fields for them (design §1 lists every field; `loop` and `strength` are deliberately not
  // among them — unlike overlaySchema). Consequence, stated rather than papered over: a
  // progress-driven motion (the Ken-Burns class) reaches progress 1 after `windowInFrames` and then
  // HOLDS for the rest of the clip. Time-driven motions (swayLoop, grainLoop — they read `t`, not
  // `progress`) are unaffected. Per-effect `motionParams[i].loop` is the lever; the WallInspector
  // (slice 4/5) surfaces it per chip, exactly as the overlay Inspector does.
  const stacked = stackMotions(
    it.motions ?? [],
    it.motionParams,
    { frame, fps, t: tAbs, beat, z: 0, params: {} },
    frame,
    Math.max(1, finite(it.windowInFrames, 90)),
    false,
    1,
  );
  const { opacity: motionOpacity, ...motionStyle } = stacked;

  // .wl-cam — carries ONLY the camera transform. transform-origin 0 0 with a zero-size box, so a
  // child's left/top IS its wall coordinate.
  const camStyle: CSSProperties = {
    position: "absolute",
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    transformOrigin: "0 0",
    transform: camTransform,
    zIndex,
    // Culled items are HIDDEN, never unmounted (design §3.8: unmounting would drop and re-acquire
    // <Img>/<Gif> delayRender handles mid-render and force GIF re-decodes).
    //
    // Stated limit on that cost model: `visibility` suppresses PAINT only. <OffthreadVideo> is
    // driven by React render + delayRender, not by paint, so an off-screen VIDEO item still pays a
    // full frame extraction on every frame. The ~7x cut in painted elements the design cites is
    // real for paint and for <Img>/<Gif>; it is NOT a cut in video extraction work. Gating the
    // video branch on `visible` would fix that, but it contradicts §3.8's stated rule and is not
    // exercised by the demo (no video items), so it is documented rather than done.
    ...(visible ? {} : { visibility: "hidden" }),
  };

  // .wl-anchor — CENTRING BY NEGATIVE MARGIN. With transform-origin 50% 50% the element's centre
  // is already the transform's fixed point; an extra translate(-50%,-50%) would displace it by
  // zoom*R*(w/2,h/2) and misplace every item at any zoom != 1. Negative margins are
  // origin-independent and compose with nothing. scale(1/depth) is the position-only-parallax
  // compensation: the camera layer is scaled by zoom*depth, so rendered size stays box*zoom.
  //
  // Every numeric read goes through wall.ts#finite(), the SAME hardening the geometry uses. A bare
  // `??` only catches null/undefined, and the editor's number fields yield NaN for an emptied
  // input — which would give a finite fit-all/cull box while the DOM emitted `left: NaNpx`, i.e.
  // the two would disagree instead of both degrading to the same default.
  const anchorStyle: CSSProperties = {
    position: "absolute",
    left: finite(it.x, 0),
    top: finite(it.y, 0),
    width: box.w,
    height: box.h,
    marginLeft: -box.w / 2,
    marginTop: -box.h / 2,
    transform: `rotate(${deg(finite(it.rotation, 0))}deg) scale(${num(1 / depth)})`,
    transformOrigin: "50% 50%",
    opacity: finite(it.opacity, 1) * Number(motionOpacity ?? 1),
  };

  // .wl-fx — the motion's own wrapper, NEVER the camera chain (squashStretch / pendulum /
  // eightBitHop / swayLoop / pixelWindSway set transformOrigin: bottom center, and that origin on
  // the camera chain would displace the item by a full height). left/top/width/height, NOT inset:0
  // — a motion whose style is left/top percentages (motionPath, arcMove, orbit) then overrides
  // left/top cleanly; under inset:0 the surviving right/bottom would resize the box instead.
  const fxStyle: CSSProperties = {
    position: "absolute",
    left: 0,
    top: 0,
    width: "100%",
    height: "100%",
    ...motionStyle,
  };

  const flip =
    it.flipX || it.flipY ? `${it.flipX ? "scaleX(-1) " : ""}${it.flipY ? "scaleY(-1)" : ""}`.trim() : undefined;

  if (isText) {
    // Text is ink on the paper: no card, no window, no cast shadow (a `none`-treatment keyline and
    // a box shadow would both draw a rectangle around free-standing handwriting). The block is
    // exactly box.h tall with lineHeight 1.18, so itemBox() stays authoritative by construction.
    //
    // This early return means frameCss() is NEVER called for text — a deliberate deviation from
    // design §5.7's "treatments forced to none" (that would still paint the keyline + shadow the
    // `none` treatment carries). See the note on frameCss(): `frame` and `caption` are therefore
    // inert for text items and the WallInspector must hide, not grey, those two controls.
    const align = it.align ?? "center";
    return (
      <div className="wl-cam" style={camStyle} data-wall-index={index}>
        <div className="wl-anchor" style={anchorStyle}>
          <div className="wl-fx" style={fxStyle}>
            <div
              className="wl-text"
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center",
                textAlign: align,
                whiteSpace: "pre-wrap",
                overflow: "visible",
                fontFamily: resolveHandFontFamily(it.fontFamily ?? handFont),
                fontSize: Math.max(1, finite(it.fontSize, 96)),
                lineHeight: 1.18,
                color: it.color ?? paper.ink,
                ...(flip ? { transform: flip, transformOrigin: "center center" } : {}),
              }}
            >
              {it.text ?? ""}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const seed = itemSeed(it);
  const fc = frameCss(it, paper, box, seed);
  const strength = finite(it.filterStrength, 1);
  const filter = filterCss(it.filter, strength);
  const wash = fadedWashStyle(it.filter, strength);
  const src = it.src ?? "";
  const mediaStyle: CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
    ...(filter ? { filter } : {}),
    ...(it.pixelated ? { imageRendering: "pixelated" as const } : {}),
  };

  return (
    <div className="wl-cam" style={camStyle} data-wall-index={index}>
      <div className="wl-anchor" style={anchorStyle}>
        {/* SIBLING of .wl-fx, so the card sways and the shadow stays on the paper — the print
            lifts off the wall instead of dragging its shadow with it. For `torn` this style is a
            blurred CLIPPED BACKING, not a box-shadow (clip-path would clip it away) — and the blur
            and the clip must sit on TWO elements: on one, the same filter -> clip paint order
            clips the halo away and the shadow renders as a hard-edged plate. Every other treatment
            leaves `shadowInner` undefined and renders exactly as before. */}
        <div className="wl-shadow" style={fc.shadow}>
          {fc.shadowInner ? <div style={fc.shadowInner} /> : null}
        </div>
        <div className="wl-fx" style={fxStyle}>
          <div
            className="wl-card"
            style={{ ...fc.card, ...(flip ? { transform: flip, transformOrigin: "center center" } : {}) }}
          >
            <div className="wl-window" style={fc.window}>
              {!src ? (
                <div style={{ position: "absolute", inset: 0, background: PLACEHOLDER }} />
              ) : GIF_RE.test(src) ? (
                // <Gif>'s index is purely frame-derived, so preview and MP4 pick the identical
                // frame. NO `from` prop is ever passed — items have no mount window, so the GIF is
                // mounted once per clip and acquires its delayRender handle exactly once.
                <Gif
                  src={resolveSrc(src)}
                  fit="cover"
                  loopBehavior="loop"
                  width={gifPx(box.w)}
                  height={gifPx(box.h)}
                  playbackRate={Math.max(0.01, finite(it.playbackRate, 1))}
                  style={{
                    width: "100%",
                    height: "100%",
                    ...(filter ? { filter } : {}),
                    ...(it.pixelated ? { imageRendering: "pixelated" as const } : {}),
                  }}
                />
              ) : VIDEO_RE.test(src) ? (
                <OffthreadVideo
                  src={resolveSrc(src)}
                  muted
                  transparent={it.alpha ?? ALPHA_RE.test(src)}
                  playbackRate={Math.max(0.01, finite(it.playbackRate, 1))}
                  style={mediaStyle}
                />
              ) : (
                <Img src={resolveSrc(src)} style={mediaStyle} />
              )}
              {/* `faded` lifts blacks — filter() can only crush them. Contained by the window's
                  overflow:hidden + isolation:isolate. */}
              {wash ? <div className="wl-wash" style={wash} /> : null}
            </div>
            {fc.caption && it.caption ? (
              <div className="wl-caption" style={{ ...fc.caption, fontFamily: resolveHandFontFamily(handFont) }}>
                {it.caption}
              </div>
            ) : null}
            {fc.tapes.map((tp, i) => (
              <div key={i} className="wl-tape" style={tp} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------------------------
// Finish — lens layers OUTSIDE the camera, so they cannot swim or crawl by construction.
// ---------------------------------------------------------------------------------------------

const Finish: React.FC<{
  paper: PaperPreset;
  finish: number;
  speed: number;
  frame: number;
  fps: number;
  tAbs: number;
  beat: number;
  clipDurationInFrames: number;
  z: number;
}> = ({ paper, finish, speed, frame, fps, tAbs, beat, clipDurationInFrames, z }) => {
  // The one honest registry reuse: only `opacity` is overridden, so grainLoop's mixBlendMode
  // "overlay" and its seededRandom(frame) jitter survive. This is also what makes
  // clipDurationInFrames a used prop rather than dead surface.
  const grain = getMotion("grainLoop")({
    progress: clamp(frame / Math.max(1, clipDurationInFrames)),
    frame,
    fps,
    t: tAbs,
    beat,
    z: 0,
    params: {},
  });
  const layer = (i: number, style: CSSProperties) => ({ ...style, zIndex: z + i });
  return (
    <>
      <div className="wl-warm" style={layer(0, warmStyle(paper, finish))} />
      <div className="wl-toe" style={layer(1, toeStyle(finish))} />
      <div className="wl-bloom" style={layer(2, bloomStyle(finish, speed))} />
      <div
        className="wl-grain"
        style={layer(3, {
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          ...grain,
          opacity: 0.055 * clamp(finish),
        })}
      />
      <div className="wl-vignette" style={layer(4, vignetteStyle(paper, finish))} />
    </>
  );
};

// ---------------------------------------------------------------------------------------------
// Viewfinder — a camera OSD, composited LAST (a real camera draws its graphics after the sensor).
// Frame-driven, zero state; geometry as fractions of W/H so a vertical project doesn't get a
// giant overlay. Deliberately NOT the hand font.
// ---------------------------------------------------------------------------------------------

const OSD = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

const timecode = (frames: number, fps: number) => {
  const n = Math.max(0, Math.floor(frames));
  const f = n % fps;
  const s = Math.floor(n / fps);
  const p = (v: number) => String(v).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}:${p(f)}`;
};

const Viewfinder: React.FC<{
  cam: Cam;
  seg: WallSeg;
  frame: number;
  absFrame: number;
  timecodeOffset: number;
  fps: number;
  W: number;
  H: number;
  z: number;
}> = ({ cam, seg, frame, absFrame, timecodeOffset, fps, W, H, z }) => {
  // Corner brackets RE-ACQUIRE FOCUS: 0 while gliding, then an exponential settle on the hold.
  // The glide->hold boundary is a hard 0->1 snap — the only deliberate discontinuity in the
  // design, and it belongs there (an AF lock snaps). Pure function of the frame, zero state.
  const af = seg.kind === "glide" ? 0 : Math.exp(-(frame - seg.from) / (0.18 * fps));
  const insetX = 0.045 * W + 10 * af;
  const insetY = 0.045 * H + 10 * af;
  const arm = 0.038 * W;
  const opacity = 0.55 + 0.45 * af;
  const line = "2px solid rgba(255,255,255,0.9)";
  const fs = Math.round(0.02 * H);
  // REC: exactly 1 Hz, 55% duty, on the ABSOLUTE clock so it does not restart at a cut (and is
  // deliberately NOT shifted by timecodeOffsetInFrames, which only re-labels the timecode).
  const on = (absFrame / fps) % 1 < 0.55;
  const bar = 0.094 * W; // == 180 px at 1920
  const tilt = cam.rot;
  const level = Math.abs(tilt) > 1.5 ? "#ffb648" : "rgba(255,255,255,0.85)";

  const corner = (i: number): CSSProperties => {
    const top = i < 2;
    const left = i % 2 === 0;
    return {
      position: "absolute",
      width: arm,
      height: arm,
      [top ? "top" : "bottom"]: insetY,
      [left ? "left" : "right"]: insetX,
      [top ? "borderTop" : "borderBottom"]: line,
      [left ? "borderLeft" : "borderRight"]: line,
      opacity,
    } as CSSProperties;
  };

  const text: CSSProperties = {
    position: "absolute",
    fontFamily: OSD,
    // A proportional face reflows the whole string every time the frame digit changes — a real
    // and ugly shimmer. Monospace + tabular-nums pins every glyph.
    fontVariantNumeric: "tabular-nums",
    fontSize: fs,
    letterSpacing: 1,
    color: "rgba(255,255,255,0.92)",
    textShadow: "0 1px 3px rgba(0,0,0,.6)",
    whiteSpace: "pre",
  };

  return (
    <AbsoluteFill style={{ zIndex: z, pointerEvents: "none" }}>
      <AbsoluteFill
        style={{
          boxShadow: "inset 0 0 0 2px rgba(255,255,255,.12), inset 0 0 120px rgba(0,0,0,.35)",
          borderRadius: 22,
        }}
      />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} style={corner(i)} />
      ))}
      {/* REC */}
      <div style={{ ...text, left: 0.045 * W, top: 0.045 * H - fs, display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            width: fs * 0.52,
            height: fs * 0.52,
            borderRadius: "50%",
            background: "#ff3b30",
            boxShadow: "0 0 14px #ff3b30",
            opacity: on ? 1 : 0.12,
            display: "inline-block",
          }}
        />
        REC
      </div>
      {/* Timecode */}
      <div style={{ ...text, right: 0.045 * W, top: 0.045 * H - fs }}>{timecode(absFrame + timecodeOffset, fps)}</div>
      {/* Zoom readout — genuinely changes every frame during a glide, so it reads as telemetry. */}
      <div style={{ ...text, right: 0.045 * W, bottom: 0.045 * H - fs }}>{cam.zoom.toFixed(2)}×</div>
      {/* Static furniture */}
      <div style={{ ...text, left: 0.045 * W, bottom: 0.045 * H - fs, opacity: 0.75 }}>AF  AWB  ▮▮▮▯   ❙❙ ▶ ■</div>
      <div style={{ ...text, right: 0.045 * W, top: 0.045 * H + fs * 0.6, opacity: 0.6 }}>MENU ≡</div>
      {/* Level bubble — the only on-screen visualisation of the rotation channel; it is what makes
          the breathing legible. */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: 0.06 * H,
          width: bar,
          height: 0,
          marginLeft: -bar / 2,
          borderTop: `2px solid ${level}`,
          transform: `translateY(${(tilt * 6).toFixed(2)}px) rotate(${deg(tilt)}deg)`,
          transformOrigin: "50% 50%",
          opacity: 0.8,
        }}
      />
      {/* Two fixed centre ticks the tilted bar is read against. */}
      {[-1, 1].map((s) => (
        <div
          key={s}
          style={{
            position: "absolute",
            left: "50%",
            bottom: 0.06 * H - 6,
            width: 0,
            height: 14,
            marginLeft: s * bar * 0.09,
            borderLeft: "2px solid rgba(255,255,255,0.55)",
          }}
        />
      ))}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------------------------
// WallClip
// ---------------------------------------------------------------------------------------------

export interface WallClipProps {
  wall: Wall;
  /** Σ previous clip durations − Σ previous transitions. The wall's ABSOLUTE clock. */
  absStart: number;
  /** The mount window. Only the finish's grain ctx reads it; the schedule is independent. */
  clipDurationInFrames: number;
  bpm: number;
  beatOffsetInFrames: number;
}

export const WallClip: React.FC<WallClipProps> = ({ wall, absStart, clipDurationInFrames, bpm, beatOffsetInFrames }) => {
  const frame = useCurrentFrame();
  const { fps, width: W, height: H } = useVideoConfig();

  const absFrame = absStart + frame;
  const tAbs = absFrame / fps;
  const beat = beatKick(tAbs, bpm, 6, beatOffsetInFrames / fps);

  const sched = useMemo(() => scheduleWall(wall, fps, W, H), [wall, fps, W, H]);
  const paper = useMemo(() => paperPreset(wall.paper), [wall.paper]);

  const { cam, seg, speed } = cameraAt(sched, frame, tAbs, { W, H, breathing: finite(wall.breathing, 0.55) });

  const items = wall.items ?? [];
  const finish = clamp(finite(wall.finish, 1));

  // Per-depth transform cache: a typical wall has 3-5 distinct depths, so ~5 string builds per
  // frame instead of one per item.
  const cache = new Map<number, string>();
  const camStr = (d: number) => {
    const hit = cache.get(d);
    if (hit !== undefined) return hit;
    const s = layerTransform(cam, d, W, H);
    cache.set(d, s);
    return s;
  };

  // Items are z-index 10 + i (array order IS paint order); the lens layers and the OSD sit above
  // every item, so their z-indices are derived from the item count rather than guessed.
  const topZ = 10 + items.length;

  return (
    <AbsoluteFill style={{ isolation: "isolate", overflow: "hidden" }}>
      <PaperCover cam={cam} paper={paper} fibre={finite(wall.fibre, 1)} speed={speed} W={W} H={H} z={1} />
      {items.map((it, i) => (
        <WallItemView
          key={i}
          it={it}
          index={i}
          camTransform={camStr(itemDepth(it))}
          visible={visibleAt(it, cam, W, H)}
          paper={paper}
          handFont={wall.handFont ?? "caveat"}
          frame={frame}
          fps={fps}
          tAbs={tAbs}
          beat={beat}
          zIndex={10 + i}
        />
      ))}
      {finish > 0 ? (
        <Finish
          paper={paper}
          finish={finish}
          speed={speed}
          frame={frame}
          fps={fps}
          tAbs={tAbs}
          beat={beat}
          clipDurationInFrames={clipDurationInFrames}
          z={topZ + 1}
        />
      ) : null}
      {wall.viewfinder ? (
        <Viewfinder
          cam={cam}
          seg={seg}
          frame={frame}
          absFrame={absFrame}
          timecodeOffset={Math.round(finite(wall.timecodeOffsetInFrames, 0))}
          fps={fps}
          W={W}
          H={H}
          z={topZ + 10}
        />
      ) : null}
    </AbsoluteFill>
  );
};
