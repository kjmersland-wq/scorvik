import { NextResponse } from "next/server";
import { hasValidPreviewSession } from "@/lib/auth/session";
import { getRenderEngine } from "@/lib/render/engine";
import { RenderError } from "@/lib/render/validation";

export const runtime = "nodejs";

interface RenderRouteContext {
  params: Promise<{ renderId: string }>;
}

export async function GET(_request: Request, context: RenderRouteContext) {
  if (!await hasValidPreviewSession()) return NextResponse.json({ error: { code: "ACCESS_DENIED" } }, { status: 401 });
  const { renderId } = await context.params;
  try {
    const job = await getRenderEngine().getRenderJob(renderId);
    return job
      ? NextResponse.json({ job })
      : NextResponse.json({ error: { code: "RENDER_NOT_FOUND", message: "Render job was not found." } }, { status: 404 });
  } catch (error) {
    const renderError = error instanceof RenderError ? error : new RenderError("ENCODING_FAILED", "Could not read render status.");
    const status = renderError.code === "INVALID_PROJECT" ? 404 : renderError.code === "RENDERER_UNAVAILABLE" ? 503 : 400;
    return NextResponse.json({ error: { code: renderError.code, message: renderError.message } }, { status });
  }
}

export async function DELETE(_request: Request, context: RenderRouteContext) {
  if (!await hasValidPreviewSession()) return NextResponse.json({ error: { code: "ACCESS_DENIED" } }, { status: 401 });
  const { renderId } = await context.params;
  try {
    const job = await getRenderEngine().cancelRenderJob(renderId);
    return job
      ? NextResponse.json({ job })
      : NextResponse.json({ error: { code: "RENDER_NOT_FOUND", message: "Render job was not found." } }, { status: 404 });
  } catch (error) {
    const renderError = error instanceof RenderError ? error : new RenderError("ENCODING_FAILED", "Could not cancel render job.");
    const status = renderError.code === "INVALID_PROJECT" ? 404 : renderError.code === "RENDERER_UNAVAILABLE" ? 503 : 400;
    return NextResponse.json({ error: { code: renderError.code, message: renderError.message } }, { status });
  }
}