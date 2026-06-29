import React, { useEffect } from "react";
import { useEditor } from "../store";

/** Cmd on macOS, Ctrl elsewhere — labelled per the user's platform. */
const MOD = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";

type Row = { keys: string[]; label: string };
type Group = { title: string; rows: Row[] };

const GROUPS: Group[] = [
  {
    title: "Playback",
    rows: [
      { keys: ["Space"], label: "Play / pause" },
      { keys: ["←", "→"], label: "Step one frame" },
      { keys: ["Shift", "←/→"], label: "Jump one second" },
      { keys: ["Home", "End"], label: "Go to start / end" },
    ],
  },
  {
    title: "Editing",
    rows: [
      { keys: ["S"], label: "Split at playhead" },
      { keys: [MOD, "K"], label: "Split at playhead" },
      { keys: [MOD, "D"], label: "Duplicate selection" },
      { keys: [MOD, "C"], label: "Copy selection" },
      { keys: [MOD, "V"], label: "Paste at playhead" },
      { keys: ["Del"], label: "Delete selection" },
    ],
  },
  {
    title: "Project",
    rows: [
      { keys: [MOD, "Z"], label: "Undo" },
      { keys: [MOD, "Shift", "Z"], label: "Redo" },
      { keys: [MOD, "S"], label: "Save project JSON" },
    ],
  },
  {
    title: "Timeline",
    rows: [
      { keys: ["+", "−"], label: "Zoom in / out" },
      { keys: [MOD, "wheel"], label: "Zoom at cursor" },
      { keys: ["🧲"], label: "Toggle snap to edges" },
      { keys: ["⤢"], label: "Zoom to fit" },
      { keys: ["click"], label: "Ruler / empty lane = scrub" },
    ],
  },
];

const Keys: React.FC<{ keys: string[] }> = ({ keys }) => (
  <span className="sc-keys">
    {keys.map((k, i) => (
      <React.Fragment key={i}>
        {i > 0 && <span className="sc-plus">+</span>}
        <kbd className="kbd">{k}</kbd>
      </React.Fragment>
    ))}
  </span>
);

/** Keyboard cheat-sheet overlay — toggled by `?`, the Topbar button, or Esc to close. */
export const ShortcutsModal: React.FC = () => {
  const open = useEditor((s) => s.showShortcuts);
  const toggle = useEditor((s) => s.toggleShortcuts);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") toggle(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, toggle]);
  if (!open) return null;
  return (
    <div className="sc-backdrop" onPointerDown={() => toggle(false)}>
      <div className="sc-modal" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sc-head">
          <strong>Keyboard shortcuts</strong>
          <button onClick={() => toggle(false)} title="Close (Esc)">
            ✕
          </button>
        </div>
        <div className="sc-cols">
          {GROUPS.map((g) => (
            <div className="sc-group" key={g.title}>
              <div className="sc-title">{g.title}</div>
              {g.rows.map((r, i) => (
                <div className="sc-row" key={i}>
                  <Keys keys={r.keys} />
                  <span className="sc-label">{r.label}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="sc-foot muted">Press ? anytime to open this · Esc to close</div>
      </div>
    </div>
  );
};

/** Transient status toast (split / duplicate / save feedback). Auto-dismisses ~2s after each fire. */
export const Toast: React.FC = () => {
  const toast = useEditor((s) => s.toast);
  const [shown, setShown] = React.useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    setShown(toast.msg);
    const id = setTimeout(() => setShown(null), 2000);
    return () => clearTimeout(id);
  }, [toast]);
  if (!shown) return null;
  return <div className="toast">{shown}</div>;
};
