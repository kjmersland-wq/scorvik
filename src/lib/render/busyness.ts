// How busy is a picture where text would go? Measures the share of strong edges, which is what big printed lettering,
// logos and detailed graphics produce (calm photographic areas produce very few).

/** RGBA pixels -> fraction (0..1) of pixels sitting on a strong luminance edge. */
export function edgeFraction(rgba: Uint8ClampedArray, width: number, height: number, threshold = 60): number {
  if (width < 3 || height < 3) return 0;
  const luminance = new Float32Array(width * height);
  for (let i = 0; i < luminance.length; i += 1) luminance[i] = 0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2];
  let strong = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const gradient = Math.max(Math.abs(luminance[index + 1] - luminance[index - 1]), Math.abs(luminance[index + width] - luminance[index - width]));
      if (gradient > threshold) strong += 1;
    }
  }
  return strong / ((width - 2) * (height - 2));
}

export interface TextLayout {
  /** edge share in the band where a title would sit at the top of the frame */
  top: number;
  /** edge share in the band where a title normally sits (lower part of the frame) */
  bottom: number;
}

export type TextPlacement = { position: "top" | "bottom"; panel: number };

/**
 * Decides where on-screen text goes. A calm lower band keeps the usual lower-third. A busy one (printed headlines in the picture)
 * moves the text to a calmer top band, or, when nowhere is calm, sets it on a dark panel so the two never fight.
 */
export function chooseTextPlacement(layout: TextLayout, portrait: boolean): TextPlacement {
  const busy = layout.bottom;
  if (busy > 0.1 && !portrait && layout.top < 0.07 && layout.top < busy * 0.5) return { position: "top", panel: 0 };
  if (busy > 0.05) return { position: "bottom", panel: Math.min(0.85, 0.55 + busy * 2) };
  return { position: "bottom", panel: 0 };
}
