import type { CallbackListener, PlayerRef } from "@remotion/player";
import { useCallback, useSyncExternalStore } from "react";

/** Subscribe to the Player's current frame without re-rendering on every tick
 *  (Remotion's recommended pattern). */
export const useCurrentPlayerFrame = (ref: React.RefObject<PlayerRef | null>): number => {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const { current } = ref;
      if (!current) return () => undefined;
      const updater: CallbackListener<"frameupdate"> = () => onStoreChange();
      current.addEventListener("frameupdate", updater);
      return () => current.removeEventListener("frameupdate", updater);
    },
    [ref],
  );
  return useSyncExternalStore<number>(
    subscribe,
    () => ref.current?.getCurrentFrame() ?? 0,
    () => 0,
  );
};
