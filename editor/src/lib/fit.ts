// The exact-composition-aspect box, lifted VERBATIM out of Preview.tsx so the Edit preview and the
// Wall view share one implementation. This is what makes coords.ts#scaleFactor (k = boxW / compW)
// a single uniform scalar in both views — screen px <-> composition px with no letterbox slack.
import { useLayoutEffect, useState } from "react";
import type React from "react";

/** contain-fit: largest aw:ah box that fits the container -> exact composition aspect (no letterbox). */
export function useContainFit(ref: React.RefObject<HTMLDivElement | null>, aw: number, ah: number) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      if (!width || !height) return;
      const s = Math.min(width / aw, height / ah);
      setBox({ w: Math.floor(aw * s), h: Math.floor(ah * s) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, aw, ah]);
  return box;
}
