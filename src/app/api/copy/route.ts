import { NextResponse } from "next/server";
import { hasValidPreviewSession } from "@/lib/auth/session";
import { copyAvailable, copyLanguages, copyTones, detectTone, polishScenes, translateScenes, type CopyScene, type CopyTone } from "@/lib/ai/copy-llm";

export const runtime = "nodejs";

export async function GET() {
  if (!await hasValidPreviewSession()) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  return NextResponse.json({ available: copyAvailable() });
}

function readScenes(value: unknown): CopyScene[] | undefined {
  if (!Array.isArray(value) || value.length < 1 || value.length > 60) return undefined;
  const scenes: CopyScene[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return undefined;
    const scene = item as Record<string, unknown>;
    if (typeof scene.id !== "string" || typeof scene.headline !== "string" || typeof scene.supportingText !== "string") return undefined;
    if (scene.headline.length > 300 || scene.supportingText.length > 600) return undefined;
    scenes.push({ id: scene.id.slice(0, 80), purpose: typeof scene.purpose === "string" ? scene.purpose.slice(0, 20) : "", headline: scene.headline, supportingText: scene.supportingText, locked: scene.locked === true });
  }
  return scenes;
}

export async function POST(request: Request) {
  if (!await hasValidPreviewSession()) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!copyAvailable()) return NextResponse.json({ error: { code: "NOT_CONFIGURED" } }, { status: 503 });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return NextResponse.json({ error: { code: "INVALID" } }, { status: 400 }); }
  const scenes = readScenes(body.scenes);
  if (!scenes) return NextResponse.json({ error: { code: "INVALID" } }, { status: 400 });
  const requested = typeof body.tone === "string" ? body.tone : "auto";
  const sourceText = typeof body.source === "string" ? `${body.brand ?? ""} ${body.source}` : scenes.map((scene) => `${scene.headline} ${scene.supportingText}`).join(" ");
  const tone: CopyTone = (copyTones as string[]).includes(requested) ? requested as CopyTone : (typeof body.toneHint === "string" ? detectTone(body.toneHint) : detectTone(sourceText));
  try {
    if (body.task === "translate" && typeof body.language === "string" && body.language in copyLanguages) {
      const result = await translateScenes(body.language, scenes, tone);
      return result ? NextResponse.json({ scenes: result }) : NextResponse.json({ error: { code: "FAILED" } }, { status: 502 });
    }
    if (body.task === "polish" && typeof body.brand === "string" && typeof body.source === "string") {
      const result = await polishScenes(body.brand.slice(0, 120), body.source.slice(0, 6000), scenes, tone, body.mode === "instruction" ? "instruction" : "advert");
      return result ? NextResponse.json({ scenes: result }) : NextResponse.json({ error: { code: "FAILED" } }, { status: 502 });
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message.slice(0, 240) : "";
    return NextResponse.json({ error: { code: "FAILED", detail } }, { status: 502 });
  }
  return NextResponse.json({ error: { code: "INVALID" } }, { status: 400 });
}
