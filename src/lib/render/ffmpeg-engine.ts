import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fitMusicToVideo } from "../audio/mix.ts";
import type { RenderJob, VideoProject } from "@/types/project";
import { prepareSceneImages, resolveSelectedMusic } from "./media.ts";
import { normalizeSceneDurations, renderDimensions, RenderError, validateRenderProject } from "./validation.ts";

export interface RenderEngine {
  readonly engine: "ffmpeg" | "external";
  createRenderJob(project: VideoProject, renderId?: string): Promise<RenderJob>;
  render(renderId: string, onUpdate?: (job: RenderJob) => void): Promise<RenderJob>;
  getRenderJob(renderId: string): Promise<RenderJob | undefined>;
  cancelRenderJob(renderId: string): Promise<RenderJob | undefined>;
  getVideoResponse?(renderId: string, range?: string): Promise<Response>;
}

const renderRoot = path.resolve(/* turbopackIgnore: true */ process.env.SCORVIK_RENDER_OUTPUT_DIR || path.join(process.cwd(), ".scorvik-renders"));
const renderIdPattern = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const jobWriteQueues = new Map<string, Promise<void>>();

function ffmpegBinary(): string {
  return process.env.FFMPEG_PATH || "ffmpeg";
}

function ffprobeBinary(): string {
  return process.env.FFPROBE_PATH || "ffprobe";
}

function renderFontPath(): string {
  const configured = process.env.SCORVIK_FONT_PATH;
  const candidates = configured ? [configured] : process.platform === "win32"
    ? ["C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/segoeui.ttf"]
    : ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf"];
  const fontPath = candidates.find((candidate) => existsSync(candidate));
  if (!fontPath) throw new RenderError("RENDERER_UNAVAILABLE", "No render font was found. Set SCORVIK_FONT_PATH to a readable TTF font file.");
  return fontPath;
}

function escapeFilterPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function renderDirectory(renderId: string): string {
  if (!renderIdPattern.test(renderId)) throw new RenderError("INVALID_PROJECT", "Render ID is invalid.");
  return path.join(/* turbopackIgnore: true */ renderRoot, renderId);
}

function runProcess(binary: string, args: string[], options: { cwd: string; timeoutMs: number; onProgress?: (seconds: number) => void; onStart?: (child: ChildProcessWithoutNullStreams) => void; onClose?: () => void }): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd: options.cwd, shell: false, windowsHide: true });
    options.onStart?.(child);
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => child.kill("SIGKILL"), options.timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stdout = `${stdout}${text}`.slice(-64_000);
      for (const match of text.matchAll(/out_time_ms=(\d+)/g)) options.onProgress?.(Number(match[1]) / 1_000_000);
    });
    child.stderr.on("data", (chunk: Buffer) => { stderr = `${stderr}${chunk.toString("utf8")}`.slice(-64_000); });
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      options.onClose?.();
      reject(new RenderError("RENDERER_UNAVAILABLE", error.message.includes("ENOENT") ? "FFmpeg is not installed or FFMPEG_PATH is not configured." : "Could not start the configured renderer."));
    });
    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      options.onClose?.();
      if (signal) reject(new RenderError("RENDER_TIMEOUT", "FFmpeg rendering exceeded its time limit."));
      else if (code !== 0) reject(new RenderError("ENCODING_FAILED", stderr.trim().slice(-2000) || `FFmpeg exited with status ${code}.`));
      else resolve({ stdout, stderr });
    });
  });
}

async function validImage(filePath: string): Promise<boolean> {
  try {
    const { stdout } = await runProcess(ffprobeBinary(), ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_type,width,height", "-of", "json", filePath], { cwd: path.dirname(filePath), timeoutMs: 5000 });
    const data = JSON.parse(stdout) as { streams?: Array<{ codec_type?: string; width?: number; height?: number }> };
    const stream = data.streams?.[0];
    return stream?.codec_type === "video" && Number.isInteger(stream.width) && Number.isInteger(stream.height) && (stream.width ?? 0) <= 10_000 && (stream.height ?? 0) <= 10_000;
  } catch {
    return false;
  }
}

function wrapText(value: string, maxCharacters: number): string {
  const words = value.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxCharacters && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, 4).join("\n");
}

function cameraMotion(purpose: string, order: number, duration: number, frameRate: number): string {
  const progress = `min(on/${frameRate * duration},1)`;
  if (purpose === "Hook" || purpose === "Product") return `zoompan=z='min(zoom+0.00045,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
  if (purpose === "Benefit" || purpose === "Story") {
    const direction = order % 2 === 0 ? progress : `1-${progress}`;
    return `zoompan=z='1.05':x='(iw-iw/zoom)*${direction}':y='ih/2-(ih/zoom/2)'`;
  }
  const pullOut = `max(1.08-on/${frameRate * duration * 12},1.0)`;
  return `zoompan=z='${pullOut}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
}

function transitionFor(sceneTransition: string): string {
  const transition = sceneTransition.toLowerCase();
  if (transition.includes("dissolve") || transition.includes("overtoning")) return "dissolve";
  if (transition.includes("fade")) return "fadeblack";
  return "fade";
}

interface EncodingOptions {
  dimensions?: { width: number; height: number };
  frameRate?: number;
  timeoutMs?: number;
}

interface FfmpegRenderEngineOptions {
  resolveSceneImages?: (project: VideoProject, renderDirectory: string) => Promise<string[]>;
  encoding?: EncodingOptions;
}

async function encodeProject(
  project: VideoProject,
  renderId: string,
  outputPath: string,
  onProgress: (value: number) => void,
  processHooks: { onStart: (child: ChildProcessWithoutNullStreams) => void; onClose: () => void },
  preparedImages?: string[],
  encodingOptions: EncodingOptions = {},
): Promise<number> {
  validateRenderProject(project);
  const workDirectory = preparedImages ? path.dirname(outputPath) : renderDirectory(renderId);
  await mkdir(workDirectory, { recursive: true });
  const scenes = normalizeSceneDurations(project.scenes, project.settings.duration);
  const sceneImages = preparedImages ?? await prepareSceneImages(project, workDirectory, validImage);
  if (sceneImages.length !== scenes.length) throw new RenderError("MISSING_VISUAL", "Each storyboard scene must resolve to a valid visual.");
  const music = await resolveSelectedMusic(project);
  const fontPath = project.settings.showTextOnScreen === false ? undefined : escapeFilterPath(renderFontPath());
  const { width, height } = encodingOptions.dimensions ?? renderDimensions[project.settings.format];
  const frameRate = encodingOptions.frameRate ?? 30;
  const crossfadeSeconds = 0.5;
  const clipDurations = scenes.map((scene, index) => scene.duration + (index > 0 ? crossfadeSeconds : 0));
  const args: string[] = ["-hide_banner", "-loglevel", "error", "-y"];
  const filters: string[] = [];

  for (const [index, imagePath] of sceneImages.entries()) {
    const clipDuration = clipDurations[index];
    args.push("-loop", "1", "-framerate", String(frameRate), "-t", clipDuration.toFixed(3), "-i", imagePath);
    const motion = cameraMotion(scenes[index].purpose, index, clipDuration, frameRate);
    const base = `[${index}:v]scale=${width * 2}:${height * 2}:force_original_aspect_ratio=increase,crop=${width * 2}:${height * 2},${motion}:d=1:s=${width}x${height}:fps=${frameRate}`;
    if (project.settings.showTextOnScreen !== false) {
      const textPath = `overlay-${String(index).padStart(3, "0")}.txt`;
      const text = wrapText([scenes[index].headline, scenes[index].supportingText].filter(Boolean).join("\n"), project.settings.format === "9:16" ? 26 : 44);
      await writeFile(path.join(workDirectory, textPath), text, "utf8");
      filters.push(`${base},drawtext=fontfile='${fontPath}':textfile='${textPath}':expansion=none:fontcolor=white:fontsize=${Math.max(28, Math.round(height * 0.045))}:line_spacing=8:box=1:boxcolor=black@0.46:boxborderw=${Math.round(width * 0.025)}:x=(w-text_w)/2:y=h-text_h-${Math.round(height * 0.12)}:fix_bounds=1,format=yuv420p[v${index}]`);
    } else filters.push(`${base},format=yuv420p[v${index}]`);
  }

  let currentVideo = "[v0]";
  let visibleElapsed = scenes[0].duration;
  for (let index = 1; index < scenes.length; index += 1) {
    const next = `[x${index}]`;
    filters.push(`${currentVideo}[v${index}]xfade=transition=${transitionFor(scenes[index].transition)}:duration=${crossfadeSeconds}:offset=${(visibleElapsed - crossfadeSeconds).toFixed(3)}${next}`);
    currentVideo = next;
    visibleElapsed += scenes[index].duration;
  }
  const tailFilter = [`fade=t=in:st=0:d=0.25`, `fade=t=out:st=${Math.max(0, project.settings.duration - 0.35).toFixed(3)}:d=0.35`, `fps=${frameRate}`, "format=yuv420p"].join(",");
  if (music && project.settings.audioMix?.music.muted !== true && (project.settings.audioMix?.music.volume ?? 0.55) > 0) {
    args.push("-i", music.filePath);
    const audioInput = scenes.length;
    const mix = project.settings.audioMix?.music;
    const fitted = fitMusicToVideo(music.duration, project.settings.duration, mix?.startSeconds ?? 0);
    const sourceStart = fitted.startSeconds;
    const audibleDuration = Math.max(0.1, fitted.endSeconds - fitted.startSeconds);
    const fadeIn = Math.min(mix?.fadeInSeconds ?? fitted.fadeInSeconds, audibleDuration);
    const fadeOut = Math.min(mix?.fadeOutSeconds ?? fitted.fadeOutSeconds, audibleDuration);
    const fadeOutStart = Math.max(0, audibleDuration - fadeOut);
    const delay = Math.round(sourceStart * 1000);
    const volume = Math.min(1, Math.max(0, mix?.volume ?? 0.55));
    const audioFilter = `[${audioInput}:a]atrim=start=${sourceStart.toFixed(3)}:duration=${audibleDuration.toFixed(3)},asetpts=PTS-STARTPTS,volume=${volume.toFixed(3)},afade=t=in:st=0:d=${fadeIn.toFixed(3)},afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fadeOut.toFixed(3)},adelay=${delay}:all=1,apad=whole_dur=${project.settings.duration},atrim=duration=${project.settings.duration},asetpts=PTS-STARTPTS[aout]`;
    filters.push(`${currentVideo}${tailFilter}[vout]`, audioFilter);
    args.push("-filter_complex", filters.join(";"), "-map", "[vout]", "-map", "[aout]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p", "-r", String(frameRate), "-c:a", "aac", "-b:a", "160k", "-t", String(project.settings.duration), "-movflags", "+faststart", "-progress", "pipe:1", outputPath);
  } else {
    filters.push(`${currentVideo}${tailFilter}[vout]`);
    args.push("-filter_complex", filters.join(";"), "-map", "[vout]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p", "-r", String(frameRate), "-an", "-t", String(project.settings.duration), "-movflags", "+faststart", "-progress", "pipe:1", outputPath);
  }

  const temporaryOutput = path.join(workDirectory, "film-rendering.mp4");
  args[args.length - 1] = temporaryOutput;
  await runProcess(ffmpegBinary(), args, { cwd: workDirectory, timeoutMs: encodingOptions.timeoutMs ?? Math.min(600_000, Math.max(120_000, project.settings.duration * 5_000)), onProgress: (seconds) => onProgress(Math.min(95, Math.round(seconds / project.settings.duration * 95))), ...processHooks });
  const outputStat = await stat(temporaryOutput).catch(() => undefined);
  if (!outputStat?.isFile() || outputStat.size < 1024) throw new RenderError("RENDER_RESULT_INVALID", "FFmpeg did not produce a valid video file.");
  const probe = await runProcess(ffprobeBinary(), ["-v", "error", "-show_entries", "format=format_name,duration:stream=codec_type,codec_name,width,height", "-of", "json", temporaryOutput], { cwd: workDirectory, timeoutMs: 10_000 });
  const metadata = JSON.parse(probe.stdout) as { format?: { format_name?: string; duration?: string }; streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number }> };
  const video = metadata.streams?.find((stream) => stream.codec_type === "video");
  if (!metadata.format?.format_name?.split(",").includes("mp4") || !video || video.codec_name !== "h264" || video.width !== width || video.height !== height) {
    throw new RenderError("RENDER_RESULT_INVALID", "The encoded result did not validate as an H.264 MP4 in the requested dimensions.");
  }
  const actualDuration = Number(metadata.format.duration);
  if (!Number.isFinite(actualDuration) || Math.abs(actualDuration - project.settings.duration) > 1 / frameRate) {
    throw new RenderError("RENDER_RESULT_INVALID", `Encoded video duration was ${actualDuration}s, not the requested ${project.settings.duration}s.`);
  }
  await rename(temporaryOutput, outputPath);
  onProgress(100);
  return actualDuration;
}

export async function encodePreparedProject(project: VideoProject, sceneImages: string[], outputPath: string, options: EncodingOptions = {}): Promise<number> {
  validateRenderProject(project);
  if (sceneImages.length !== project.scenes.length) throw new RenderError("MISSING_VISUAL", "Each storyboard scene must have an image for rendering.");
  const temporaryDirectory = path.dirname(outputPath);
  const temporaryOutput = path.join(temporaryDirectory, `render-${randomUUID()}.mp4`);
  const duration = await encodeProject(project, randomUUID(), temporaryOutput, () => {}, { onStart: () => {}, onClose: () => {} }, sceneImages, options);
  await rename(temporaryOutput, outputPath);
  return duration;
}

export class FfmpegRenderEngine implements RenderEngine {
  readonly engine = "ffmpeg" as const;
  private readonly active = new Map<string, { project: VideoProject; job: RenderJob }>();
  private readonly processes = new Map<string, ChildProcessWithoutNullStreams>();
  private readonly cancelled = new Set<string>();
  private readonly options: FfmpegRenderEngineOptions;

  constructor(options: FfmpegRenderEngineOptions = {}) {
    this.options = options;
  }

  async createRenderJob(project: VideoProject, requestedRenderId?: string): Promise<RenderJob> {
    validateRenderProject(project);
    const renderId = requestedRenderId ?? randomUUID();
    if (!renderIdPattern.test(renderId)) throw new RenderError("INVALID_PROJECT", "Render ID is invalid.");
    const job: RenderJob = { renderId, status: "queued", mode: "real", engine: "ffmpeg", progress: 0 };
    const directory = renderDirectory(renderId);
    await mkdir(directory, { recursive: true });
    await writeJobFile(directory, job);
    this.active.set(renderId, { project, job });
    void this.render(renderId).catch(async (error) => {
      const renderError = error instanceof RenderError ? error : new RenderError("ENCODING_FAILED", "The video render failed unexpectedly.");
      const failed: RenderJob = { ...job, status: "failed", errorCode: renderError.code, errorMessage: renderError.message };
      await updateJobFile(renderId, failed).catch(() => {});
      this.active.delete(renderId);
    });
    return job;
  }

  async render(renderId: string, onUpdate: (job: RenderJob) => void = () => {}): Promise<RenderJob> {
    const active = this.active.get(renderId);
    if (!active) throw new RenderError("INVALID_PROJECT", "This render job is not available in the current renderer process.");
    let job: RenderJob = { ...active.job, status: "processing", progress: 1 };
    await updateJobFile(renderId, job);
    onUpdate(job);
    let lastProgressCheckpoint = 0;
    try {
      const outputPath = path.join(renderDirectory(renderId), "film.mp4");
      const preparedImages = this.options.resolveSceneImages
        ? await this.options.resolveSceneImages(active.project, renderDirectory(renderId))
        : undefined;
      await encodeProject(active.project, renderId, outputPath, (progress) => {
        const checkpoint = Math.floor(progress / 5) * 5;
        if (checkpoint <= lastProgressCheckpoint || checkpoint >= 100) return;
        lastProgressCheckpoint = checkpoint;
        job = { ...job, status: "processing", progress };
        void updateJobFile(renderId, job).catch(() => {});
        onUpdate(job);
      }, {
        onStart: (process) => this.processes.set(renderId, process),
        onClose: () => this.processes.delete(renderId),
      }, preparedImages, this.options.encoding);
      if (this.cancelled.has(renderId)) throw new RenderError("RENDER_CANCELLED", "Rendering was cancelled.");
      job = { ...job, status: "complete", progress: 100, outputUrl: `/api/render/jobs/${renderId}/video` };
    } catch (error) {
      job = {
        ...job,
        status: "failed",
        errorCode: this.cancelled.has(renderId) ? "RENDER_CANCELLED" : error instanceof RenderError ? error.code : "ENCODING_FAILED",
        errorMessage: this.cancelled.has(renderId) ? "Rendering was cancelled." : error instanceof RenderError ? error.message : "The video could not be encoded.",
      };
    }
    await updateJobFile(renderId, job);
    onUpdate(job);
    this.active.delete(renderId);
    this.cancelled.delete(renderId);
    return job;
  }

  async getRenderJob(renderId: string): Promise<RenderJob | undefined> {
    const job = await readJobFile(renderId);
    const lastUpdate = job?.updatedAt ? Date.parse(job.updatedAt) : 0;
    if (job && (job.status === "queued" || job.status === "processing") && !this.active.has(renderId) && Date.now() - lastUpdate > 5 * 60 * 1000) {
      const failed: RenderJob = { ...job, status: "failed", errorCode: "RENDER_INTERRUPTED", errorMessage: "The local renderer stopped before finishing this job." };
      await updateJobFile(renderId, failed);
      return failed;
    }
    return job;
  }

  async cancelRenderJob(renderId: string): Promise<RenderJob | undefined> {
    const current = await readJobFile(renderId);
    if (!current || current.status === "complete" || current.status === "failed") return current;
    this.cancelled.add(renderId);
    this.processes.get(renderId)?.kill("SIGTERM");
    const job: RenderJob = { ...current, status: "failed", errorCode: "RENDER_CANCELLED", errorMessage: "Rendering was cancelled." };
    await updateJobFile(renderId, job);
    this.active.delete(renderId);
    return job;
  }
}

async function writeJobFile(directory: string, job: RenderJob): Promise<void> {
  const filePath = path.join(directory, "job.json");
  const content = JSON.stringify({ ...job, updatedAt: new Date().toISOString() });
  await writeFile(filePath, content, "utf8");
}

async function updateJobFile(renderId: string, job: RenderJob): Promise<void> {
  const previous = jobWriteQueues.get(renderId) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(() => writeJobFile(renderDirectory(renderId), job));
  jobWriteQueues.set(renderId, current);
  try {
    await current;
  } finally {
    if (jobWriteQueues.get(renderId) === current) jobWriteQueues.delete(renderId);
  }
}

async function readJobFile(renderId: string): Promise<RenderJob | undefined> {
  const jobPath = path.join(renderDirectory(renderId), "job.json");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const job = JSON.parse(await readFile(jobPath, "utf8")) as RenderJob;
      return job.renderId === renderId ? job : undefined;
    } catch {
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  return undefined;
}

export async function getLocalRenderVideoPath(renderId: string): Promise<string | undefined> {
  const job = await readJobFile(renderId);
  if (!job || job.engine !== "ffmpeg" || job.mode !== "real" || job.status !== "complete" || job.outputUrl !== `/api/render/jobs/${renderId}/video`) return undefined;
  const outputPath = path.join(renderDirectory(renderId), "film.mp4");
  try {
    const file = await stat(outputPath);
    return file.isFile() && file.size > 0 ? outputPath : undefined;
  } catch {
    return undefined;
  }
}

export function renderFileStream(filePath: string) {
  return createReadStream(filePath);
}