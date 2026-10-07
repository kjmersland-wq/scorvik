import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { fitMusicToVideo } from "@/lib/audio/mix";
import { scorvikOriginalMusic } from "@/lib/music/recommend";
import type { StoryScene, VideoFormat, VideoProject } from "@/types/project";
import { normalizeSceneDurations, validateRenderProject } from "./validation";

// Renders a storyboard to an H.264/AAC MP4 inside the user's browser (WebCodecs + canvas), so no render server is needed.

const frameRate = 30;
const crossfade = 0.5;
const shortSide = 720;
const sampleRate = 48_000;

const aspect: Record<VideoFormat, [number, number]> = { "16:9": [16, 9], "9:16": [9, 16], "1:1": [1, 1], "4:5": [4, 5] };

export interface BrowserRenderResult {
  blob: Blob;
  durationSeconds: number;
  hasAudio: boolean;
  audioWarning?: string;
}

export function browserRenderSupported(): boolean {
  return typeof window !== "undefined" && "VideoEncoder" in window && "VideoFrame" in window;
}

function frameSize(format: VideoFormat) {
  const [w, h] = aspect[format];
  const scale = shortSide / Math.min(w, h);
  return { width: Math.round((w * scale) / 2) * 2, height: Math.round((h * scale) / 2) * 2 };
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Rendering was cancelled.", "AbortError");
}

async function loadBitmap(source: string, baseUrl: string): Promise<ImageBitmap | undefined> {
  const sameOrigin = source.startsWith("/") || source.startsWith("data:") || source.startsWith("blob:");
  const url = sameOrigin ? source : `/api/render/image?url=${encodeURIComponent(source)}&base=${encodeURIComponent(baseUrl)}`;
  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    return await createImageBitmap(await response.blob());
  } catch {
    return undefined;
  }
}

async function loadSceneImages(project: VideoProject, signal?: AbortSignal): Promise<ImageBitmap[]> {
  const logos = new Set(project.analysis.logoCandidates ?? []);
  const fallbacks = [project.thumbnailUrl, project.analysis.openGraphImage, ...(project.analysis.images ?? []).filter((image) => !logos.has(image)), project.analysis.image]
    .filter((value): value is string => Boolean(value));
  const cache = new Map<string, ImageBitmap | undefined>();
  const bitmaps: ImageBitmap[] = [];
  for (const [index, scene] of project.scenes.entries()) {
    throwIfAborted(signal);
    let found: ImageBitmap | undefined;
    for (const candidate of new Set([scene.visual, ...fallbacks].filter(Boolean))) {
      if (!cache.has(candidate)) cache.set(candidate, await loadBitmap(candidate, project.analysis.url));
      found = cache.get(candidate);
      if (found) break;
    }
    if (!found) throw new Error(`Scene ${index + 1} has no image that could be loaded.`);
    bitmaps.push(found);
  }
  return bitmaps;
}

function motion(scene: StoryScene, index: number, progress: number) {
  if (scene.purpose === "Hook" || scene.purpose === "Product") return { zoom: 1 + 0.08 * progress, pan: 0.5 };
  if (scene.purpose === "Benefit" || scene.purpose === "Story") return { zoom: 1.05, pan: index % 2 === 0 ? progress : 1 - progress };
  return { zoom: 1.08 - 0.08 * progress, pan: 0.5 };
}

function drawScene(ctx: CanvasRenderingContext2D, image: ImageBitmap, scene: StoryScene, index: number, progress: number, width: number, height: number) {
  const { zoom, pan } = motion(scene, index, progress);
  const cover = Math.max(width / image.width, height / image.height) * zoom;
  const drawWidth = image.width * cover;
  const drawHeight = image.height * cover;
  ctx.drawImage(image, -(drawWidth - width) * pan, -(drawHeight - height) / 2, drawWidth, drawHeight);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.replace(/\s+/g, " ").trim().split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

function drawText(ctx: CanvasRenderingContext2D, scene: StoryScene, width: number, height: number, alpha: number) {
  const parts = [...new Set([scene.headline, scene.supportingText].filter(Boolean))];
  if (!parts.length) return;
  const size = Math.max(24, Math.round(height * 0.045));
  const pad = Math.round(width * 0.02);
  const maxWidth = width * 0.84;
  ctx.font = `600 ${size}px system-ui, "Segoe UI", Arial, sans-serif`;
  const lines = parts.flatMap((part) => wrap(ctx, part, maxWidth - pad * 2)).slice(0, 5);
  const lineHeight = size * 1.3;
  const boxHeight = lines.length * lineHeight + pad * 2;
  const boxWidth = Math.min(maxWidth, Math.max(...lines.map((line) => ctx.measureText(line).width)) + pad * 2);
  const x = (width - boxWidth) / 2;
  const y = height - boxHeight - height * 0.08;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "rgba(0,0,0,0.46)";
  ctx.fillRect(x, y, boxWidth, boxHeight);
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "top";
  ctx.textAlign = "center";
  lines.forEach((line, i) => ctx.fillText(line, width / 2, y + pad + i * lineHeight));
  ctx.globalAlpha = 1;
}

async function renderMusic(project: VideoProject): Promise<AudioBuffer | undefined> {
  const mix = project.settings.audioMix?.music;
  const track = project.settings.musicTrackId ? scorvikOriginalMusic.find((candidate) => candidate.id === project.settings.musicTrackId) : undefined;
  const volume = Math.min(1, Math.max(0, mix?.volume ?? 0.55));
  if (!track?.audioUrl || mix?.muted === true || volume <= 0) return undefined;
  const response = await fetch(track.audioUrl);
  if (!response.ok) throw new Error("The selected music track could not be loaded.");
  const decoder = new AudioContext();
  const source = await decoder.decodeAudioData(await response.arrayBuffer());
  await decoder.close();
  const total = project.settings.duration;
  const fit = fitMusicToVideo(source.duration, total, mix?.startSeconds ?? 0);
  const audible = Math.max(0.1, Math.min(total, fit.endSeconds - fit.startSeconds));
  const fadeIn = Math.min(mix?.fadeInSeconds ?? fit.fadeInSeconds, audible);
  const fadeOut = Math.min(mix?.fadeOutSeconds ?? fit.fadeOutSeconds, audible);
  const offline = new OfflineAudioContext(2, Math.ceil(sampleRate * total), sampleRate);
  const node = offline.createBufferSource();
  const gain = offline.createGain();
  node.buffer = source;
  gain.gain.setValueAtTime(0, 0);
  gain.gain.linearRampToValueAtTime(volume, Math.max(fadeIn, 0.01));
  gain.gain.setValueAtTime(volume, Math.max(fadeIn, audible - fadeOut));
  gain.gain.linearRampToValueAtTime(0, audible);
  node.connect(gain).connect(offline.destination);
  node.start(0, fit.startSeconds, audible);
  return offline.startRendering();
}

async function encodeAudio(buffer: AudioBuffer, encoder: AudioEncoder, signal?: AbortSignal) {
  const channels = [buffer.getChannelData(0), buffer.getChannelData(Math.min(1, buffer.numberOfChannels - 1))];
  const chunk = 4096;
  for (let start = 0; start < buffer.length; start += chunk) {
    throwIfAborted(signal);
    const frames = Math.min(chunk, buffer.length - start);
    const data = new Float32Array(frames * 2);
    data.set(channels[0].subarray(start, start + frames), 0);
    data.set(channels[1].subarray(start, start + frames), frames);
    const audio = new AudioData({ format: "f32-planar", sampleRate, numberOfFrames: frames, numberOfChannels: 2, timestamp: Math.round((start / sampleRate) * 1e6), data });
    encoder.encode(audio);
    audio.close();
    if (encoder.encodeQueueSize > 16) await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

export async function renderProjectInBrowser(project: VideoProject, onProgress: (percent: number) => void, signal?: AbortSignal): Promise<BrowserRenderResult> {
  if (!browserRenderSupported()) throw new Error("This browser cannot create video files. Use a current version of Chrome, Edge or Safari.");
  validateRenderProject(project);
  const scenes = normalizeSceneDurations(project.scenes, project.settings.duration);
  const { width, height } = frameSize(project.settings.format);
  const totalDuration = project.settings.duration;
  const showText = project.settings.showTextOnScreen !== false;

  const images = await loadSceneImages(project, signal);
  onProgress(3);

  let music: AudioBuffer | undefined;
  let audioWarning: string | undefined;
  try { music = await renderMusic(project); } catch (error) { audioWarning = error instanceof Error ? error.message : "Music could not be added."; }
  if (music && !("AudioEncoder" in window && (await AudioEncoder.isConfigSupported({ codec: "mp4a.40.2", sampleRate, numberOfChannels: 2, bitrate: 128_000 })).supported)) {
    music = undefined;
    audioWarning = "This browser cannot encode audio, so the film has no music.";
  }
  throwIfAborted(signal);

  const videoConfig: VideoEncoderConfig = { codec: "avc1.640032", width, height, bitrate: 4_000_000, framerate: frameRate, avc: { format: "avc" } };
  if (!(await VideoEncoder.isConfigSupported(videoConfig)).supported) throw new Error("This browser cannot encode H.264 video.");

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: "avc", width, height, frameRate },
    ...(music ? { audio: { codec: "aac" as const, numberOfChannels: 2, sampleRate } } : {}),
    fastStart: "in-memory",
  });
  let failure: Error | undefined;
  const videoEncoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (error) => { failure = error; } });
  videoEncoder.configure(videoConfig);
  const audioEncoder = music ? new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (error) => { failure = error; } }) : undefined;
  audioEncoder?.configure({ codec: "mp4a.40.2", sampleRate, numberOfChannels: 2, bitrate: 128_000 });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create a drawing surface.");

  const starts: number[] = [];
  scenes.reduce((sum, scene) => { starts.push(sum); return sum + scene.duration; }, 0);
  const frames = Math.round(totalDuration * frameRate);

  try {
    let current = 0;
    for (let frame = 0; frame < frames; frame += 1) {
      throwIfAborted(signal);
      if (failure) throw failure;
      const time = frame / frameRate;
      while (current < scenes.length - 1 && time >= starts[current + 1]) current += 1;
      const scene = scenes[current];
      const local = time - starts[current];
      ctx.globalAlpha = 1;
      drawScene(ctx, images[current], scene, current, local / scene.duration, width, height);
      if (showText) drawText(ctx, scene, width, height, 1);
      const untilEnd = scene.duration - local;
      if (current < scenes.length - 1 && untilEnd < crossfade) {
        const next = current + 1;
        ctx.globalAlpha = 1 - untilEnd / crossfade;
        drawScene(ctx, images[next], scenes[next], next, 0, width, height);
        if (showText) drawText(ctx, scenes[next], width, height, 1);
        ctx.globalAlpha = 1;
      }
      const fade = Math.max(Math.min(1, 1 - time / 0.25), Math.min(1, 1 - (totalDuration - time) / 0.35), 0);
      if (fade > 0) { ctx.fillStyle = `rgba(0,0,0,${Math.min(1, fade)})`; ctx.fillRect(0, 0, width, height); }

      const videoFrame = new VideoFrame(canvas, { timestamp: Math.round((frame / frameRate) * 1e6), duration: Math.round(1e6 / frameRate) });
      videoEncoder.encode(videoFrame, { keyFrame: frame % (frameRate * 2) === 0 });
      videoFrame.close();
      while (videoEncoder.encodeQueueSize > 8) await new Promise((resolve) => setTimeout(resolve, 0));
      if (frame % 15 === 0) {
        onProgress(Math.min(95, 5 + Math.round((frame / frames) * 88)));
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    if (audioEncoder && music) await encodeAudio(music, audioEncoder, signal);
    await videoEncoder.flush();
    await audioEncoder?.flush();
    if (failure) throw failure;
    muxer.finalize();
  } finally {
    if (videoEncoder.state !== "closed") videoEncoder.close();
    if (audioEncoder && audioEncoder.state !== "closed") audioEncoder.close();
    images.forEach((image) => image.close());
  }

  onProgress(100);
  return { blob: new Blob([target.buffer], { type: "video/mp4" }), durationSeconds: totalDuration, hasAudio: Boolean(music), audioWarning };
}
