import React from "react";
import { AbsoluteFill } from "remotion";
import type {
  TransitionPresentation,
  TransitionPresentationComponentProps,
} from "@remotion/transitions";
import { makeStar } from "@remotion/shapes";
import { getBoundingBox, translatePath } from "@remotion/paths";
import { clamp, lerp, seededRandom } from "./helpers";

// ---------------------------------------------------------------------------
// Custom CSS transition presentations.
//
// Remotion renders BOTH scenes during a transition and mounts this component
// twice — once "exiting" (outgoing scene, BELOW) and once "entering" (incoming
// scene, ON TOP) — sharing one presentationProgress 0..1. Because entering is
// on top, reveal effects clip/mask/fade the ENTERING layer while the exiting
// layer stays fully opaque behind it. Every effect here is pure CSS, so it
// previews and renders everywhere with no shader flags.
// ---------------------------------------------------------------------------

type Props = Record<string, unknown>;
type Dir = TransitionPresentationComponentProps<Props>["presentationDirection"];
type StyleFn = (p: number, dir: Dir, props: Props) => React.CSSProperties;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Factory = (params?: Props) => TransitionPresentation<any>;

/** Presentation that styles each scene's full-frame wrapper by (progress, direction). */
const css = (styleFn: StyleFn): Factory => {
  const Comp: React.FC<TransitionPresentationComponentProps<Props>> = ({
    children,
    presentationDirection,
    presentationProgress,
    passedProps,
  }) => (
    <AbsoluteFill style={styleFn(presentationProgress, presentationDirection, passedProps)}>
      {children}
    </AbsoluteFill>
  );
  return (params = {}) => ({ component: Comp, props: params });
};

/** Reveal effect: style the entering (top) layer only; exiting stays opaque behind. */
const enter = (fn: (p: number, props: Props) => React.CSSProperties): Factory =>
  css((p, dir, props) => (dir === "entering" ? fn(p, props) : {}));

const fullMask = (uri: string, size: string): React.CSSProperties => ({
  maskImage: uri,
  WebkitMaskImage: uri,
  maskSize: size,
  WebkitMaskSize: size,
  maskRepeat: "no-repeat",
  WebkitMaskRepeat: "no-repeat",
  maskPosition: "center",
  WebkitMaskPosition: "center",
});

const tiledMask = (uri: string, tile: string): React.CSSProperties => ({
  maskImage: uri,
  WebkitMaskImage: uri,
  maskSize: tile,
  WebkitMaskSize: tile,
  maskRepeat: "repeat",
  WebkitMaskRepeat: "repeat",
});

const HEART_URI =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M50,32 C50,12 18,12 18,38 C18,60 50,74 50,90 C50,74 82,60 82,38 C82,12 50,12 50,32 Z' fill='black'/%3E%3C/svg%3E\")";

// A tile with a centered black square sized by progress -> blocky grid reveal.
const squaresURI = (p: number) => {
  const s = Math.round(p * 100);
  const o = Math.round((1 - p) * 50);
  return `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Crect x='${o}' y='${o}' width='${s}' height='${s}' fill='black'/%3E%3C/svg%3E")`;
};

// Doom melt: the entering screen fills in column-by-column from the top, each
// column at a seeded-random rate (mask black = revealed entering scene).
const doomMaskURI = (p: number) => {
  const cols = 16;
  const w = 100 / cols;
  let rects = "";
  for (let i = 0; i < cols; i++) {
    const fill = clamp(p * 155 - seededRandom(i) * 55, 0, 100);
    rects += `%3Crect x='${(i * w).toFixed(2)}' y='0' width='${(w + 0.4).toFixed(2)}' height='${fill.toFixed(2)}' fill='black'/%3E`;
  }
  return `url("data:image/svg+xml,%3Csvg viewBox='0 0 100 100' preserveAspectRatio='none' xmlns='http://www.w3.org/2000/svg'%3E${rects}%3C/svg%3E")`;
};

// Dip-to-color / flash: scenes hard-cut at the midpoint while a full-frame
// color overlay peaks at p=0.5.
const dip = (color: string, sharpness = 1): Factory => {
  const Comp: React.FC<TransitionPresentationComponentProps<Props>> = ({
    children,
    presentationDirection,
    presentationProgress: p,
    passedProps,
  }) => {
    const c = (passedProps.color as string) ?? color;
    const sceneOpacity = presentationDirection === "exiting" ? clamp(1 - p * 2) : clamp(p * 2 - 1);
    return (
      <AbsoluteFill>
        <AbsoluteFill style={{ opacity: sceneOpacity }}>{children}</AbsoluteFill>
        {presentationDirection === "entering" && (
          <AbsoluteFill
            style={{ backgroundColor: c, opacity: Math.pow(1 - Math.abs(2 * p - 1), sharpness) }}
          />
        )}
      </AbsoluteFill>
    );
  };
  return (params = {}) => ({ component: Comp, props: params });
};

// Warm light-leak sweep over a crossfade.
const lightLeakFactory: Factory = (() => {
  const Comp: React.FC<TransitionPresentationComponentProps<Props>> = ({
    children,
    presentationDirection,
    presentationProgress: p,
  }) =>
    presentationDirection === "exiting" ? (
      <AbsoluteFill>{children}</AbsoluteFill>
    ) : (
      <AbsoluteFill>
        <AbsoluteFill style={{ opacity: p }}>{children}</AbsoluteFill>
        <AbsoluteFill
          style={{
            backgroundImage:
              "linear-gradient(115deg, transparent 20%, rgba(255,190,120,0.85) 45%, rgba(255,120,160,0.65) 55%, transparent 80%)",
            backgroundSize: "260% 100%",
            backgroundPosition: `${lerp(-80, 180, p)}% 0`,
            mixBlendMode: "screen",
            opacity: Math.sin(p * Math.PI) * 0.95,
          }}
        />
      </AbsoluteFill>
    );
  return (params = {}) => ({ component: Comp, props: params });
})();

// Star wipe: entering scene revealed through a growing, frame-centered star.
const starWipeFactory: Factory = (() => {
  const Comp: React.FC<TransitionPresentationComponentProps<Props>> = ({
    children,
    presentationDirection,
    presentationProgress: p,
    passedProps,
  }) => {
    if (presentationDirection === "exiting") return <AbsoluteFill>{children}</AbsoluteFill>;
    const w = (passedProps.width as number) ?? 1920;
    const h = (passedProps.height as number) ?? 1080;
    const outer = Math.max(1, (Math.sqrt(w * w + h * h) / 2) * p);
    const { path } = makeStar({ innerRadius: outer * 0.5, outerRadius: outer, points: 5 });
    const bb = getBoundingBox(path);
    const centered = translatePath(path, w / 2 - (bb.x1 + bb.x2) / 2, h / 2 - (bb.y1 + bb.y2) / 2);
    const clip = `path('${centered}')`;
    return (
      <AbsoluteFill style={{ clipPath: clip, WebkitClipPath: clip }}>{children}</AbsoluteFill>
    );
  };
  return (params = {}) => ({ component: Comp, props: params });
})();

/** All custom CSS presentations, keyed by registry id. */
export const cssPresentations: Record<string, Factory> = {
  // Light / color
  dipToColor: dip("#000000", 1),
  flashWhite: dip("#ffffff", 1.6),
  lightLeak: lightLeakFactory,

  // Zoom / blur — CSS look-alikes of the shader versions. Exiting layer stays
  // opaque behind; entering fades/scales in on top (clean crossfade, no bleed).
  whipPan: css((p, dir) =>
    dir === "exiting"
      ? { transform: `translateX(${-p * 120}%)`, filter: `blur(${Math.sin(p * Math.PI) * 12}px)` }
      : { transform: `translateX(${(1 - p) * 120}%)`, filter: `blur(${Math.sin(p * Math.PI) * 12}px)` },
  ),
  zoomBlur: css((p, dir) =>
    dir === "exiting"
      ? { transform: `scale(${lerp(1, 0.85, p)})`, filter: `blur(${p * 14}px)` }
      : { opacity: p, transform: `scale(${lerp(1.3, 1, p)})`, filter: `blur(${(1 - p) * 14}px)` },
  ),
  zoomInOut: css((p, dir) =>
    dir === "exiting"
      ? { transform: `scale(${lerp(1, 1.4, p)})` }
      : { opacity: clamp(p * 1.5), transform: `scale(${lerp(0.7, 1, p)})` },
  ),
  dreamyZoom: css((p, dir) =>
    dir === "exiting"
      ? { transform: `scale(${lerp(1, 1.15, p)})`, filter: `blur(${p * 8}px) brightness(${lerp(1, 1.6, p)})` }
      : {
          opacity: p,
          transform: `scale(${lerp(1.25, 1, p)}) rotate(${(1 - p) * 3}deg)`,
          filter: `blur(${(1 - p) * 10}px) brightness(${lerp(1.6, 1, p)})`,
        },
  ),
  simpleZoom: css((p, dir) =>
    dir === "exiting" ? {} : { opacity: clamp(p * 1.5), transform: `scale(${lerp(0.8, 1, p)})` },
  ),
  rgbSplit: css((p, dir) => {
    const off = Math.sin(p * Math.PI) * 12;
    const filter = `drop-shadow(${off}px 0 0 rgba(255,0,0,0.6)) drop-shadow(${-off}px 0 0 rgba(0,255,255,0.6))`;
    return dir === "exiting" ? { filter } : { opacity: p, filter };
  }),

  // Slide / shape / mask — entering-only reveals over the held exiting scene.
  coverUncover: enter((p) => ({ transform: `translateX(${(1 - p) * 100}%)` })),
  barnDoor: enter((p) => ({ clipPath: `inset(0 ${(1 - p) * 50}% 0 ${(1 - p) * 50}%)` })),
  doorway: css((p, dir) =>
    dir === "exiting"
      ? { filter: `brightness(${1 - p * 0.7})`, transform: `scale(${1 + p * 0.1})` }
      : { clipPath: `inset(0 ${(1 - p) * 50}% 0 ${(1 - p) * 50}%)` },
  ),
  circleCrop: enter((p) => ({ clipPath: `circle(${p * 75}% at 50% 50%)` })),
  rectangleCrop: enter((p) => ({ clipPath: `inset(${(1 - p) * 50}% ${(1 - p) * 50}%)` })),
  svgMaskReveal: enter((p) => ({
    clipPath: `polygon(0 0, ${p * 150}% 0, ${p * 150 - 50}% 100%, 0% 100%)`,
  })),
  windowBlinds: enter((p) => {
    const g = `repeating-linear-gradient(180deg, #000 0, #000 ${p * 40}px, transparent ${p * 40}px, transparent 40px)`;
    return { maskImage: g, WebkitMaskImage: g };
  }),
  heart: enter((p) => fullMask(HEART_URI, `${p * 200}%`)),
  starWipe: starWipeFactory,

  // Pixel / retro
  pixelize: css((p, dir) =>
    dir === "exiting"
      ? { filter: `blur(${p * 9}px) contrast(1.1)` }
      : { opacity: clamp(p * 1.4), filter: `blur(${(1 - p) * 9}px) contrast(1.1)`, imageRendering: "pixelated" },
  ),
  randomSquares: enter((p) => tiledMask(squaresURI(clamp(p)), "64px 64px")),
  mosaicShatter: css((p, dir) =>
    dir === "exiting"
      ? { transform: `scale(${lerp(1, 0.9, p)}) rotate(${-p * 4}deg)`, filter: `blur(${p * 4}px)` }
      : { opacity: clamp(p * 1.5), transform: `scale(${lerp(1.15, 1, p)}) rotate(${(1 - p) * 4}deg)` },
  ),
  doomScreen: enter((p) => fullMask(doomMaskURI(clamp(p)), "100% 100%")),
};
