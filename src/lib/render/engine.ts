import { randomUUID } from "node:crypto";
import type { RenderJob, VideoProject } from "@/types/project";
import { FfmpegRenderEngine, type RenderEngine } from "./ffmpeg-engine.ts";
import { ExternalRenderEngine } from "./external-engine.ts";
import { RenderError, validateRenderProject } from "./validation.ts";

class UnavailableRenderEngine implements RenderEngine {
  readonly engine = "external" as const;
  private readonly jobs = new Map<string, RenderJob>();

  async createRenderJob(project: VideoProject): Promise<RenderJob> {
    validateRenderProject(project);
    const job: RenderJob = {
      renderId: randomUUID(),
      status: "failed",
      mode: "real",
      engine: "external",
      progress: 0,
      errorCode: "RENDERER_UNAVAILABLE",
      errorMessage: "Production rendering is not configured for this deployment. Configure the external render provider before requesting an MP4.",
    };
    this.jobs.set(job.renderId, job);
    return job;
  }

  async render(renderId: string): Promise<RenderJob> {
    const job = this.jobs.get(renderId);
    if (!job) throw new RenderError("INVALID_PROJECT", "Render job was not found.");
    return job;
  }

  async getRenderJob(renderId: string): Promise<RenderJob | undefined> {
    return this.jobs.get(renderId);
  }

  async cancelRenderJob(renderId: string): Promise<RenderJob | undefined> {
    return this.jobs.get(renderId);
  }
}

let localEngine: FfmpegRenderEngine | undefined;

export function getRenderEngine(): RenderEngine {
  if (process.env.VERCEL === "1") {
    const baseUrl = process.env.SCORVIK_RENDER_PROVIDER_URL;
    const token = process.env.SCORVIK_RENDER_PROVIDER_TOKEN;
    return baseUrl && token ? new ExternalRenderEngine(baseUrl, token) : new UnavailableRenderEngine();
  }
  localEngine ??= new FfmpegRenderEngine();
  return localEngine;
}