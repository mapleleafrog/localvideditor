import type { CSSProperties } from "react";
import type { TransitionPresentation } from "@remotion/transitions";

export type EffectTier = "Core" | "Ext" | "Adv";
export type Engine = "css" | "canvas" | "webgl" | "three" | "either";
export type EffectStatus = "ready" | "todo";
export type EffectKind = "motion" | "transition";

/**
 * Everything an effect's `style()`/`presentation()` may read. Built once per
 * frame inside `Layer` (the single frame->ctx boundary).
 */
export interface MotionCtx {
  /** Normalized 0..1 progress across the layer's own mount window. */
  progress: number;
  /** Absolute composition frame. */
  frame: number;
  fps: number;
  /** Seconds = frame / fps. ABSOLUTE — keeps loops/beat on the song grid. */
  t: number;
  /** 0..1 decaying kick from the BPM clock (absolute-frame derived). */
  beat: number;
  /** Depth 0 = far .. 1 = near. Drives the 2.5D shadow/scale/parallax system. */
  z: number;
  params: Record<string, number>;
}

export interface EffectMeta {
  id: string;
  name: string;
  category: string;
  engine: Engine;
  tier: EffectTier;
  status: EffectStatus;
  /** readonly so plain string-literal arrays from the catalog assign cleanly. */
  tags: readonly string[];
  license?: string;
  credit?: string;
}

export interface MotionDef extends EffectMeta {
  kind?: "motion";
  defaults?: Record<string, number>;
  /** Omitted for `todo` stubs. */
  style?: (ctx: MotionCtx) => CSSProperties;
}

export interface TransitionDef extends EffectMeta {
  kind?: "transition";
  /**
   * Omitted for `todo` stubs. `any` props sidestep TransitionPresentation's
   * contravariant component typing when storing heterogeneous presentations
   * in one registry.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  presentation?: (params?: Record<string, unknown>) => TransitionPresentation<any>;
}

/**
 * The catalog is metadata-only: motions without `style`, transitions without
 * `presentation`, discriminated by `kind`. It is the single source of truth;
 * motions.ts / transitions.ts import it and override Core/ready entries with
 * an implementation.
 */
export type CatalogEntry =
  | (Omit<MotionDef, "style" | "defaults"> & { kind: "motion" })
  | (Omit<TransitionDef, "presentation"> & { kind: "transition" });
