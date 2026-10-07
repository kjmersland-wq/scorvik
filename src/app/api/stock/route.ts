import { NextResponse } from "next/server";
import { hasValidPreviewSession } from "@/lib/auth/session";
import { searchPexels, searchPixabay, searchUnsplash, stockSources, trackUnsplashUse, type StockItem } from "@/lib/stock/search";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!await hasValidPreviewSession()) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const sources = stockSources();
  if (searchParams.get("health")) {
    // Actively test every connected library with a tiny real search, so a wrong or expired key shows up before it costs a film.
    const test = async (configured: boolean, run: () => Promise<StockItem[]>) => {
      if (!configured) return { configured: false, ok: false as const };
      try { const items = await run(); return { configured: true, ok: items.length > 0, error: items.length ? undefined : "No results" }; }
      catch (error) { return { configured: true, ok: false as const, error: error instanceof Error ? error.message.slice(0, 80) : "Failed" }; }
    };
    const [pixabay, pexels, unsplash] = await Promise.all([
      test(sources.pixabay, () => searchPixabay("road", "image", "en")),
      test(sources.pexels, () => searchPexels("road", "image")),
      test(sources.unsplash, () => searchUnsplash("road")),
    ]);
    return NextResponse.json({ sources, health: { pixabay, pexels, unsplash } });
  }
  const query = (searchParams.get("q") ?? "").trim().slice(0, 100);
  if (!query) return NextResponse.json({ sources, items: [] });
  const kind = searchParams.get("kind") === "video" ? "video" : "image";
  const language = searchParams.get("lang") === "no" ? "no" : "en";
  const wanted = searchParams.get("source");
  try {
    const jobs: Array<Promise<StockItem[]>> = [];
    if (sources.pixabay && (!wanted || wanted === "pixabay")) jobs.push(searchPixabay(query, kind, language));
    if (sources.pexels && (!wanted || wanted === "pexels")) jobs.push(searchPexels(query, kind));
    if (sources.unsplash && kind === "image" && (!wanted || wanted === "unsplash")) jobs.push(searchUnsplash(query));
    const settled = await Promise.allSettled(jobs);
    // best footage first, whichever library it came from
    const items = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []).sort((left, right) => right.score - left.score);
    return NextResponse.json({ sources, items });
  } catch {
    return NextResponse.json({ sources, items: [], error: "SEARCH_FAILED" }, { status: 502 });
  }
}

// Unsplash asks apps to report when a photo is actually used.
export async function POST(request: Request) {
  if (!await hasValidPreviewSession()) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    const body = await request.json() as { downloadLocation?: unknown };
    if (typeof body.downloadLocation === "string") await trackUnsplashUse(body.downloadLocation);
  } catch {
    // ignore malformed pings
  }
  return NextResponse.json({ ok: true });
}
