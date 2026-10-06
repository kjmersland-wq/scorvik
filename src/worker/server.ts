import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { RenderError } from "../lib/render/validation.ts";
import { NeonRenderJobStore } from "./render-job-store.ts";
import { R2VideoObjectStorage } from "./object-storage.ts";
import { RenderWorkerService } from "./render-service.ts";

const port = Number(process.env.PORT || 8080);
const token = process.env.SCORVIK_RENDER_PROVIDER_TOKEN || "";
const databaseUrl = process.env.DATABASE_URL || "";
const publicUrl = process.env.SCORVIK_RENDER_WORKER_PUBLIC_URL || "";
const requestLimitBytes = 2_000_000;

if (!token || !databaseUrl || !publicUrl) {
  throw new Error("SCORVIK_RENDER_PROVIDER_TOKEN, DATABASE_URL, and SCORVIK_RENDER_WORKER_PUBLIC_URL are required.");
}

const store = new NeonRenderJobStore(databaseUrl);
const storage = new R2VideoObjectStorage({
  accountId: process.env.SCORVIK_R2_ACCOUNT_ID || "",
  accessKeyId: process.env.SCORVIK_R2_ACCESS_KEY_ID || "",
  secretAccessKey: process.env.SCORVIK_R2_SECRET_ACCESS_KEY || "",
  bucket: process.env.SCORVIK_R2_BUCKET || "",
});
const service = new RenderWorkerService(store, storage, publicUrl);
let shuttingDown = false;

function authorized(request: IncomingMessage): boolean {
  const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, "") || "";
  const expectedBuffer = Buffer.from(token);
  const suppliedBuffer = Buffer.from(supplied);
  return suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body), "cache-control": "no-store" });
  response.end(body);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const value of request) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    size += chunk.length;
    if (size > requestLimitBytes) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
  catch { throw new RenderError("INVALID_PROJECT", "Render request must contain valid JSON."); }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", "http://localhost");
  if (request.method === "GET" && url.pathname === "/healthz") {
    sendJson(response, shuttingDown ? 503 : 200, { ok: !shuttingDown });
    return;
  }
  if (shuttingDown) {
    sendJson(response, 503, { error: { code: "RENDERER_UNAVAILABLE", message: "The render worker is shutting down." } });
    return;
  }
  if (!authorized(request)) {
    sendJson(response, 401, { error: { code: "ACCESS_DENIED", message: "Worker authorization failed." } });
    return;
  }

  try {
    if (request.method === "POST" && url.pathname === "/v1/renders") {
      const body = await readJson(request) as { project?: unknown };
      if (!body || typeof body !== "object" || !("project" in body)) {
        sendJson(response, 400, { error: { code: "INVALID_PROJECT", message: "Render request is missing its project." } });
        return;
      }
      const job = await service.create(body.project);
      sendJson(response, job.status === "failed" ? 422 : 202, { ...job, storage: "r2-private" });
      return;
    }

    const match = /^\/v1\/renders\/([\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})(?:\/(video\.mp4))?$/i.exec(url.pathname);
    if (!match) {
      sendJson(response, 404, { error: { code: "RENDER_NOT_FOUND", message: "Worker route was not found." } });
      return;
    }
    const renderId = match[1];
    if (match[2] === "video.mp4" && request.method === "GET") {
      if (request.headers.range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(request.headers.range)) {
        response.writeHead(416, { "content-range": "bytes */*", "cache-control": "private, no-store" });
        response.end();
        return;
      }
      const video = await service.getVideo(renderId, request.headers.range);
      if (!video) {
        sendJson(response, 404, { error: { code: "RENDER_NOT_FOUND", message: "A completed persistent MP4 was not found." } });
        return;
      }
      const status = video.contentRange ? 206 : 200;
      response.writeHead(status, {
        "content-type": "video/mp4",
        "accept-ranges": "bytes",
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        ...(video.contentLength === undefined ? {} : { "content-length": video.contentLength }),
        ...(video.contentRange ? { "content-range": video.contentRange } : {}),
      });
      video.body.pipe(response);
      return;
    }
    if (match[2]) {
      sendJson(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Video assets support GET only." } });
      return;
    }
    if (request.method === "GET") {
      const job = await service.get(renderId);
      if (!job) sendJson(response, 404, { error: { code: "RENDER_NOT_FOUND", message: "Render job was not found." } });
      else sendJson(response, 200, { ...job, storage: job.status === "complete" ? "r2-private" : undefined });
      return;
    }
    if (request.method === "DELETE") {
      const job = await service.cancel(renderId);
      if (!job) sendJson(response, 404, { error: { code: "RENDER_NOT_FOUND", message: "Render job was not found." } });
      else sendJson(response, 200, job);
      return;
    }
    sendJson(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Unsupported render method." } });
  } catch (error) {
    if (error instanceof Error && error.message === "REQUEST_TOO_LARGE") {
      sendJson(response, 413, { error: { code: "INVALID_PROJECT", message: "Render request is too large." } });
      return;
    }
    const message = error instanceof Error ? error.message : "Unexpected worker failure.";
    const code = error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : "ENCODING_FAILED";
    console.error("Render worker request failed:", message);
    sendJson(response, code === "RENDERER_UNAVAILABLE" ? 503 : 400, { error: { code, message: message.slice(0, 500) } });
  }
});

server.listen(port, "0.0.0.0", () => console.log(`Scorvik render worker listening on ${port}`));
const queuePoll = setInterval(() => void service.processNext(), 2000);
queuePoll.unref();

let shutdownStarted = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    if (shutdownStarted) return;
    shutdownStarted = true;
    shuttingDown = true;
    clearInterval(queuePoll);
    const shutdown = service.shutdown(7000);
    server.close();
    server.closeIdleConnections();
    void shutdown.finally(() => server.closeAllConnections());
  });
}