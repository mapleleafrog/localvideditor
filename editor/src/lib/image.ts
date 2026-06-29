// Read an image's natural pixel size so imported layers land at their real resolution.

/** Natural size of an image URL (or object URL). Resolves {w:0,h:0} on error (e.g. video/audio). */
export const imageNaturalSize = (url: string): Promise<{ w: number; h: number }> =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 0, h: 0 });
    img.src = url;
  });

/** Composition-px width to place an image at: its NATIVE width, scaled DOWN only if larger than the
 *  frame (so a 1080×1350 image on a 1080 canvas fills it exactly; a huge photo fits the frame). */
export const placeWidth = (natW: number, natH: number, compW: number, compH: number, fallback: number): number => {
  if (!natW || !natH) return fallback;
  const fit = Math.min(1, compW / natW, compH / natH);
  return Math.max(1, Math.round(natW * fit));
};
