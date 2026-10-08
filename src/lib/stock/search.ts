import { scoreWithRelevance } from "./relevance.ts";

// Server-side stock search (Pixabay images + videos, Unsplash images). Keys stay on the server.

export interface StockItem {
  id: string;
  source: "pixabay" | "unsplash" | "pexels";
  kind: "image" | "video";
  previewUrl: string;
  /** full-quality image URL, or the mp4 URL for videos */
  url: string;
  width: number;
  height: number;
  credit: string;
  pageUrl: string;
  /** seconds, for video clips */
  duration?: number;
  /** broadcast-readiness: search relevance plus resolution, framing and (for clips) length; higher is better */
  score: number;
  /** the result's own tags or title, used to judge relevance */
  text?: string;
  /** Unsplash: must be pinged when a photo is used (API guidelines) */
  downloadLocation?: string;
}

/** What separates footage that looks professional from filler: relevance first, then resolution, widescreen framing and a usable clip length. */
export function qualityScore(item: Pick<StockItem, "kind" | "width" | "height" | "duration">, rank: number): number {
  let score = 100 - rank * 4;
  const aspect = item.width / Math.max(1, item.height);
  if (aspect >= 1.5 && aspect <= 1.95) score += 12;
  else if (aspect < 1.2) score -= 25;
  if (item.kind === "image") {
    const pixels = item.width * item.height;
    if (pixels >= 3_000_000) score += 10;
    else if (pixels < 1_000_000) score -= 15;
  } else {
    if (item.width >= 1920) score += 10;
    else if (item.width >= 1280) score += 6;
    else score -= 12;
    if (item.duration) {
      if (item.duration >= 6 && item.duration <= 25) score += 10;
      else if (item.duration < 4) score -= 15;
      else if (item.duration > 60) score -= 10;
    }
  }
  return score;
}

export function stockSources() {
  return { pixabay: Boolean(process.env.PIXABAY_API_KEY), unsplash: Boolean(process.env.UNSPLASH_ACCESS_KEY), pexels: Boolean(process.env.PEXELS_API_KEY) };
}

const cache = new Map<string, { at: number; items: StockItem[] }>();
const dayMs = 24 * 60 * 60 * 1000; // Pixabay's API terms ask for 24h caching of results

function cached(key: string): StockItem[] | undefined {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < dayMs) return hit.items;
  cache.delete(key);
  return undefined;
}

async function getJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`Stock search failed (${response.status})`);
  return response.json();
}

interface PixabayImage { tags?: string; id: number; webformatURL: string; largeImageURL: string; imageWidth: number; imageHeight: number; user: string; pageURL: string }
interface PixabayVideoFile { url: string; width: number; height: number; thumbnail?: string }
interface PixabayVideo { tags?: string; id: number; pageURL: string; user: string; duration?: number; videos: Record<string, PixabayVideoFile> }

export async function searchPixabay(query: string, kind: "image" | "video", language: string): Promise<StockItem[]> {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return [];
  const cacheKey = `pixabay:${kind}:${language}:${query}`;
  const hit = cached(cacheKey);
  if (hit) return hit;
  const lang = language === "no" ? "no" : "en";
  const params = `key=${encodeURIComponent(key)}&q=${encodeURIComponent(query)}&lang=${lang}&safesearch=true&per_page=${kind === "video" ? 9 : 12}`;
  let items: StockItem[];
  if (kind === "image") {
    const data = await getJson(`https://pixabay.com/api/?${params}&image_type=photo&orientation=horizontal&min_width=1280`) as { hits?: PixabayImage[] };
    items = (data.hits ?? []).map((photo, rank): StockItem => ({ id: String(photo.id), source: "pixabay", kind: "image", previewUrl: photo.webformatURL, url: photo.largeImageURL, width: photo.imageWidth, height: photo.imageHeight, credit: photo.user, pageUrl: photo.pageURL, text: photo.tags, score: scoreWithRelevance(qualityScore({ kind: "image", width: photo.imageWidth, height: photo.imageHeight }, rank), query, photo.tags) }));
  } else {
    const data = await getJson(`https://pixabay.com/api/videos/?${params}`) as { hits?: PixabayVideo[] };
    items = (data.hits ?? []).flatMap((clip, rank): StockItem[] => {
      const file = clip.videos.large?.url ? clip.videos.large : clip.videos.medium ?? clip.videos.small;
      if (!file?.url) return [];
      return [{ id: String(clip.id), source: "pixabay", kind: "video", previewUrl: file.thumbnail ?? clip.videos.medium?.thumbnail ?? clip.videos.small?.thumbnail ?? "", url: file.url, width: file.width, height: file.height, duration: clip.duration, credit: clip.user, pageUrl: clip.pageURL, text: clip.tags, score: scoreWithRelevance(qualityScore({ kind: "video", width: file.width, height: file.height, duration: clip.duration }, rank), query, clip.tags) }];
    });
  }
  cache.set(cacheKey, { at: Date.now(), items });
  return items;
}

interface UnsplashPhoto { alt_description?: string | null; description?: string | null; id: string; width: number; height: number; urls: { small: string; regular: string }; user: { name: string }; links: { html: string; download_location: string } }

export async function searchUnsplash(query: string): Promise<StockItem[]> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return [];
  const cacheKey = `unsplash:${query}`;
  const hit = cached(cacheKey);
  if (hit) return hit;
  const data = await getJson(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=12&orientation=landscape&content_filter=high`, { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" }) as { results?: UnsplashPhoto[] };
  const items = (data.results ?? []).map((photo, rank): StockItem => ({ id: photo.id, source: "unsplash", kind: "image", previewUrl: photo.urls.small, url: photo.urls.regular, width: photo.width, height: photo.height, credit: photo.user.name, pageUrl: photo.links.html, downloadLocation: photo.links.download_location, text: `${photo.alt_description ?? ""} ${photo.description ?? ""}`, score: scoreWithRelevance(qualityScore({ kind: "image", width: photo.width, height: photo.height }, rank), query, `${photo.alt_description ?? ""} ${photo.description ?? ""}`) }));
  cache.set(cacheKey, { at: Date.now(), items });
  return items;
}

interface PexelsPhoto { alt?: string; id: number; width: number; height: number; url: string; photographer: string; src: { medium: string; large: string; large2x: string } }
interface PexelsVideoFile { link: string; width: number | null; height: number | null; file_type: string }
interface PexelsVideo { id: number; width: number; height: number; duration?: number; url: string; image: string; user: { name: string }; video_files: PexelsVideoFile[] }

export async function searchPexels(query: string, kind: "image" | "video"): Promise<StockItem[]> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return [];
  const cacheKey = `pexels:${kind}:${query}`;
  const hit = cached(cacheKey);
  if (hit) return hit;
  const headers = { Authorization: key };
  let items: StockItem[];
  if (kind === "image") {
    const data = await getJson(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=12&orientation=landscape`, headers) as { photos?: PexelsPhoto[] };
    items = (data.photos ?? []).map((photo, rank): StockItem => ({ id: String(photo.id), source: "pexels", kind: "image", previewUrl: photo.src.medium, url: photo.src.large2x || photo.src.large, width: photo.width, height: photo.height, credit: photo.photographer, pageUrl: photo.url, text: photo.alt, score: scoreWithRelevance(qualityScore({ kind: "image", width: photo.width, height: photo.height }, rank), query, photo.alt) }));
  } else {
    const data = await getJson(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=9&orientation=landscape`, headers) as { videos?: PexelsVideo[] };
    items = (data.videos ?? []).flatMap((clip, rank): StockItem[] => {
      const files = clip.video_files.filter((file) => file.file_type === "video/mp4" && (file.width ?? 0) >= 640 && (file.width ?? 0) <= 1920).sort((left, right) => Math.abs((left.width ?? 0) - 1280) - Math.abs((right.width ?? 0) - 1280));
      const file = files[0];
      return file ? [{ id: String(clip.id), source: "pexels", kind: "video", previewUrl: clip.image, url: file.link, width: file.width ?? clip.width, height: file.height ?? clip.height, duration: clip.duration, credit: clip.user.name, pageUrl: clip.url, text: slugOf(clip.url), score: scoreWithRelevance(qualityScore({ kind: "video", width: file.width ?? clip.width, height: file.height ?? clip.height, duration: clip.duration }, rank), query, slugOf(clip.url)) }] : [];
    });
  }
  cache.set(cacheKey, { at: Date.now(), items });
  return items;
}

/** Pexels video pages are named after the clip: /video/cars-driving-on-a-highway-1234/ */
const slugOf = (pageUrl: string) => decodeURIComponent(pageUrl.split("/video/")[1] ?? "").replace(/-\d+\/?$/, "").replace(/-/g, " ");

/** Unsplash requires a ping to the photo's download endpoint when it is used. */
export async function trackUnsplashUse(downloadLocation: string): Promise<void> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key || !/^https:\/\/api\.unsplash\.com\//.test(downloadLocation)) return;
  await fetch(downloadLocation, { headers: { Authorization: `Client-ID ${key}` }, signal: AbortSignal.timeout(8_000) }).catch(() => {});
}

export const allowedVideoHosts = [/^cdn\.pixabay\.com$/i, /^pixabay\.com$/i, /^videos\.pexels\.com$/i];
