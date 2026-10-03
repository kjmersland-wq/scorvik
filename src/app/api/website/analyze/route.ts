import { NextResponse } from "next/server";
import { createCreativeBrief, detectBrandProfile } from "@/lib/creative/create-brief";
import { buildStoryboard } from "@/lib/creative/storyboard-engine";
import { buildMockAnalysis } from "@/lib/mock-data";
import { WebsiteIngestionError } from "@/lib/ingestion/security";
import { WebsiteIngestionService } from "@/lib/ingestion/website-ingestion";

export const runtime = "nodejs";

const publicErrors: Record<string, string> = {
  INVALID_URL: "Enter a valid public website URL.",
  BLOCKED_URL: "This address can't be analyzed. Use a publicly accessible website.",
  DNS_FAILED: "We couldn't find this website. Check the address and try again.",
  TIMEOUT: "This website took too long to respond. Try again in a moment.",
  ACCESS_DENIED: "This website doesn't allow public access. Try another page.",
  UNSUPPORTED_CONTENT: "This address doesn't point to a supported webpage.",
  RESPONSE_TOO_LARGE: "This webpage is larger than we can analyze right now.",
  EMPTY_PAGE: "We couldn't find enough readable content on this page.",
  UNAVAILABLE: "We couldn't access this website. Check that it's publicly accessible and try again.",
};

export async function POST(request: Request) {
  try {
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > 4096) return NextResponse.json({ error: "The request is too large." }, { status: 413 });
    const rawBody = await request.text();
    if (rawBody.length > 4096) return NextResponse.json({ error: "The request is too large." }, { status: 413 });
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "We couldn't read that request. Try again." }, { status: 400 });
    }
    if (!body || typeof body !== "object" || !("url" in body) || typeof body.url !== "string") {
      return NextResponse.json({ error: "Enter a website address to continue." }, { status: 400 });
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
