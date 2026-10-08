import { NextResponse } from "next/server";
import { hasValidPreviewSession } from "@/lib/auth/session";
import { anthropicKey } from "@/lib/director/claude";
import { planEdit, type EditableScene } from "@/lib/director/edit";
import { PermanentError } from "@/lib/director/router";

export const runtime = "nodejs";

const text = (value: unknown, max: number) => typeof value === "string" ? value.slice(0, max) : "";

// "Make scene 2 shorter and calmer": Claude proposes edits, the server validates them, the studio applies them (with undo).
export async function POST(request: Request) {
  if (!await hasValidPreviewSession()) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!anthropicKey()) return NextResponse.json({ error: "NOT_CONFIGURED", message: "ANTHROPIC_API_KEY is not set." }, { status: 503 });
  let body: { instruction?: unknown; scenes?: unknown; focusSceneId?: unknown; brand?: unknown; language?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const instruction = text(body.instruction, 600).trim();
  if (!instruction || !Array.isArray(body.scenes) || body.scenes.length === 0 || body.scenes.length > 40) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const scenes: EditableScene[] = [];
  for (const item of body.scenes) {
    const scene = item as Record<string, unknown>;
    if (typeof scene?.id !== "string" || scene.id.length > 80 || typeof scene.duration !== "number") return NextResponse.json({ error: "Invalid scenes." }, { status: 400 });
    scenes.push({ id: scene.id, headline: text(scene.headline, 300), supportingText: text(scene.supportingText, 400), voiceover: text(scene.voiceover, 800), duration: scene.duration, visualQuery: text(scene.visualQuery, 80) || undefined });
  }
  try {
    const plan = await planEdit({ instruction, scenes, focusSceneId: typeof body.focusSceneId === "string" ? body.focusSceneId : undefined, brand: text(body.brand, 120), language: text(body.language, 20) });
    return NextResponse.json({ plan });
  } catch (error) {
    if (error instanceof PermanentError) return NextResponse.json({ error: "REJECTED", message: error.message }, { status: 502 });
    return NextResponse.json({ error: "EDIT_FAILED" }, { status: 502 });
  }
}
