import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { hasValidPreviewSession } from "@/lib/auth/session";
import { getRenderEngine } from "@/lib/render/engine";

export const runtime = "nodejs";

interface RenderVideoContext {
  params: Promise<{ renderId: string }>;
}

export async function GET(request: Request, context: RenderVideoContext) {
  if (!await hasValidPreviewSession()) return NextResponse.json({ error: { code: "ACCESS_DENIED" } }, { status: 401 });
  const { renderId } = await context.params;
  const engine = getRenderEngine();
  const job = await engine.getRenderJob(renderId);
  if (!job || job.status !== "complete" || job.mode !== "real") {
    return NextResponse.json({ error: { code: "RENDER_NOT_FOUND", message: "A completed MP4 was not found." } }, { status: 404 });
  }
  if (job.engine === "external") {
    if (!engine.getVideoResponse) return NextResponse.json({ error: { code: "RENDERER_UNAVAILABLE" } }, { status: 503 });
    try {
      const response = await engine.getVideoResponse(renderId, request.headers.get("range") ?? undefined);
      return new Response(response.body, { status: response.status, headers: response.headers });
    } catch {
      return NextResponse.json({ error: { code: "RENDERER_UNAVAILABLE", message: "The persistent MP4 could not be loaded." } }, { status: 502 });
    }
  }
  const { getLocalRenderVideoPath } = await import("@/lib/render/ffmpeg-engine");
  const filePath = await getLocalRenderVideoPath(renderId);
  if (!filePath) return NextResponse.json({ error: { code: "RENDER_NOT_FOUND", message: "A completed local MP4 was not found." } }, { status: 404 });

  const { stat } = await import("node:fs/promises");
  const file = await stat(filePath);
  const range = request.headers.get("range");
  let start = 0;
  let end = file.size - 1;
  let status = 200;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) return new Response(null, { status: 416, headers: { "content-range": `bytes */${file.size}` } });
    if (!match[1] && match[2]) start = Math.max(0, file.size - Number(match[2]));
    else start = Number(match[1]);
    if (match[1] && match[2]) end = Math.min(end, Number(match[2]));
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= file.size) {
      return new Response(null, { status: 416, headers: { "content-range": `bytes */${file.size}` } });
    }
    status = 206;
  }

  const headers = new Headers({
    "accept-ranges": "bytes",
    "cache-control": "private, no-store",
    "content-length": String(end - start + 1),
    "content-type": "video/mp4",
    "x-content-type-options": "nosniff",
  });
  if (status === 206) headers.set("content-range", `bytes ${start}-${end}/${file.size}`);
  const stream = Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream<Uint8Array>;
  return new Response(stream, { status, headers });
}