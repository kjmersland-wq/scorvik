import { NextResponse } from "next/server";
import { hasValidPreviewSession } from "@/lib/auth/session";
import { getRenderEngine } from "@/lib/render/engine";
import { RenderError, validateRenderProject } from "@/lib/render/validation";

export const runtime = "nodejs";

const requestLimitBytes = 2_000_000;

async function readBody(request: Request): Promise<unknown> {
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > requestLimitBytes) throw new RenderError("INVALID_PROJECT", "Render request is too large.");
  try { return JSON.parse(raw) as unknown; } catch { throw new RenderError("INVALID_PROJECT", "Render request must contain valid JSON."); }
}

export async function POST(request: Request) {
  if (!await hasValidPreviewSession()) return NextResponse.json({ error: { code: "ACCESS_DENIED", message: "Sign in to render this project." } }, { status: 401 });
  let project: unknown;
  try {
    const body = await readBody(request);
    if (!body || typeof body !== "object" || !("project" in body)) throw new RenderError("INVALID_PROJECT", "Render request is missing its project.");
    project = body.project;
    validateRenderProject(project);
  } catch (error) {
    const renderError = error instanceof RenderError ? error : new RenderError("INVALID_PROJECT", "Render request is invalid.");
    return NextResponse.json({ error: { code: renderError.code, message: renderError.message } }, { status: 400 });
  }

  try {
    const job = await getRenderEngine().createRenderJob(project);
    const status = job.status === "failed" ? job.errorCode === "RENDERER_UNAVAILABLE" ? 503 : 422 : 202;
    return NextResponse.json({ job }, { status });
  } catch (error) {
    const renderError = error instanceof RenderError ? error : new RenderError("ENCODING_FAILED", "Could not start the render job.");
    return NextResponse.json({ error: { code: renderError.code, message: renderError.message } }, { status: renderError.code === "RENDERER_UNAVAILABLE" ? 503 : 500 });
  }
}