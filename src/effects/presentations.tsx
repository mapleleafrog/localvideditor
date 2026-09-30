import React from "react";
import { AbsoluteFill } from "remotion";
import type {
  TransitionPresentation,
  TransitionPresentationComponentProps,
} from "@remotion/transitions";
import { LightLeak } from "@remotion/light-leaks";
import { TRANSITION_FORMULAS, type TransitionFormula, type TransitionProps } from "./portable";

// ---------------------------------------------------------------------------
// Custom CSS transition presentations.
//
// Remotion renders BOTH scenes during a transition and mounts this component
// twice — once "exiting" (outgoing scene, BELOW) and once "entering" (incoming
// scene, ON TOP) — sharing one presentationProgress 0..1. Because entering is
// on top, reveal effects clip/mask/fade the ENTERING layer while the exiting
// layer stays fully opaque behind it. Every effect here is pure CSS, so it
// previews and renders everywhere with no shader flags.
//
// The formulas themselves live in portable.ts (TRANSITION_FORMULAS) so the no-npm
// portal applies the exact same maths; this file only wraps them for Remotion.
// The light-leak presentations below stay here: they mount a WebGL component.
// ---------------------------------------------------------------------------

type Props = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Factory = (params?: Props) => TransitionPresentation<any>;

/** Presentation from a shared formula (portable.ts#TRANSITION_FORMULAS — the portal runs the same
 *  function). exiting = `a` on the outgoing scene; entering = `b` on the incoming scene with `o`
 *  (dip colour / leak sweep) drawn above it. The DOM is the same the hand-written components
 *  produced, so renders are unchanged. */
const fromFormula = (formula: TransitionFormula): Factory => {
  const Comp: React.FC<TransitionPresentationComponentProps<Props>> = ({
    children,
    presentationDirection,
    presentationProgress,
    passedProps,
  }) => {
    const parts = formula(presentationProgress, passedProps as TransitionProps);
    if (presentationDirection === "exiting") {
      return <AbsoluteFill style={parts.a as React.CSSProperties}>{children}</AbsoluteFill>;
    }
    if (!parts.o) return <AbsoluteFill style={parts.b as React.CSSProperties}>{children}</AbsoluteFill>;
    return (
      <AbsoluteFill>
        <AbsoluteFill style={parts.b as React.CSSProperties}>{children}</AbsoluteFill>
        <AbsoluteFill style={parts.o as React.CSSProperties} />
      </AbsoluteFill>
    );
  };
  return (params = {}) => ({ component: Comp, props: params });
};

// @remotion/light-leaks wrapped as an A->B transition: hold the exiting scene
// opaque, fade the entering scene in over it, and sweep the procedural WebGL leak
// across the cut. durationInFrames MUST be the transition length or the leak never
// evolves (its shader is driven by its own frame / durationInFrames) — the gallery
// and editor may pass none, so we hard-default. engine:"webgl" in the catalog.
const lightLeakPreset = (seed: number, hueShift: number): Factory => {
  const Comp: React.FC<TransitionPresentationComponentProps<Props>> = ({
    children,
    presentationDirection,
    presentationProgress: p,
    passedProps,
  }) => {
    if (presentationDirection === "exiting") return <AbsoluteFill>{children}</AbsoluteFill>;
    const dur = (passedProps.durationInFrames as number) ?? 20;
    return (
      <AbsoluteFill>
        <AbsoluteFill style={{ opacity: p }}>{children}</AbsoluteFill>
        <AbsoluteFill style={{ mixBlendMode: "screen", pointerEvents: "none", opacity: 0.9 }}>
          <LightLeak
            durationInFrames={dur}
            seed={(passedProps.seed as number) ?? seed}
            hueShift={(passedProps.hueShift as number) ?? hueShift}
          />
        </AbsoluteFill>
      </AbsoluteFill>
    );
  };
  return (params = {}) => ({ component: Comp, props: params });
};

/** Light-leak presentations (WebGL), keyed by registry id — wired in transitions.ts. */
export const lightLeakPresentations: Record<string, Factory> = {
  lightLeakFilm: lightLeakPreset(1, 0), // warm yellow (base hue ~55°)
  lightLeakGolden: lightLeakPreset(4, 20), // amber/gold (~35°)
  lightLeakRose: lightLeakPreset(7, 80), // pink/rose (~335°); effective hue ≈ 55° − hueShift
};

/** All custom CSS presentations, keyed by registry id — one per shared formula. */
export const cssPresentations: Record<string, Factory> = Object.fromEntries(
  Object.entries(TRANSITION_FORMULAS).map(([id, f]) => [id, fromFormula(f)]),
);
