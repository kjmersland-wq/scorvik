import type { VideoProject, RenderJob } from "@/types/project";
import { RenderError, type RenderErrorCode } from "./validation.ts";
import type { RenderEngine } from "./ffmpeg-engine.ts";

interface ExternalRenderResponse {
  renderId?: unknown;
  status?: unknown;
  outputUrl?: unknown;
  progress?: unknown;
  errorCode?: unknown;
  errorMessage?: unknown;
}

const renderErrorCodes = new Set<RenderErrorCode>([
  "INVALID_PROJECT", "INVALID_RENDER_SETTINGS", "MISSING_SCENES", "INVALID_SCENE_DURATION", "MISSING_VISUAL", "INVALID_MEDIA", "MISSING_AUDIO",
  "RENDERER_UNAVAILABLE", "RENDER_TIMEOUT", "RENDER_CANCELLED", "ENCODING_FAILED", "RENDER_RESULT_INVALID",
]);

function normalizeJob(value: unknown): RenderJob {
  if (!value || typeof value !== "object") throw new RenderError("ENCODING_FAILED", "External renderer returned an invalid job response.");
  const response = value as ExternalRenderResponse;
  if (typeof response.renderId !== "string" || !/^[\da-z_-]{1,128}$/i.test(response.renderId)) {
    throw new RenderError("ENCODING_FAILED", "External renderer returned an invalid job ID.");
  }
  const status = response.status;
  if (status !== "queued" && status !== "processing" && status !== "complete" && status !== "failed") {
    throw new RenderError("ENCODING_FAILED", "External renderer returned an unsupported job state.");
  }
  const job: RenderJob = {
    renderId: response.renderId,
    status,
    mode: "real",
    engine: "external",
    progress: typeof response.progress === "number" ? Math.max(0, Math.min(100, response.progress)) : undefined,
    errorCode: typeof response.errorCode === "string" ? response.errorCode.slice(0, 80) : undefined,
    errorMessage: typeof response.errorMessage === "string" ? response.errorMessage.slice(0, 500) : undefined,
  };
  if (status === "complete") {
    if (typeof response.outputUrl !== "string") throw new RenderError("RENDER_RESULT_INVALID", "External renderer marked a job complete without a video URL.");
    let url: URL;
    try { url = new URL(response.outputUrl); } catch { throw new RenderError("RENDER_RESULT_INVALID", "External renderer returned an invalid video URL."); }
    if (url.protocol !== "https:" || !url.pathname.toLowerCase().endsWith(".mp4")) throw new RenderError("RENDER_RESULT_INVALID", "External renderer result must be an HTTPS MP4 URL.");
    job.outputUrl = `/api/render/jobs/${job.renderId}/video`;
  }
  if (status === "failed" && !job.errorMessage) job.errorMessage = "External renderer could not complete this film.";
  return job;
}

export class ExternalRenderEngine implements RenderEngine {
  readonly engine = "external" as const;
  private readonly endpoint: URL;
  private readonly token: string;

  constructor(baseUrl: string, token: string) {
    this.token = token;
    try { this.endpoint = new URL(baseUrl); } catch { throw new RenderError("RENDERER_UNAVAILABLE", "The external renderer URL is invalid."); }
    if (this.endpoint.protocol !== "https:" || !token) throw new RenderError("RENDERER_UNAVAILABLE", "The external renderer requires an HTTPS URL and server token.");
    this.endpoint.pathname = `${this.endpoint.pathname.replace(/\/$/, "")}/v1/renders`;
  }

  async createRenderJob(project: VideoProject): Promise<RenderJob> {
    const response = await this.request(this.endpoint, { method: "POST", body: JSON.stringify({ project }) });
    return normalizeJob(response);
  }

  async render(renderId: string): Promise<RenderJob> {
    const job = await this.getRenderJob(renderId);
    if (!job) throw new RenderError("INVALID_PROJECT", "The external render job was not found.");
    return job;
  }

  async getRenderJob(renderId: string): Promise<RenderJob | undefined> {
    if (!/^[\da-z_-]{1,128}$/i.test(renderId)) return undefined;
    const url = new URL(`${this.endpoint.href.replace(/\/$/, "")}/${encodeURIComponent(renderId)}`);
    try { return normalizeJob(await this.request(url, { method: "GET" })); }
    catch (error) { if (error instanceof RenderError && error.code === "INVALID_PROJECT") return undefined; throw error; }
  }

  async cancelRenderJob(renderId: string): Promise<RenderJob | undefined> {
    if (!/^[\da-z_-]{1,128}$/i.test(renderId)) return undefined;
    const url = new URL(`${this.endpoint.href.replace(/\/$/, "")}/${encodeURIComponent(renderId)}`);
    try { return normalizeJob(await this.request(url, { method: "DELETE" })); }
    catch (error) { if (error instanceof RenderError && error.code === "INVALID_PROJECT") return undefined; throw error; }
  }

  async getVideoResponse(renderId: string, range?: string): Promise<Response> {
    if (!/^[\da-z_-]{1,128}$/i.test(renderId)) throw new RenderError("INVALID_PROJECT", "Render ID is invalid.");
    const url = new URL(`${encodeURIComponent(renderId)}/video.mp4`, `${this.endpoint.href.replace(/\/$/, "")}/`);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      let response: Response;
      try {
        response = await fetch(url, {
          headers: { authorization: `Bearer ${this.token}`, accept: "video/mp4", ...(range ? { range } : {}) },
          cache: "no-store",
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
      const headers = new Headers();
      for (const name of ["accept-ranges", "cache-control", "content-length", "content-range", "content-type", "x-content-type-options"]) {
        const value = response.headers.get(name);
        if (value) headers.set(name, value);
      }
      return new Response(response.body, { status: response.status, headers });
    } catch {
      throw new RenderError("RENDERER_UNAVAILABLE", "The production video storage could not be reached.");
    }
  }

  private async request(url: URL, init: { method: string; body?: string }): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: init.method,
        headers: { authorization: `Bearer ${this.token}`, accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}) },
        body: init.body,
        signal: AbortSignal.timeout(12_000),
        cache: "no-store",
      });
    } catch {
      throw new RenderError("RENDERER_UNAVAILABLE", "The configured external renderer could not be reached.");
    }
    if (!response.ok) {
      let details: { error?: { code?: unknown; message?: unknown } } = {};
      try { details = await response.json() as typeof details; } catch {}
      const code = response.status === 404
        ? "INVALID_PROJECT"
        : response.status >= 500
          ? "RENDERER_UNAVAILABLE"
          : typeof details.error?.code === "string" && renderErrorCodes.has(details.error.code as RenderErrorCode)
            ? details.error.code as RenderErrorCode
            : "ENCODING_FAILED";
      const message = typeof details.error?.message === "string" ? details.error.message.slice(0, 500) : `External renderer returned HTTP ${response.status}.`;
      throw new RenderError(code, message);
    }
    try { return await response.json(); } catch { throw new RenderError("ENCODING_FAILED", "External renderer returned malformed JSON."); }
  }
}