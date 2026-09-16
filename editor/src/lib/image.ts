// Read an image's natural pixel size so imported layers land at their real resolution.
//
// Both probes RELEASE their element before resolving. Without that, every probe leaves a decoded
// image (or a live demuxer) alive until GC happens to collect the wrapper — and these are called on
// every asset click, every drop, every "Fit to frame" and once per photo in a batch import. Where
// only the RATIO is wanted, callers should probe a proxy/thumb rather than the original.

/** Natural size of an image URL (or object URL). Resolves {w:0,h:0} on error (e.g. video/audio). */
export const imageNaturalSize = (url: string): Promise<{ w: number; h: number }> =>
  new Promise((resolve) => {
    const img = new Image();
    const done = (v: { w: number; h: number }) => {
      img.onload = null;
      img.onerror = null;
      // Drop the decoded bitmap now instead of waiting for the wrapper to be collected.
      try {
        img.removeAttribute("src");
      } catch {
        /* ignore */
      }
      resolve(v);
    };
    img.onload = () => done({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => done({ w: 0, h: 0 });
    img.src = url;
  });

/** Natural size of a video URL (or object URL) via its metadata. Resolves {w:0,h:0} on error. */
export const videoNaturalSize = (url: string): Promise<{ w: number; h: number }> =>
  new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    const done = (val: { w: number; h: number }) => {
      v.onloadedmetadata = null;
      v.onerror = null;
      // Tear the demuxer down — a probe left with a src keeps one alive per call.
      try {
        v.removeAttribute("src");
        v.load();
      } catch {
        /* ignore */
      }
      resolve(val);
    };
    v.onloadedmetadata = () => done({ w: v.videoWidth, h: v.videoHeight });
    v.onerror = () => done({ w: 0, h: 0 });
    v.src = url;
  });

/** Composition-px width to place an image at: its NATIVE width, scaled DOWN only if larger than the
 *  frame (so a 1080×1350 image on a 1080 canvas fills it exactly; a huge photo fits the frame). */
export const placeWidth = (natW: number, natH: number, compW: number, compH: number, fallback: number): number => {
  if (!natW || !natH) return fallback;
  const fit = Math.min(1, compW / natW, compH / natH);
  return Math.max(1, Math.round(natW * fit));
};
