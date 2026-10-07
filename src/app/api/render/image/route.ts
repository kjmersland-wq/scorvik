import { NextResponse } from "next/server";
import { hasValidPreviewSession } from "@/lib/auth/session";
import { fetchProjectImage } from "@/lib/render/media";

export const runtime = "nodejs";

// Lets the browser renderer read website images (which lack CORS headers) through a safe, SSRF-checked proxy.
export async function GET(request: Request) {
  if (!await hasValidPreviewSession()) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const target = searchParams.get("url");
  if (!target || target.length > 2000) return NextResponse.json({ error: "Missing image URL." }, { status: 400 });
  try {
    const image = await fetchProjectImage(target, searchParams.get("base") || target);
    return new Response(new Uint8Array(image.body), { headers: { "content-type": image.contentType, "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" } });
  } catch {
    return NextResponse.json({ error: "Image could not be retrieved." }, { status: 422 });
  }
}
