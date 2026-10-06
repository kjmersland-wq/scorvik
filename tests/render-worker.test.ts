import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import { defaultAudioMix } from "../src/lib/audio/mix.ts";
import { getProjectVideoUrl } from "../src/lib/projects.ts";
import { RenderError } from "../src/lib/render/validation.ts";
import type { SiteAnalysis, VideoProject } from "../src/types/project.ts";
import type { VideoObjectStorage } from "../src/worker/object-storage.ts";
import type { RenderExecutor } from "../src/worker/render-service.ts";
import { RenderWorkerService } from "../src/worker/render-service.ts";
import type { RenderJobStore, WorkerRenderRecord } from "../src/worker/render-job-store.ts";

function makeProject(): VideoProject {
  const analysis: SiteAnalysis = {
    url: "https://slow-blues.com/",
    title: "Slow Blues",
    description: "A blues music reference site.",
    brand: "Slow Blues",
    colors: [],
    sellingPoints: [],
    image: "",
  };
  return {
    id: "slowblues-worker-test",
    title: "Slow Blues production test",
    url: analysis.url,
    createdAt: new Date(0).toISOString(),
    analysis,
    scenes: [
      { id: "hook", order: 0, purpose: "Hook", duration: 7, headline: "Slow Blues", supportingText: "Artists and history", voiceover: "", transition: "Slow reveal", visual: "https://example.com/hook.jpg" },
      { id: "cta", order: 1, purpose: "CTA", duration: 8, headline: "Explore the archive", supportingText: "Discover more", voiceover: "", transition: "Fade out", visual: "https://example.com/archive.jpg" },
    ],
    settings: { mode: "advert", showTextOnScreen: true, format: "16:9", duration: 15, language: "English", voice: "Maya · warm", style: "Editorial", music: "Modern", musicTrackId: null, audioMix: defaultAudioMix },
    version: 1,
  };
}

class MemoryJobStore implements RenderJobStore {
  readonly records = new Map<string, WorkerRenderRecord>();
  readonly transitions: string[] = [];

  async enqueue(project: VideoProject, idempotencyKey: string, renderId: string): Promise<WorkerRenderRecord> {
    const existing = [...this.records.values()].find((record) => record.idempotencyKey === idempotencyKey);
    if (existing && existing.status !== "failed") return existing;
    const record: WorkerRenderRecord = { renderId, idempotencyKey, status: "queued", progress: 0, project, updatedAt: new Date().toISOString() };
    this.records.set(renderId, record);
    this.transitions.push("queued");
    return record;
  }

  async get(renderId: string): Promise<WorkerRenderRecord | undefined> {
    return this.records.get(renderId);
  }

  async claimNext(): Promise<WorkerRenderRecord | undefined> {
    const record = [...this.records.values()].find((candidate) => candidate.status === "queued");
    if (!record) return undefined;
    record.status = "processing";
    record.progress = 1;
    this.transitions.push("processing");
    return record;
  }

  async updateProgress(renderId: string, progress: number): Promise<void> {
    const record = this.records.get(renderId);
    if (record?.status === "processing") record.progress = progress;
  }

  async complete(renderId: string, outputKey: string): Promise<boolean> {
    const record = this.records.get(renderId);
    if (record?.status !== "processing") return false;
    record.status = "complete";
    record.progress = 100;
    record.outputKey = outputKey;
    this.transitions.push("complete");
    return true;
  }

  async fail(renderId: string, errorCode: string, errorMessage: string): Promise<void> {
    const record = this.records.get(renderId);
    if (!record || record.status === "complete" || record.status === "failed") return;
    record.status = "failed";
    record.errorCode = errorCode;
    record.errorMessage = errorMessage;
    this.transitions.push("failed");
  }
}

class MemoryVideoStorage implements VideoObjectStorage {
  readonly objects = new Map<string, string>();
  failUploads = false;

  async putFile(key: string, filePath: string): Promise<void> {
    if (this.failUploads) throw new Error("R2 upload failed.");
    this.objects.set(key, filePath);
  }

  async getObject(key: string) {
    const filePath = this.objects.get(key);
    if (!filePath) throw new Error("object missing");
    const body = Buffer.from(filePath);
    return { body: Readable.from(body), contentLength: body.length };
  }

  async deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
  }
}

class TestExecutor implements RenderExecutor {
  private readonly failure?: Error;

  constructor(failure?: Error) {
    this.failure = failure;
  }

  async render(_project: VideoProject, _renderId: string, onProgress: (progress: number) => void): Promise<string> {
    onProgress(42);
    if (this.failure) throw this.failure;
    return "verified-film.mp4";
  }

  async cancel(): Promise<void> {}
}

class BlockingExecutor implements RenderExecutor {
  private rejectRender: ((error: Error) => void) | undefined;
  private resolveRender: ((filePath: string) => void) | undefined;
  private resolveStarted: (() => void) | undefined;
  readonly started = new Promise<void>((resolve) => { this.resolveStarted = resolve; });
  cancelled = false;

  render(_project: VideoProject, _renderId: string, onProgress: (progress: number) => void): Promise<string> {
    onProgress(10);
    this.resolveStarted?.();
    return new Promise((resolve, reject) => {
      this.resolveRender = resolve;
      this.rejectRender = reject;
    });
  }

  finish(): void {
    this.resolveRender?.("verified-film.mp4");
  }

  async cancel(): Promise<void> {
    this.cancelled = true;
    this.rejectRender?.(new RenderError("RENDER_CANCELLED", "Render cancelled for worker shutdown."));
  }
}

test("production worker persists queue, processing, R2 completion, and the existing playback URL", async () => {
  const store = new MemoryJobStore();
  const storage = new MemoryVideoStorage();
  const service = new RenderWorkerService(store, storage, "https://render-worker.example", new TestExecutor(), { autoStart: false });
  const project = makeProject();
  const queued = await service.create(project);

  assert.equal(queued.status, "queued");
  assert.equal((await service.create(project)).renderId, queued.renderId);
  await service.processNext();

  const complete = await service.get(queued.renderId);
  assert.ok(complete);
  assert.equal(complete?.status, "complete");
  assert.equal(complete?.progress, 100);
  assert.deepEqual(store.transitions, ["queued", "processing", "complete"]);
  assert.equal(complete?.outputUrl, `https://render-worker.example/v1/renders/${queued.renderId}/video.mp4`);
  assert.equal(store.records.get(queued.renderId)?.outputKey, `renders/${queued.renderId}/film.mp4`);
  assert.equal(storage.objects.get(`renders/${queued.renderId}/film.mp4`), "verified-film.mp4");
  assert.equal(getProjectVideoUrl({ renderJob: { ...complete, outputUrl: `/api/render/jobs/${queued.renderId}/video` } }), `/api/render/jobs/${queued.renderId}/video`);
  assert.equal((await service.getVideo(queued.renderId))?.contentLength, Buffer.byteLength("verified-film.mp4"));
});

test("production worker records render failures without publishing an MP4 URL", async () => {
  const store = new MemoryJobStore();
  const storage = new MemoryVideoStorage();
  const service = new RenderWorkerService(store, storage, "https://render-worker.example", new TestExecutor(new RenderError("MISSING_VISUAL", "Scene 2 has no valid project image.")), { autoStart: false });
  const queued = await service.create(makeProject());

  await service.processNext();

  const failed = await service.get(queued.renderId);
  assert.equal(failed?.status, "failed");
  assert.equal(failed?.errorCode, "MISSING_VISUAL");
  assert.equal(failed?.errorMessage, "Scene 2 has no valid project image.");
  assert.deepEqual(store.transitions, ["queued", "processing", "failed"]);
  assert.equal(failed?.outputUrl, undefined);
  assert.equal(storage.objects.size, 0);
});

test("production worker fails the RenderJob when persistent MP4 storage fails", async () => {
  const store = new MemoryJobStore();
  const storage = new MemoryVideoStorage();
  storage.failUploads = true;
  const service = new RenderWorkerService(store, storage, "https://render-worker.example", new TestExecutor(), { autoStart: false });
  const queued = await service.create(makeProject());

  await service.processNext();

  const failed = await service.get(queued.renderId);
  assert.equal(failed?.status, "failed");
  assert.equal(failed?.errorCode, "ENCODING_FAILED");
  assert.equal(failed?.errorMessage, "R2 upload failed.");
  assert.equal(failed?.outputUrl, undefined);
});

test("worker shutdown cancels an over-deadline render and leaves it retryable", async () => {
  const store = new MemoryJobStore();
  const storage = new MemoryVideoStorage();
  const executor = new BlockingExecutor();
  const service = new RenderWorkerService(store, storage, "https://render-worker.example", executor, { autoStart: false });
  const queued = await service.create(makeProject());
  const queueCycle = service.processNext();
  await executor.started;

  await service.shutdown(5);
  await queueCycle;

  assert.equal(executor.cancelled, true);
  assert.deepEqual(store.transitions, ["queued", "processing", "failed"]);
  assert.equal((await service.get(queued.renderId))?.status, "failed");
  await assert.rejects(service.create(makeProject()), { code: "RENDERER_UNAVAILABLE" });

  const restartedService = new RenderWorkerService(store, storage, "https://render-worker.example", new TestExecutor(), { autoStart: false });
  const retry = await restartedService.create(makeProject());
  assert.equal(retry.status, "queued");
  assert.notEqual(retry.renderId, queued.renderId);
});

test("worker shutdown waits for an active render that finishes within the grace window", async () => {
  const store = new MemoryJobStore();
  const storage = new MemoryVideoStorage();
  const executor = new BlockingExecutor();
  const service = new RenderWorkerService(store, storage, "https://render-worker.example", executor, { autoStart: false });
  const queued = await service.create(makeProject());
  const queueCycle = service.processNext();
  await executor.started;
  const shutdown = service.shutdown(100);

  executor.finish();
  await Promise.all([queueCycle, shutdown]);

  assert.equal(executor.cancelled, false);
  assert.deepEqual(store.transitions, ["queued", "processing", "complete"]);
  assert.equal((await service.get(queued.renderId))?.status, "complete");
  assert.equal(storage.objects.get(`renders/${queued.renderId}/film.mp4`), "verified-film.mp4");
});