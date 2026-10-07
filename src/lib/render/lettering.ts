// Detects pictures that carry their own big lettering (posters, hero banners, share images), so Scorvik never lays its text over theirs.
import { edgeFraction } from "./busyness";

const cache = new Map<string, boolean>();

/** True when the picture is dominated by printed text or hard graphics (a lot of strong edges). */
export async function imageHasLettering(url: string, siteUrl: string): Promise<boolean> {
  if (!url) return false;
  const cached = cache.get(url);
  if (cached !== undefined) return cached;
  let result = false;
  try {
    const sameOrigin = url.startsWith("/") || url.startsWith("data:") || url.startsWith("blob:");
    const response = await fetch(sameOrigin ? url : `/api/render/image?url=${encodeURIComponent(url)}&base=${encodeURIComponent(siteUrl)}`);
    if (response.ok) {
      const bitmap = await createImageBitmap(await response.blob());
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = Math.max(24, Math.round((128 * bitmap.height) / bitmap.width));
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (context) {
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const whole = edgeFraction(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
        const bottomHeight = Math.round(canvas.height * 0.4);
        const bottom = edgeFraction(context.getImageData(0, canvas.height - bottomHeight, canvas.width, bottomHeight).data, canvas.width, bottomHeight);
        result = whole > 0.08 || bottom > 0.1;
      }
      bitmap.close();
    }
  } catch {
    result = false;
  }
  cache.set(url, result);
  return result;
}
