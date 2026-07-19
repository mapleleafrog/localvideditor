import React, { useEffect, useState } from "react";
import { getMotion } from "../lib/effects-bridge";
import { beatKick } from "../../../src/effects/helpers";

export const PREVIEW_FPS = 30;
export const PREVIEW_WINDOW = 45; // ~1.5s loop, long enough to read most motions

/** Hover-only live preview: runs the actual motion formula over a small swatch via rAF, so you can
 *  tell "wiggle vs. bob vs. zoom" apart without clicking. `active` is controlled by the caller so a
 *  grid of many tiles never runs more than one rAF loop at once (Library: per-tile hover state;
 *  EffectBrowser: one `hoveredId` for the whole grid). */
export const FxPreview: React.FC<{ id: string; className?: string; active: boolean }> = ({
  id,
  className,
  active,
}) => {
  const [style, setStyle] = useState<React.CSSProperties>({});
  useEffect(() => {
    if (!active) {
      setStyle({});
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = (now - start) / 1000;
      const frame = Math.floor(elapsed * PREVIEW_FPS) % PREVIEW_WINDOW;
      setStyle(
        getMotion(id)({
          progress: frame / PREVIEW_WINDOW,
          frame,
          fps: PREVIEW_FPS,
          t: elapsed,
          beat: beatKick(elapsed, 120, 6, 0),
          z: 0.4,
          params: {},
        }),
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [id, active]);
  return (
    <span className={className ?? "fx-swatch"}>
      <span className="fx-swatch-inner" style={style} />
    </span>
  );
};
