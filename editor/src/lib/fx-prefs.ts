// Favorites + recents for the effect/transition pickers, persisted to localStorage. Entries are
// namespaced by kind ("motion:<id>" / "transition:<id>") so a motion and a transition can share
// the same id without colliding (motions and transitions are disjoint id sets today, but nothing
// enforces that — namespacing is cheap insurance).
import { useSyncExternalStore } from "react";
import { readyMotions, readyTransitions } from "./effects-bridge";

export type FxKind = "motion" | "transition";

const FAV_KEY = "soranji.fx.favorites";
const RECENT_KEY = "soranji.fx.recent";
const RECENT_CAP = 12;

const entryKey = (kind: FxKind, id: string) => `${kind}:${id}`;
const splitEntry = (entry: string): { kind: string; id: string } => {
  const i = entry.indexOf(":");
  return i < 0 ? { kind: "", id: entry } : { kind: entry.slice(0, i), id: entry.slice(i + 1) };
};

function readList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function writeList(key: string, list: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* quota / unavailable */
  }
}

/** Drop entries whose id no longer resolves in the live ready registry (stale after an effect is
 *  renamed/removed, or corrupt storage). */
function isValidEntry(entry: string): boolean {
  const { kind, id } = splitEntry(entry);
  if (kind === "motion") return readyMotions().some((m) => m.id === id);
  if (kind === "transition") return readyTransitions().some((t) => t.id === id);
  return false;
}
const validated = (key: string): string[] => readList(key).filter(isValidEntry);

// Cached snapshots for useSyncExternalStore — only reassigned on an actual mutation, so repeated
// getSnapshot() calls between mutations return the SAME reference (required to avoid a render loop).
let favCache = validated(FAV_KEY);
let recentCache = validated(RECENT_KEY);
const subscribers = new Set<() => void>();
const emit = () => subscribers.forEach((s) => s());
const subscribe = (cb: () => void) => {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
};

export const isFavorite = (kind: FxKind, id: string): boolean => favCache.includes(entryKey(kind, id));

export const toggleFavorite = (kind: FxKind, id: string): void => {
  const k = entryKey(kind, id);
  const list = validated(FAV_KEY);
  const i = list.indexOf(k);
  if (i >= 0) list.splice(i, 1);
  else list.push(k);
  writeList(FAV_KEY, list);
  favCache = list;
  emit();
};

/** Push to the front of the MRU recents list (cap 12), deduping the id if it was already present. */
export const pushRecent = (kind: FxKind, id: string): void => {
  const k = entryKey(kind, id);
  const list = validated(RECENT_KEY).filter((x) => x !== k);
  list.unshift(k);
  const capped = list.slice(0, RECENT_CAP);
  writeList(RECENT_KEY, capped);
  recentCache = capped;
  emit();
};

const idsOf = (list: string[], kind: FxKind) =>
  list.filter((e) => splitEntry(e).kind === kind).map((e) => splitEntry(e).id);

/** Reactive favorites/recents for the given kind — re-renders the caller when either list changes
 *  (star toggles, new picks) in THIS tab (no cross-tab storage-event sync; not needed for a
 *  single-window editor). */
export const useFxPrefs = (kind: FxKind) => {
  const favorites = useSyncExternalStore(subscribe, () => favCache);
  const recent = useSyncExternalStore(subscribe, () => recentCache);
  return {
    favoriteIds: idsOf(favorites, kind),
    recentIds: idsOf(recent, kind),
    isFavorite: (id: string) => isFavorite(kind, id),
    toggleFavorite: (id: string) => toggleFavorite(kind, id),
    pushRecent: (id: string) => pushRecent(kind, id),
  };
};
