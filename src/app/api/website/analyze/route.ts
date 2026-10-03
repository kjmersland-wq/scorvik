import { NextResponse } from "next/server";
import { hasValidPreviewSession } from "@/lib/auth/session";
import { createCreativeBrief, detectBrandProfile } from "@/lib/creative/create-brief";
import { buildStoryboard } from "@/lib/creative/storyboard-engine";
import { buildMockAnalysis } from "@/lib/mock-data";
import { WebsiteIngestionError } from "@/lib/ingestion/security";
import { WebsiteIngestionService } from "@/lib/ingestion/website-ingestion";

export const runtime = "nodejs";

const publicErrors: Record<string, string> = {
  INVALID_URL: "That link doesn't seem to work yet. Check it and we'll try again.",
  BLOCKED_URL: "We can only take a look at public websites. Try a public link instead.",
  DNS_FAILED: "We couldn't find that website. Check the address and try again.",
  TIMEOUT: "That page is taking a little while to respond. Try again in a moment.",
  ACCESS_DENIED: "This site isn't open to visitors right now. Try another public page.",
  UNSUPPORTED_CONTENT: "That link doesn't lead to a page we can read. Try another one.",
  RESPONSE_TOO_LARGE: "This page has a lot to take in. Try a simpler page, like your homepage.",
  EMPTY_PAGE: "We couldn't find enough to work with on this page. Try another one.",
  UNAVAILABLE: "We couldn't reach that page just now. Check the link and try again.",
};

export async function POST(request: Request) {
  if (!await hasValidPreviewSession()) {
    return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  }

  try {
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > 4096) return NextResponse.json({ error: "That link is a little too long to check. Try a shorter one." }, { status: 413 });
    const rawBody = await request.text();
    if (rawBody.length > 4096) return NextResponse.json({ error: "That link is a little too long to check. Try a shorter one." }, { status: 413 });
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Something got tangled while reading that. Please try again." }, { status: 400 });
    }
    if (!body || typeof body !== "object" || !("url" in body) || typeof body.url !== "string") {
      return NextResponse.json({ error: "Add a website link and we'll take a look." }, { status: 400 });
    }
    const input = body.url.trim();
    const mode = "mode" in body && body.mode === "real" ? "real" : "mock";
    const targetDuration = "targetDuration" in body && typeof body.targetDuration === "number" && [15, 20, 30, 45, 60].includes(body.targetDuration) ? body.targetDuration : 30;
    const result = mode === "real"
      ? await new WebsiteIngestionService().analyze(input)
      : { source: { submittedUrl: input, finalUrl: buildMockAnalysis(input).url, fetchedAt: new Date().toISOString(), mode: "mock" as const }, analysis: buildMockAnalysis(input) };
    const analysis = { ...result.analysis, source: result.source };
    const brandProfile = detectBrandProfile(analysis);
    const enrichedAnalysis = { ...analysis, brandProfile };
    const creativeBrief = createCreativeBrief(enrichedAnalysis);
    const storyboard = buildStoryboard(enrichedAnalysis, creativeBrief, { targetDuration });
    return NextResponse.json({ source: result.source, analysis: enrichedAnalysis, creativeBrief, storyboard });
  } catch (error) {
    if (error instanceof WebsiteIngestionError) {
      const status = error.code === "INVALID_URL" ? 400 : error.code === "BLOCKED_URL" ? 403 : error.code === "TIMEOUT" ? 504 : 422;
      return NextResponse.json({ error: publicErrors[error.code] ?? publicErrors.UNAVAILABLE }, { status });
    }
    return NextResponse.json({ error: publicErrors.UNAVAILABLE }, { status: 502 });
  }
}
