// Server-side stock search (Pixabay images + videos, Unsplash images). Keys stay on the server.

export interface StockItem {
  id: string;
  source: "pixabay" | "unsplash";
  kind: "image" | "video";
  previewUrl: string;
  /** full-quality image URL, or the mp4 URL for videos */
  url: string;
  width: number;
  height: number;
  credit: string;
  pageUrl: string;
  /** Unsplash: must be pinged when a photo is used (API guidelines) */
  downloadLocation?: string;
}

export function stockSources() {
  return { pixabay: Boolean(process.env.PIXABAY_API_KEY), unsplash: Boolean(process.env.UNSPLASH_ACCESS_KEY) };
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

interface PixabayImage { id: number; webformatURL: string; largeImageURL: string; imageWidth: number; imageHeight: number; user: string; pageURL: string }
interface PixabayVideoFile { url: string; width: number; height: number; thumbnail?: string }
interface PixabayVideo { id: number; pageURL: string; user: string; videos: Record<string, PixabayVideoFile> }

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
    items = (data.hits ?? []).map((photo): StockItem => ({ id: String(photo.id), source: "pixabay", kind: "image", previewUrl: photo.webformatURL, url: photo.largeImageURL, width: photo.imageWidth, height: photo.imageHeight, credit: photo.user, pageUrl: photo.pageURL }));
  } else {
    const data = await getJson(`https://pixabay.com/api/videos/?${params}`) as { hits?: PixabayVideo[] };
    items = (data.hits ?? []).flatMap((clip): StockItem[] => {
      const file = clip.videos.medium ?? clip.videos.small ?? clip.videos.large;
      if (!file?.url) return [];
      return [{ id: String(clip.id), source: "pixabay", kind: "video", previewUrl: file.thumbnail ?? clip.videos.small?.thumbnail ?? "", url: file.url, width: file.width, height: file.height, credit: clip.user, pageUrl: clip.pageURL }];
    });
  }
  cache.set(cacheKey, { at: Date.now(), items });
  return items;
}

interface UnsplashPhoto { id: string; width: number; height: number; urls: { small: string; regular: string }; user: { name: string }; links: { html: string; download_location: string } }

export async function searchUnsplash(query: string): Promise<StockItem[]> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return [];
  const cacheKey = `unsplash:${query}`;
  const hit = cached(cacheKey);
  if (hit) return hit;
  const data = await getJson(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=12&orientation=landscape&content_filter=high`, { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" }) as { results?: UnsplashPhoto[] };
  const items = (data.results ?? []).map((photo): StockItem => ({ id: photo.id, source: "unsplash", kind: "image", previewUrl: photo.urls.small, url: photo.urls.regular, width: photo.width, height: photo.height, credit: photo.user.name, pageUrl: photo.links.html, downloadLocation: photo.links.download_location }));
  cache.set(cacheKey, { at: Date.now(), items });
  return items;
}

/** Unsplash requires a ping to the photo's download endpoint when it is used. */
export async function trackUnsplashUse(downloadLocation: string): Promise<void> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key || !/^https:\/\/api\.unsplash\.com\//.test(downloadLocation)) return;
  await fetch(downloadLocation, { headers: { Authorization: `Client-ID ${key}` }, signal: AbortSignal.timeout(8_000) }).catch(() => {});
}

export const allowedVideoHosts = [/^cdn\.pixabay\.com$/i, /^pixabay\.com$/i];
