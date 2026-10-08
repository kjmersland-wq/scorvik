import { NextResponse } from "next/server";
import { hasValidPreviewSession } from "@/lib/auth/session";
import { anthropicKey, callTool, type ToolSpec } from "@/lib/director/claude";
import { supportedAspects } from "@/lib/director/formats";
import { PermanentError } from "@/lib/director/router";
import { buildReview, failedPrecheck, precheck } from "@/lib/director/review";
import { fetchProjectImage } from "@/lib/render/media";

export const runtime = "nodejs";

const reviewSystem = `You are a strict creative director reviewing ONE frame made for a short commercial film.
Judge only what you can see. Score 1-5: 5 = could run as a real ad frame as is; 4 = good, minor flaws; 3 = usable but weak or off-brief; 2 = clear problems; 1 = unusable.
Check: (1) does it match the scene description; (2) if a product reference picture is provided, is the product in the frame recognisably the same (shape, colour, logo): set product_recognizable true or false, and leave it out when no reference is given; (3) obvious AI errors such as deformed hands or faces, extra limbs, garbled text or melted objects; (4) does it look like a real commercial frame rather than random footage.
List concrete issues (max 5) and give one short piece of advice usable in a re-render prompt.
Always answer by calling the submit_review tool.`;

const reviewTool: ToolSpec = {
  name: "submit_review",
  description: "Submit the review of the frame.",
  input_schema: {
    type: "object",
    properties: {
      score: { type: "integer", minimum: 1, maximum: 5 },
      product_recognizable: { type: "boolean" },
      issues: { type: "array", items: { type: "string" } },
      advice: { type: "string" },
    },
    required: ["score", "issues", "advice"],
  },
};

const maxBytes = 4_500_000;
const mediaTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

async function imageBlock(url: string, base: string) {
  const image = await fetchProjectImage(url, base);
  const type = image.contentType.split(";")[0].trim().toLowerCase();
  if (!mediaTypes.has(type) || image.body.length > maxBytes) throw new Error("This picture cannot be reviewed.");
  return { bytes: new Uint8Array(image.body), block: { type: "image", source: { type: "base64", media_type: type, data: image.body.toString("base64") } } };
}

// Quality review of one frame: cheap code checks first, an AI look only if they pass. The verdict comes from the score, never from the model.
export async function POST(request: Request) {
  if (!await hasValidPreviewSession()) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  let body: { imageUrl?: unknown; description?: unknown; aspect?: unknown; productImageUrl?: unknown; base?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const imageUrl = typeof body.imageUrl === "string" && body.imageUrl.length < 2000 ? body.imageUrl : "";
  const aspect = typeof body.aspect === "string" ? body.aspect : "16:9";
  if (!imageUrl || !(supportedAspects as readonly string[]).includes(aspect)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const base = typeof body.base === "string" && body.base.length < 2000 ? body.base : imageUrl;
  const productUrl = typeof body.productImageUrl === "string" && body.productImageUrl.length < 2000 ? body.productImageUrl : undefined;
  try {
    const frame = await imageBlock(imageUrl, base);
    const issues = precheck(frame.bytes, aspect);
    if (issues.length) return NextResponse.json({ review: failedPrecheck(issues) });
    if (!anthropicKey()) return NextResponse.json({ error: "NOT_CONFIGURED", message: "ANTHROPIC_API_KEY is not set, so only the basic checks ran.", basicChecksPassed: true }, { status: 503 });
    const content: Array<Record<string, unknown>> = [];
    if (productUrl) content.push({ type: "text", text: "Product reference picture:" }, (await imageBlock(productUrl, base)).block);
    content.push({ type: "text", text: "Frame to review:" }, frame.block, { type: "text", text: `Scene description: ${typeof body.description === "string" ? body.description.slice(0, 600) : ""}` });
    const raw = await callTool({ system: reviewSystem, tool: reviewTool, content, maxTokens: 800 });
    return NextResponse.json({ review: buildReview(raw, process.env.ANTHROPIC_MODEL || "claude", Boolean(productUrl)) });
  } catch (error) {
    if (error instanceof PermanentError) return NextResponse.json({ error: "REJECTED", message: error.message }, { status: 502 });
    return NextResponse.json({ error: "REVIEW_FAILED" }, { status: 502 });
  }
}
