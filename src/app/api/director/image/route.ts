import { NextResponse } from "next/server";
import { hasValidPreviewSession } from "@/lib/auth/session";
import { falKey, generateImage } from "@/lib/director/fal";
import { validReferenceImage } from "@/lib/director/library";
import { compositionHint, imageSizeFor, supportedAspects } from "@/lib/director/formats";
import { PermanentError, decide, estimateCost, requestHash, runWithFallback, seedFor, type Tier } from "@/lib/director/router";

export const runtime = "nodejs";

function plan(aspect: string, tier: Tier, flags: { hasReference?: boolean; hasProductReference?: boolean } = {}) {
  const decision = decide({ task: "image", tier, ...flags });
  return { decision, costUsd: estimateCost(decision.spec, { imageSize: imageSizeFor(aspect) }) };
}

// What each quality level would use and cost, so the studio can show it before anything is spent.
export async function GET(request: Request) {
  if (!await hasValidPreviewSession()) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const aspect = new URL(request.url).searchParams.get("aspect") ?? "16:9";
  if (!(supportedAspects as readonly string[]).includes(aspect)) return NextResponse.json({ error: "Invalid aspect." }, { status: 400 });
  const describe = (tier: Tier) => { const { decision, costUsd } = plan(aspect, tier); return { model: decision.spec.model, note: decision.spec.note, costUsd }; };
  return NextResponse.json({ configured: Boolean(falKey()), draft: describe("draft"), final: describe("final") });
}

export async function POST(request: Request) {
  if (!await hasValidPreviewSession()) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!falKey()) return NextResponse.json({ error: "NOT_CONFIGURED", message: "FAL_KEY is not set." }, { status: 503 });
  let body: { prompt?: unknown; aspect?: unknown; tier?: unknown; variation?: unknown; referenceImageUrl?: unknown; productImageUrl?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 2000) : "";
  const aspect = typeof body.aspect === "string" ? body.aspect : "16:9";
  const tier: Tier = body.tier === "draft" ? "draft" : "final";
  const referenceImageUrl = validReferenceImage(body.referenceImageUrl);
  const productImageUrl = validReferenceImage(body.productImageUrl);
  if (prompt.length < 3 || !(supportedAspects as readonly string[]).includes(aspect)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { decision, costUsd } = plan(aspect, tier, { hasReference: Boolean(referenceImageUrl), hasProductReference: Boolean(productImageUrl) });
  const variation = typeof body.variation === "number" && Number.isInteger(body.variation) && body.variation >= 0 && body.variation < 1000 ? body.variation : 0;
  const fullPrompt = [prompt, compositionHint(aspect)].filter(Boolean).join(", ");
  const seed = seedFor(requestHash(fullPrompt, aspect, tier, referenceImageUrl ?? "", productImageUrl ?? ""), variation);
  try {
    const run = await runWithFallback(decision, (spec) => generateImage(spec, { prompt: fullPrompt, aspect, seed, referenceImageUrl, productImageUrl }));
    return NextResponse.json({ url: run.value, model: run.spec.model, degraded: run.degraded, attempts: run.attempts, costUsd: run.degraded ? estimateCost(run.spec, { imageSize: imageSizeFor(aspect) }) : costUsd, reason: decision.reason });
  } catch (error) {
    if (error instanceof PermanentError) return NextResponse.json({ error: "REJECTED", message: error.message }, { status: 502 });
    return NextResponse.json({ error: "GENERATION_FAILED" }, { status: 502 });
  }
}
