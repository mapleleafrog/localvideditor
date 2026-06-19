import { useCallback, useReducer } from "react";

// A tiny undo/redo history stack. `set` records a snapshot; `reset` clears the
// history (used when opening/creating a project). Capped so it can't grow forever.
type State<T> = { past: T[]; present: T; future: T[] };
type Action<T> =
  | { type: "set"; fn: (p: T) => T }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; value: T };

const LIMIT = 80;

function reducer<T>(state: State<T>, action: Action<T>): State<T> {
  switch (action.type) {
    case "set": {
      const next = action.fn(state.present);
      if (Object.is(next, state.present)) return state;
      return { past: [...state.past, state.present].slice(-LIMIT), present: next, future: [] };
    }
    case "undo": {
      if (!state.past.length) return state;
      const present = state.past[state.past.length - 1];
      return { past: state.past.slice(0, -1), present, future: [state.present, ...state.future] };
    }
    case "redo": {
      if (!state.future.length) return state;
      const present = state.future[0];
      return { past: [...state.past, state.present], present, future: state.future.slice(1) };
    }
    case "reset":
      return { past: [], present: action.value, future: [] };
  }
}

export function useHistory<T>(initial: T) {
  const [state, dispatch] = useReducer(reducer<T>, { past: [], present: initial, future: [] });
  const set = useCallback((updater: T | ((p: T) => T)) => {
    dispatch({ type: "set", fn: typeof updater === "function" ? (updater as (p: T) => T) : () => updater });
  }, []);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  const reset = useCallback((value: T) => dispatch({ type: "reset", value }), []);
  return {
    state: state.present,
    set,
    undo,
    redo,
    reset,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
