import type { PosterBrief } from "@/types/project";

// Loads the site's own pictures through the existing SSRF-checked image proxy (/api/render/image).

export interface PosterImages { logo?: ImageBitmap; hero?: ImageBitmap }

export function proxiedImageUrl(source: string, baseUrl: string): string {
  const sameOrigin = source.startsWith("/") || source.startsWith("data:") || source.startsWith("blob:");
  return sameOrigin ? source : `/api/render/image?url=${encodeURIComponent(source)}&base=${encodeURIComponent(baseUrl)}`;
}

export async function loadPosterBitmap(source: string | undefined, baseUrl: string, minSide = 1): Promise<ImageBitmap | undefined> {
  if (!source) return undefined;
  try {
    const response = await fetch(proxiedImageUrl(source, baseUrl));
    if (!response.ok) return undefined;
    const bitmap = await createImageBitmap(await response.blob());
    if (Math.min(bitmap.width, bitmap.height) < minSide) { bitmap.close(); return undefined; }
    return bitmap;
  } catch {
    return undefined;
  }
}

export async function loadPosterImages(brief: Pick<PosterBrief, "logoUrl" | "heroUrl">, baseUrl: string): Promise<PosterImages> {
  const [logo, hero] = await Promise.all([
    loadPosterBitmap(brief.logoUrl, baseUrl, 24),
    loadPosterBitmap(brief.heroUrl, baseUrl, 120),
  ]);
  return { logo, hero };
}
