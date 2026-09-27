// The Live take's current Player frame, published by WallView and read by the Scenes strip.
//
// NOT store state on purpose: the Player fires `frameupdate` ~30×/s while playing, and a zustand
// write that often would re-render every store subscriber (and spam the autosave / undo equality
// checks). Readers subscribe here with `useSyncExternalStore` and SELECT something coarse from it
// (the scene index), so the strip re-renders only when the playing scene changes; the needle is
// moved imperatively.
import { useSyncExternalStore } from "react";

let frame = -1;
const listeners = new Set<() => void>();

/** −1 = not playing a Live take (Arrange mode, or the view is closed). */
export const getLiveFrame = () => frame;
export const setLiveFrame = (f: number) => {
  if (f === frame) return;
  frame = f;
  for (const l of listeners) l();
};
export const subscribeLiveFrame = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

/** Re-renders only when `select(frame)` changes (it must return a primitive). */
export const useLiveFrameSelect = <T extends number | string | boolean | null>(select: (f: number) => T): T =>
  useSyncExternalStore(subscribeLiveFrame, () => select(frame));
