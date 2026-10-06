import { createHash, randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { FfmpegRenderEngine, getLocalRenderVideoPath } from "../lib/render/ffmpeg-engine.ts";
import { RenderError, validateRenderProject } from "../lib/render/validation.ts";
import type { RenderJob, VideoProject } from "../types/project.ts";
import type { VideoObjectStorage } from "./object-storage.ts";
import type { RenderJobStore, WorkerRenderRecord } from "./render-job-store.ts";

export interface RenderExecutor {
  render(project: VideoProject, renderId: string, onProgress: (progress: number) => void): Promise<string>;
  cancel(renderId: string): Promise<void>;
}

export class FfmpegRenderExecutor implements RenderExecutor {
  private readonly engine = new FfmpegRenderEngine();

  async render(project: VideoProject, renderId: string, onProgress: (progress: number) => void): Promise<string> {
    let job = await this.engine.createRenderJob(project, renderId);
    const deadline = Date.now() + 12 * 60 * 1000;
    let reportedProgress = job.progress ?? 0;
    while ((job.status === "queued" || job.status === "processing") && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      job = await this.engine.getRenderJob(renderId) ?? job;
      if ((job.progress ?? 0) !== reportedProgress) {
        reportedProgress = job.progress ?? 0;
        onProgress(reportedProgress);
      }
    }
    if (job.status === "queued" || job.status === "processing") {
      await this.engine.cancelRenderJob(renderId);
      throw new RenderError("RENDER_TIMEOUT", "The production render exceeded its worker time limit.");
    }
    if (job.status !== "complete") throw new RenderError(job.errorCode as RenderError["code"] || "ENCODING_FAILED", job.errorMessage || "FFmpeg could not complete this render.");
    const outputPath = await getLocalRenderVideoPath(renderId);
    if (!outputPath || (await stat(outputPath)).size < 1024) throw new RenderError("RENDER_RESULT_INVALID", "The completed FFmpeg output is missing or empty.");
    return outputPath;
  }

  async cancel(renderId: string): Promise<void> {
    await this.engine.cancelRenderJob(renderId);
  }
}

function renderJobFromRecord(record: WorkerRenderRecord, workerPublicUrl: string): RenderJob {
  const job: RenderJob = {
    renderId: record.renderId,
    status: record.status,
    mode: "real",
    engine: "external",
    progress: record.progress,
    updatedAt: record.updatedAt,
    errorCode: record.errorCode,
    errorMessage: record.errorMessage,
  };
  if (record.status === "complete") job.outputUrl = `${workerPublicUrl}/v1/renders/${record.renderId}/video.mp4`;
  return job;
}

export class RenderWorkerService {
  private busy = false;
  private stopping = false;
  private activeRenderId: string | undefined;
  private queueCycle: Promise<void> | undefined;
  private readonly store: RenderJobStore;
  private readonly storage: VideoObjectStorage;
  private readonly workerPublicUrl: string;
  private readonly executor: RenderExecutor;
  private readonly autoStart: boolean;

  constructor(
    store: RenderJobStore,
    storage: VideoObjectStorage,
    workerPublicUrl: string,
    executor: RenderExecutor = new FfmpegRenderExecutor(),
    options: { autoStart?: boolean } = {},
  ) {
    const url = new URL(workerPublicUrl);
    if (url.protocol !== "https:") throw new Error("The worker public URL must use HTTPS.");
    this.store = store;
    this.storage = storage;
    this.workerPublicUrl = url.origin;
    this.executor = executor;
    this.autoStart = options.autoStart ?? true;
  }

  async create(project: unknown): Promise<RenderJob> {
    if (this.stopping) throw new RenderError("RENDERER_UNAVAILABLE", "The render worker is shutting down and cannot accept new jobs.");
    validateRenderProject(project);
    const normalizedProject = project as VideoProject;
    const idempotencyKey = createHash("sha256").update(normalizedProject.id).update("\0").update(JSON.stringify(normalizedProject)).digest("hex");
    const record = await this.store.enqueue(normalizedProject, idempotencyKey, randomUUID());
    if (this.autoStart && record.status === "queued") void this.processNext();
    return renderJobFromRecord(record, this.workerPublicUrl);
  }

  async get(renderId: string): Promise<RenderJob | undefined> {
    const record = await this.store.get(renderId);
    return record ? renderJobFromRecord(record, this.workerPublicUrl) : undefined;
  }

  async cancel(renderId: string): Promise<RenderJob | undefined> {
    const record = await this.store.get(renderId);
    if (!record) return undefined;
    if (record.status === "queued" || record.status === "processing") {
      await this.executor.cancel(renderId);
      await this.store.fail(renderId, "RENDER_CANCELLED", "Rendering was cancelled.");
    }
    return this.get(renderId);
  }

  async getVideo(renderId: string, range?: string) {
    const record = await this.store.get(renderId);
    if (record?.status !== "complete" || record.outputKey !== `renders/${renderId}/film.mp4`) return undefined;
    return this.storage.getObject(record.outputKey, range);
  }

  processNext(): Promise<void> {
    if (this.busy || this.stopping) return Promise.resolve();
    this.busy = true;
    const queueCycle = this.processNextCycle();
    this.queueCycle = queueCycle;
    void queueCycle.finally(() => {
      if (this.queueCycle === queueCycle) this.queueCycle = undefined;
      this.activeRenderId = undefined;
      this.busy = false;
    }).catch(() => {});
    return queueCycle;
  }

  private async processNextCycle(): Promise<void> {
    try {
      const record = await this.store.claimNext(new Date(Date.now() - 20 * 60 * 1000));
      if (!record) return;
      this.activeRenderId = record.renderId;
      if (this.stopping) {
        await this.store.fail(record.renderId, "RENDER_CANCELLED", "The worker is shutting down; this render can be retried.");
        return;
      }
      await this.process(record);
    } catch (error) {
      console.error("Render queue polling failed:", error instanceof Error ? error.message : "unknown error");
    }
  }

  async shutdown(gracePeriodMs = 6000): Promise<void> {
    this.stopping = true;
    const queueCycle = this.queueCycle;
    if (!queueCycle) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const finished = await Promise.race([
      queueCycle.then(() => true),
      new Promise<false>((resolve) => { timeout = setTimeout(() => resolve(false), Math.max(0, gracePeriodMs)); }),
    ]);
    if (timeout) clearTimeout(timeout);
    if (finished) return;

    const renderId = this.activeRenderId;
    if (renderId) {
      await this.executor.cancel(renderId).catch(() => {});
      await this.store.fail(renderId, "RENDER_CANCELLED", "The worker shutdown window expired; this render can be retried.");
    }
    await Promise.race([queueCycle, new Promise<void>((resolve) => setTimeout(resolve, 1000))]);
  }

  private async process(record: WorkerRenderRecord): Promise<void> {
    const outputKey = `renders/${record.renderId}/film.mp4`;
    try {
      let lastUpdate = 0;
      const outputPath = await this.executor.render(record.project, record.renderId, (progress) => {
        const now = Date.now();
        if (now - lastUpdate < 3000 && progress < 99) return;
        lastUpdate = now;
        void this.store.updateProgress(record.renderId, progress).catch((error: unknown) => {
          console.error("Could not persist render progress:", error instanceof Error ? error.message : "unknown error");
        });
      });
      await this.storage.putFile(outputKey, outputPath);
      const completed = await this.store.complete(record.renderId, outputKey);
      if (!completed) await this.storage.deleteObject(outputKey);
    } catch (error) {
      const code = error instanceof RenderError ? error.code : "ENCODING_FAILED";
      const message = error instanceof Error ? error.message : "The production render failed unexpectedly.";
      await this.storage.deleteObject(outputKey).catch(() => {});
      await this.store.fail(record.renderId, code, message);
    }
  }
}