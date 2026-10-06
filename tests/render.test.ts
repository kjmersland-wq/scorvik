import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { execFile } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { defaultAudioMix } from "../src/lib/audio/mix.ts";
import { getProjectVideoUrl } from "../src/lib/projects.ts";
import { ExternalRenderEngine } from "../src/lib/render/external-engine.ts";
import { FfmpegRenderEngine, getLocalRenderVideoPath } from "../src/lib/render/ffmpeg-engine.ts";
import { getRenderEngine } from "../src/lib/render/engine.ts";
import { normalizeSceneDurations, validateRenderProject } from "../src/lib/render/validation.ts";
import type { SiteAnalysis, VideoProject } from "../src/types/project.ts";

const execFileAsync = promisify(execFile);
const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
const ffprobe = process.env.FFPROBE_PATH || "ffprobe";
const ffmpegAvailable = spawnSync(ffmpeg, ["-version"], { stdio: "ignore" }).status === 0;
const ffprobeAvailable = spawnSync(ffprobe, ["-version"], { stdio: "ignore" }).status === 0;

function makeProject(overrides: Partial<VideoProject> = {}): VideoProject {
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
    id: "slowblues-test",
    title: "Slow Blues test film",
    url: analysis.url,
    createdAt: new Date(0).toISOString(),
    analysis,
    scenes: [
      { id: "scene-1", order: 0, purpose: "Hook", duration: 7, headline: "Slow Blues", supportingText: "Artists and history", voiceover: "Slow Blues. Artists and history.", transition: "Slow reveal", visual: "https://example.invalid/scene-1.jpg" },
      { id: "scene-2", order: 1, purpose: "CTA", duration: 8, headline: "Explore the archive", supportingText: "Discover more", voiceover: "Explore the archive. Discover more.", transition: "Fade out", visual: "https://example.invalid/scene-2.jpg", cta: "Explore" },
    ],
    settings: { mode: "advert", showTextOnScreen: true, format: "16:9", duration: 15, language: "English", voice: "Maya · warm", style: "Editorial", music: "Modern", musicTrackId: "warm-104-ad", audioMix: defaultAudioMix },
    version: 1,
    ...overrides,
  };
}

test("validates render settings and normalizes ordered scene durations exactly", () => {
  const project = makeProject();
  assert.doesNotThrow(() => validateRenderProject(project));
  const roundedScenes = project.scenes.map((scene, index) => ({ ...scene, duration: index === 0 ? 7 : 7.5 }));
  const normalized = normalizeSceneDurations(roundedScenes, 15);
  assert.equal(normalized.reduce((sum, scene) => sum + scene.duration, 0), 15);
  assert.deepEqual(normalized.map((scene) => scene.id), ["scene-1", "scene-2"]);
  const longNormalized = normalizeSceneDurations(project.scenes.map((scene) => ({ ...scene, duration: scene.duration * 6 })), 90);
  assert.equal(longNormalized.reduce((sum, scene) => sum + scene.duration, 0), 90);
  assert.throws(() => normalizeSceneDurations(project.scenes, 90), { code: "INVALID_SCENE_DURATION" });
  assert.throws(() => validateRenderProject({ ...project, settings: { ...project.settings, duration: 44 } }), { code: "INVALID_RENDER_SETTINGS" });
});

test("Vercel without an external renderer fails honestly instead of creating a mock completion", async () => {
  const oldVercel = process.env.VERCEL;
  const oldUrl = process.env.SCORVIK_RENDER_PROVIDER_URL;
  const oldToken = process.env.SCORVIK_RENDER_PROVIDER_TOKEN;
  process.env.VERCEL = "1";
  delete process.env.SCORVIK_RENDER_PROVIDER_URL;
  delete process.env.SCORVIK_RENDER_PROVIDER_TOKEN;
  try {
    const job = await getRenderEngine().createRenderJob(makeProject());
    assert.equal(job.status, "failed");
    assert.equal(job.mode, "real");
    assert.equal(job.engine, "external");
    assert.equal(job.outputUrl, undefined);
    assert.equal(job.errorCode, "RENDERER_UNAVAILABLE");
  } finally {
    if (oldVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = oldVercel;
    if (oldUrl === undefined) delete process.env.SCORVIK_RENDER_PROVIDER_URL; else process.env.SCORVIK_RENDER_PROVIDER_URL = oldUrl;
    if (oldToken === undefined) delete process.env.SCORVIK_RENDER_PROVIDER_TOKEN; else process.env.SCORVIK_RENDER_PROVIDER_TOKEN = oldToken;
  }
});

test("external renderer rejects a completed job without a real HTTPS MP4", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ renderId: "external-123", status: "complete" }), { status: 200 })) as typeof fetch;
  try {
    const engine = new ExternalRenderEngine("https://renderer.example", "test-token");
    await assert.rejects(engine.createRenderJob(makeProject()), { code: "RENDER_RESULT_INVALID" });
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("production MP4 references become same-origin playback URLs and preserve authenticated byte ranges", async () => {
  const previousFetch = globalThis.fetch;
  const requests: Array<{ url: string; authorization: string | null; range: string | null }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    requests.push({ url, authorization: headers.get("authorization"), range: headers.get("range") });
    if (url.endsWith("/v1/renders")) {
      return new Response(JSON.stringify({ renderId: "external-123", status: "complete", progress: 100, outputUrl: "https://render-worker.example/v1/renders/external-123/video.mp4" }), { status: 200 });
    }
    return new Response(Buffer.from("mp4"), { status: 206, headers: { "content-type": "video/mp4", "content-range": "bytes 0-2/3", "content-length": "3", "accept-ranges": "bytes" } });
  }) as typeof fetch;
  try {
    const engine = new ExternalRenderEngine("https://render-worker.example", "server-only-token");
    const job = await engine.createRenderJob(makeProject());
    assert.equal(job.outputUrl, "/api/render/jobs/external-123/video");
    assert.equal(getProjectVideoUrl({ renderJob: job }), "/api/render/jobs/external-123/video");

    const video = await engine.getVideoResponse(job.renderId, "bytes=0-2");
    assert.equal(video.status, 206);
    assert.equal(video.headers.get("content-range"), "bytes 0-2/3");
    assert.deepEqual(requests.map(({ url }) => url), [
      "https://render-worker.example/v1/renders",
      "https://render-worker.example/v1/renders/external-123/video.mp4",
    ]);
    assert.ok(requests.every(({ authorization }) => authorization === "Bearer server-only-token"));
    assert.equal(requests[1].range, "bytes=0-2");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("FFmpeg creates a complete RenderJob backed by a verified H.264/AAC MP4", { skip: !ffmpegAvailable || !ffprobeAvailable }, async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "scorvik-render-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const imagePath = path.join(directory, "source.png");
  await execFileAsync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=0x315c68:s=320x180", "-frames:v", "1", imagePath]);
  const engine = new FfmpegRenderEngine({
    resolveSceneImages: async (project) => project.scenes.map(() => imagePath),
    encoding: { dimensions: { width: 320, height: 180 }, frameRate: 10, timeoutMs: 60_000 },
  });
  const queued = await engine.createRenderJob(makeProject());
  assert.equal(queued.status, "queued");
  const deadline = Date.now() + 60_000;
  let job = queued;
  while ((job.status === "queued" || job.status === "processing") && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    job = await engine.getRenderJob(queued.renderId) ?? job;
  }
  assert.equal(job.status, "complete", job.errorMessage);
  assert.equal(job.mode, "real");
  assert.equal(job.engine, "ffmpeg");
  assert.equal(job.outputUrl, `/api/render/jobs/${job.renderId}/video`);
  const outputPath = await getLocalRenderVideoPath(job.renderId);
  assert.ok(outputPath);
  const actualDuration = 15;
  const file = await stat(outputPath);
  const { stdout } = await execFileAsync(ffprobe, ["-v", "error", "-show_entries", "format=format_name,duration:stream=codec_type,codec_name,width,height", "-of", "json", outputPath]);
  const result = JSON.parse(stdout) as { format: { format_name: string; duration: string }; streams: Array<{ codec_type: string; codec_name: string; width?: number; height?: number }> };

  assert.ok(file.size > 1024);
  assert.ok(result.format.format_name.split(",").includes("mp4"));
  assert.equal(actualDuration, 15);
  assert.ok(Math.abs(Number(result.format.duration) - 15) <= 0.1);
  assert.ok(result.streams.some((stream) => stream.codec_type === "video" && stream.codec_name === "h264" && stream.width === 320 && stream.height === 180));
  assert.ok(result.streams.some((stream) => stream.codec_type === "audio" && stream.codec_name === "aac"));
});