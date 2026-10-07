import { NextResponse } from "next/server";
import { hasValidPreviewSession } from "@/lib/auth/session";
import { allowedVideoHosts } from "@/lib/stock/search";

export const runtime = "nodejs";

const maxBytes = 60_000_000;

// Streams a stock video clip from an allow-listed host so the browser renderer can read it (the CDN sends no CORS headers).
export async function GET(request: Request) {
  if (!await hasValidPreviewSession()) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const target = new URL(request.url).searchParams.get("u") ?? "";
  let url: URL;
  try { url = new URL(target); } catch { return NextResponse.json({ error: "Bad URL." }, { status: 400 }); }
  if (url.protocol !== "https:" || url.username || url.password || !allowedVideoHosts.some((pattern) => pattern.test(url.hostname)) || !/\.mp4$/i.test(url.pathname)) {
    return NextResponse.json({ error: "Video host not allowed." }, { status: 400 });
  }
  const upstream = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(30_000) }).catch(() => undefined);
  const length = Number(upstream?.headers.get("content-length") ?? 0);
  if (!upstream?.ok || !upstream.body || length > maxBytes) return NextResponse.json({ error: "Video unavailable." }, { status: 502 });
  return new Response(upstream.body, { headers: { "content-type": "video/mp4", ...(length ? { "content-length": String(length) } : {}), "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" } });
}
