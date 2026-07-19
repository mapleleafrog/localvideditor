import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useEditor } from "../store";
import { clipStarts } from "../lib/timeline-utils";

type MenuItem = { label: string; disabled?: boolean; danger?: boolean; onClick: () => void } | "sep";

/** Singleton right-click context menu — one instance mounted in App, driven entirely by
 *  `useEditor().ctxMenu`. Fixed-position, clamped to the viewport, closes on outside click/scroll/
 *  Escape/second-right-click. Actions operate on the ALREADY-SELECTED target (openCtxMenu selects
 *  it when the menu opens). */
export const ContextMenu: React.FC = () => {
  const ctxMenu = useEditor((s) => s.ctxMenu);
  const closeCtxMenu = useEditor((s) => s.closeCtxMenu);
  const project = useEditor((s) => s.project);
  const clipboard = useEditor((s) => s.clipboard);
  const splitSelected = useEditor((s) => s.splitSelected);
  const duplicateSelected = useEditor((s) => s.duplicateSelected);
  const copySelected = useEditor((s) => s.copySelected);
  const pasteAt = useEditor((s) => s.pasteAt);
  const removeSelected = useEditor((s) => s.removeSelected);
  const reorderOverlay = useEditor((s) => s.reorderOverlay);
  const select = useEditor((s) => s.select);
  const openBrowser = useEditor((s) => s.openBrowser);

  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  // Measure after mount/content-change, then clamp into the viewport.
  useLayoutEffect(() => {
    if (!ctxMenu) {
      setPos(null);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let x = ctxMenu.x;
    let y = ctxMenu.y;
    if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 4;
    if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 4;
    x = Math.max(4, x);
    y = Math.max(4, y);
    setPos({ x, y });
  }, [ctxMenu]);

  // Close listeners — attached AFTER open so the opening contextmenu event doesn't instantly
  // close the menu it just created (this effect runs on commit, after that event has finished
  // dispatching).
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => closeCtxMenu();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("contextmenu", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("contextmenu", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [ctxMenu, closeCtxMenu]);

  if (!ctxMenu) return null;
  const { target, frame } = ctxMenu;
  const overlayCount = project.overlays.length;

  let items: MenuItem[];
  if (target.kind === "clip") {
    const c = project.clips[target.index];
    if (!c) return null;
    const starts = clipStarts(project);
    const start = starts[target.index] ?? 0;
    const rel = frame - start;
    const splitDisabled = rel <= 0 || rel >= c.durationInFrames;
    items = [
      { label: "Set motion…", onClick: () => openBrowser({ mode: "clip-motion", index: target.index }) },
      { label: "Set transition → next…", onClick: () => openBrowser({ mode: "clip-transition", index: target.index }) },
      "sep",
      { label: "Split at playhead", disabled: splitDisabled, onClick: () => splitSelected(frame) },
      { label: "Duplicate", onClick: duplicateSelected },
      { label: "Copy", onClick: copySelected },
      { label: "Paste", disabled: !clipboard, onClick: () => pasteAt(frame) },
      "sep",
      { label: "Delete", danger: true, onClick: removeSelected },
    ];
  } else {
    const o = project.overlays[target.index];
    if (!o) return null;
    const i = target.index;
    const rel = frame - (o.from ?? 0);
    const splitDisabled = rel <= 0 || rel >= o.durationInFrames;
    const reorderTo = (to: number) => {
      const clamped = Math.max(0, Math.min(overlayCount - 1, to));
      if (clamped === i) return;
      reorderOverlay(i, clamped);
      select({ kind: "overlay", index: clamped });
    };
    items = [
      { label: "Add effect…", onClick: () => openBrowser({ mode: "overlay-add", index: i }) },
      "sep",
      { label: "Split at playhead", disabled: splitDisabled, onClick: () => splitSelected(frame) },
      { label: "Duplicate", onClick: duplicateSelected },
      { label: "Copy", onClick: copySelected },
      { label: "Paste at playhead", disabled: !clipboard, onClick: () => pasteAt(frame) },
      "sep",
      { label: "Bring forward", disabled: i === 0, onClick: () => reorderTo(i - 1) },
      { label: "Send backward", disabled: i === overlayCount - 1, onClick: () => reorderTo(i + 1) },
      { label: "Move to top", disabled: i === 0, onClick: () => reorderTo(0) },
      { label: "Move to bottom", disabled: i === overlayCount - 1, onClick: () => reorderTo(overlayCount - 1) },
      "sep",
      { label: "Delete", danger: true, onClick: removeSelected },
    ];
  }

  return (
    <div
      ref={ref}
      className="ctx-menu"
      style={{ left: pos?.x ?? -9999, top: pos?.y ?? -9999, visibility: pos ? "visible" : "hidden" }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {items.map((it, idx) =>
        it === "sep" ? (
          <div key={idx} className="ctx-sep" />
        ) : (
          <button
            key={idx}
            disabled={it.disabled}
            className={it.danger ? "danger" : ""}
            onClick={() => {
              it.onClick();
              closeCtxMenu();
            }}
          >
            {it.label}
          </button>
        ),
      )}
    </div>
  );
};
