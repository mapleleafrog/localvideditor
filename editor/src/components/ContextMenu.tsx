import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { staticFile } from "remotion";
import { useEditor } from "../store";
import { clipStarts } from "../lib/timeline-utils";
import { imageNaturalSize, placeWidth } from "../lib/image";
import { fitAll, fitDurationPatch, wallFitFor, wallOf } from "../lib/wall-edit";
import { importPhotosToWall, pickImageFiles } from "../lib/wall-import";

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
  const patchWallItem = useEditor((s) => s.patchWallItem);
  const reorderWallItem = useEditor((s) => s.reorderWallItem);
  const setView = useEditor((s) => s.setView);
  const setWallClip = useEditor((s) => s.setWallClip);
  const setWallCam = useEditor((s) => s.setWallCam);
  const setWallFramed = useEditor((s) => s.setWallFramed);

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
    // Page scroll closes the menu (its anchor moved). But when the menu itself is tall enough to
    // overflow (max-height + overflow-y:auto), scrolling INSIDE it to reach the bottom items must
    // NOT close it — ignore scrolls originating within the menu.
    const onScroll = (e: Event) => {
      const m = ref.current;
      if (m && (e.target === m || m.contains(e.target as Node))) return;
      close();
    };
    window.addEventListener("click", close);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("contextmenu", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", onScroll, true);
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
    const isWall = c.type === "wall";
    // A wall clip has its own camera schedule: splitting it would restart that schedule in both
    // halves, it has no media element to mirror, and a clip motion would be a second camera
    // fighting the first (design §7.8 / F-30). Greyed, not hidden — the menu shape stays constant.
    const splitDisabled = isWall || rel <= 0 || rel >= c.durationInFrames;
    const openWall = () => {
      setWallClip(target.index);
      setView("wall");
    };
    const fit = isWall ? wallFitFor(project, target.index) : null;
    items = [
      ...(isWall
        ? ([
            { label: "Edit wall…", onClick: openWall },
            {
              label: `Fit duration to scenes${fit ? ` (${fit.need}f)` : ""}`,
              disabled: !fit || fit.state === "fit",
              // One shared patch (it applies project.durationInFrames' cap) — the four buttons
              // that offer this action used to produce three different lengths.
              onClick: () => {
                const p = fitDurationPatch(useEditor.getState().project, target.index);
                if (p) patchClip(target.index, p);
              },
            },
            {
              label: "Fit camera to all items",
              onClick: () => {
                const w = wallOf(project.clips[target.index]);
                setWallCam(fitAll(w.items ?? [], project.width ?? 1920, project.height ?? 1080, w.fitPadding ?? 0.06));
                // Claim the clip as ALREADY FRAMED, or the Wall view's open-framing effect would
                // immediately overwrite this pose with scene 1 and the menu item would do nothing.
                setWallFramed(target.index);
                openWall();
              },
            },
            {
              label: "Add photos…",
              onClick: () => void pickImageFiles().then((files) => importPhotosToWall(target.index, files)),
            },
            "sep",
          ] as MenuItem[])
        : []),
      {
        label: "Set motion…",
        disabled: isWall,
        onClick: () => openBrowser({ mode: "clip-motion", index: target.index }),
      },
      { label: "Set transition → next…", onClick: () => openBrowser({ mode: "clip-transition", index: target.index }) },
      "sep",
      { label: `${c.flipX ? "✓ " : ""}Flip horizontal`, disabled: isWall, onClick: () => patchClip(target.index, { flipX: !c.flipX }) },
      { label: `${c.flipY ? "✓ " : ""}Flip vertical`, disabled: isWall, onClick: () => patchClip(target.index, { flipY: !c.flipY }) },
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
  } else if (target.kind === "wallItem") {
    // A wall item addresses clips[clip].wall.items[index] — WITHOUT this branch it fell through to
    // the overlay one and every action would have hit overlays[index], an unrelated layer.
    const ci = target.clip;
    const i = target.index;
    const list = project.clips[ci]?.wall?.items ?? [];
    const it = list[i];
    if (!it) return null;
    // Array order IS paint order: a HIGHER index paints later, i.e. in front.
    const reorderTo = (to: number) => {
      const clamped = Math.max(0, Math.min(list.length - 1, to));
      if (clamped === i) return;
      reorderWallItem(ci, i, clamped);
    };
    const setFrame = (f: NonNullable<typeof it.frame>) => patchWallItem(ci, i, { frame: f });
    items = [
      { label: "Add effect…", onClick: () => openBrowser({ mode: "wall-item-add", clip: ci, index: i }) },
      "sep",
      { label: `${it.flipX ? "✓ " : ""}Flip horizontal`, onClick: () => patchWallItem(ci, i, { flipX: !it.flipX || undefined }) },
      { label: `${it.flipY ? "✓ " : ""}Flip vertical`, onClick: () => patchWallItem(ci, i, { flipY: !it.flipY || undefined }) },
      { label: "Reset rotation", onClick: () => patchWallItem(ci, i, { rotation: 0 }) },
      "sep",
      { label: `Frame → none${it.frame === "none" ? " ✓" : ""}`, onClick: () => setFrame("none") },
      { label: `Frame → polaroid${it.frame === "polaroid" ? " ✓" : ""}`, onClick: () => setFrame("polaroid") },
      { label: `Frame → matte${it.frame === "matte" ? " ✓" : ""}`, onClick: () => setFrame("matte") },
      { label: `Frame → taped${it.frame === "taped" ? " ✓" : ""}`, onClick: () => setFrame("taped") },
      { label: `Frame → torn${it.frame === "torn" ? " ✓" : ""}`, onClick: () => setFrame("torn") },
      "sep",
      { label: "Depth → 0.9 (recedes)", onClick: () => patchWallItem(ci, i, { depth: 0.9 }) },
      { label: "Depth → 1.0 (wall plane)", onClick: () => patchWallItem(ci, i, { depth: 1 }) },
      { label: "Depth → 1.1 (forward)", onClick: () => patchWallItem(ci, i, { depth: 1.1 }) },
      "sep",
      { label: "Duplicate", onClick: duplicateSelected },
      { label: "Copy", onClick: copySelected },
      { label: "Paste", disabled: !clipboard, onClick: () => pasteAt(frame) },
      "sep",
      { label: "Bring forward", disabled: i === list.length - 1, onClick: () => reorderTo(i + 1) },
      { label: "Send backward", disabled: i === 0, onClick: () => reorderTo(i - 1) },
      { label: "Move to front", disabled: i === list.length - 1, onClick: () => reorderTo(list.length - 1) },
      { label: "Move to back", disabled: i === 0, onClick: () => reorderTo(0) },
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
