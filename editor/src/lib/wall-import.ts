// Photos -> wall items. ONE implementation, shared by every entry point that isn't the Wall
// viewport itself (the timeline block drop, the clip context menu's "Add photos…", and anything
// added later), so the async-safety rule below is written once instead of being re-remembered.
//
// ASYNC SAFETY (design §7.6, carried FIX-25): after EVERY await the store is re-read via
// `useEditor.getState()` and the target re-validated as a wall clip before patching. A reorder, an
// undo or a delete during a 20-file upload must not clobber a different clip.
//
// This module touches the DOM (a transient <input type=file>) and the store, which is exactly why
// it is NOT in wall-edit.ts — that file is pure by contract.
import { useEditor } from "../store";
import { uploadMedia } from "./api";
import { ensureProjectName } from "./names";
import { imageNaturalSize } from "./image";
import { fitAll, importWidth, isWallClip, newSeed, newWallItemFromAsset, spiralOffset, wallOf } from "./wall-edit";

const isImageFile = (n: string) => /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(n);

/** Open the OS file picker and resolve with what was chosen (empty when cancelled/dismissed). */
export const pickImageFiles = (): Promise<File[]> =>
  new Promise((resolve) => {
    const el = document.createElement("input");
    el.type = "file";
    el.multiple = true;
    el.accept = "image/*";
    el.style.display = "none";
    // `change` never fires on cancel in most browsers; the element is removed either way so this
    // leaks nothing, and a cancelled pick simply never resolves into an import.
    el.addEventListener("change", () => {
      const files = Array.from(el.files ?? []);
      el.remove();
      resolve(files);
    });
    document.body.appendChild(el);
    el.click();
  });

/**
 * Upload `files` and append them to wall clip `ci` as items, fanned on a golden-angle spiral.
 *
 * `at` defaults to the wall's OWN centre (`fitAll`'s centre) rather than the origin — a wall
 * authored around (2000, 900) would otherwise collect new photos on blank paper far away — and
 * `zoom` (the framing the sizing is judged against) defaults to that same fit pose's zoom.
 */
export const importPhotosToWall = async (
  ci: number,
  files: File[],
  at?: { x: number; y: number; zoom?: number },
) => {
  const media = files.filter((f) => isImageFile(f.name));
  if (!media.length) return 0;
  const st0 = useEditor.getState();
  if (!isWallClip(st0.project, ci)) return 0;
  const proj = ensureProjectName();
  if (!proj) {
    st0.flash("Name the project first to import media.");
    return 0;
  }
  const W = st0.project.width ?? 1920;
  const H = st0.project.height ?? 1080;
  const wall = wallOf(st0.project.clips[ci]);
  const pose = fitAll(wall.items ?? [], W, H, wall.fitPadding ?? 0.06);
  const home = at ?? pose;
  // Card sizing is done in SCREEN terms and stored in wall units, so the import reads the same
  // whether the wall is framed tight or pulled way out.
  const zoom = at?.zoom ?? pose.zoom;
  st0.flash(`Importing ${media.length} photo${media.length > 1 ? "s" : ""}…`);

  let ok = 0;
  for (let n = 0; n < media.length; n++) {
    const f = media[n];
    const r = await uploadMedia(f, proj);
    if (!r.ok || !r.ref) continue;
    const url = URL.createObjectURL(f);
    const { w, h } = await imageNaturalSize(url);
    URL.revokeObjectURL(url);
    const st = useEditor.getState();
    if (!isWallClip(st.project, ci)) {
      st.flash("Wall clip changed — import stopped.");
      return ok;
    }
    const width = importWidth(w, st.project.width ?? 1920, zoom);
    // `width` is already in WALL units, so the fan-out must not be divided by zoom again — one
    // shared helper (wall-edit.ts#spiralOffset), one constant, same spacing at every framing.
    const off = spiralOffset(n, width);
    st.addWallItem(
      ci,
      newWallItemFromAsset(r.ref, {
        x: home.x + off.x,
        y: home.y + off.y,
        width,
        aspect: w > 0 && h > 0 ? w / h : undefined,
        seed: newSeed(),
        label: f.name,
      }),
    );
    ok++;
  }
  useEditor.getState().flash(`Added ${ok}/${media.length} to the wall`);
  return ok;
};
