import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { staticFile } from "remotion";
import { useEditor } from "../store";
import { clipStarts } from "../lib/timeline-utils";
import { imageNaturalSize, placeWidth } from "../lib/image";

type MenuItem = { label: string; disabled?: boolean; danger?: boolean; onClick: () => void } | "sep";

/** http(s) URLs pass through; everything else is a public/ asset (same pattern as AssetsPanel). */
const srcUrl = (ref: string) => (/^https?:\/\//.test(ref) ? ref : staticFile(ref));

/** Normalize an angle (degrees) into [-180, 180] — same formula as CanvasOverlay's rotate gesture. */
const normAngle = (deg: number) => (((deg + 180) % 360) + 360) % 360 - 180;

/** "Fit to frame" (contain, via placeWidth) / "Native size" for an image overlay — async because it
 *  reads the image's natural pixel size. Re-checks the overlay still exists (same src) after the
 *  await in case it was deleted/reordered/replaced while the image was loading. */
const fitImageOverlay = async (index: number, mode: "contain" | "native") => {
  const before = useEditor.getState().project.overlays[index];
  if (!before || before.type !== "image") return;
  const { w, h } = await imageNaturalSize(srcUrl(before.src));
  const st = useEditor.getState();
  const cur = st.project.overlays[index];
  if (!cur || cur.src !== before.src) return; // gone/replaced while loading
  if (!w || !h) {
    st.flash("Couldn't read image size");
    return;
  }
  const compW = st.project.width ?? 1920;
  const compH = st.project.height ?? 1080;
  const width = mode === "native" ? w : placeWidth(w, h, compW, compH, cur.width);
  st.patchOverlay(index, { width, scale: 1 });
};

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
  const patchOverlay = useEditor((s) => s.patchOverlay);
  const patchClip = useEditor((s) => s.patchClip);

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
      { label: `${c.flipX ? "✓ " : ""}Flip horizontal`, onClick: () => patchClip(target.index, { flipX: !c.flipX }) },
      { label: `${c.flipY ? "✓ " : ""}Flip vertical`, onClick: () => patchClip(target.index, { flipY: !c.flipY }) },
      "sep",
      // Fit/Native size only make sense for a positioned image overlay (a resizable width) — clips
      // fill the whole frame, so these are always disabled here (kept for a consistent menu shape).
      { label: "Fit to frame", disabled: true, onClick: () => {} },
      { label: "Native size", disabled: true, onClick: () => {} },
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
    // fx layers are full-frame (no x/y/scale/rotation) — those quick actions are no-ops there.
    const isFx = o.type === "fx";
    const isImage = o.type === "image";
    items = [
      { label: "Add effect…", onClick: () => openBrowser({ mode: "overlay-add", index: i }) },
      "sep",
      { label: `${o.flipX ? "✓ " : ""}Flip horizontal`, onClick: () => patchOverlay(i, { flipX: !o.flipX }) },
      { label: `${o.flipY ? "✓ " : ""}Flip vertical`, onClick: () => patchOverlay(i, { flipY: !o.flipY }) },
      "sep",
      {
        label: "Rotate 90° CW",
        disabled: isFx,
        onClick: () => patchOverlay(i, { rotation: normAngle((o.rotation ?? 0) + 90) }),
      },
      {
        label: "Rotate 90° CCW",
        disabled: isFx,
        onClick: () => patchOverlay(i, { rotation: normAngle((o.rotation ?? 0) - 90) }),
      },
      { label: "Center on canvas", disabled: isFx, onClick: () => patchOverlay(i, { x: 50, y: 50 }) },
      {
        label: "Reset transform",
        disabled: isFx,
        onClick: () => patchOverlay(i, { x: 50, y: 50, scale: 1, rotation: 0, flipX: undefined, flipY: undefined }),
      },
      { label: "Fit to frame", disabled: !isImage, onClick: () => void fitImageOverlay(i, "contain") },
      { label: "Native size", disabled: !isImage, onClick: () => void fitImageOverlay(i, "native") },
      "sep",
      { label: "Split at playhead", disabled: splitDisabled, onClick: () => splitSelected(frame) },
      { label: "Duplicate", onClick: duplicateSelected },
      { label: "Copy", onClick: copySelected },
      { label: "Paste at playhead", disabled: !clipboard, onClick: () => pasteAt(frame) },
      "sep",
      // Compositing truth (src/timeline/Timeline.tsx): overlays render sequentially into an
      // AbsoluteFill with no zIndex, so index 0 paints FIRST (visual back) and the LAST index
      // paints on top (visual front). "Forward/front" therefore means HIGHER index.
      { label: "Bring forward", disabled: i === overlayCount - 1, onClick: () => reorderTo(i + 1) },
      { label: "Send backward", disabled: i === 0, onClick: () => reorderTo(i - 1) },
      { label: "Move to top (front)", disabled: i === overlayCount - 1, onClick: () => reorderTo(overlayCount - 1) },
      { label: "Move to bottom (back)", disabled: i === 0, onClick: () => reorderTo(0) },
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
