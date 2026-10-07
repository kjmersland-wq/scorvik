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

async function loadSceneImages(project: VideoProject, width: number, height: number, signal?: AbortSignal): Promise<Visual[]> {
  const logos = new Set(project.analysis.logoCandidates ?? []);
  const fallbacks = [project.thumbnailUrl, project.analysis.openGraphImage, ...(project.analysis.images ?? []).filter((image) => !logos.has(image)), project.analysis.image]
    .filter((value): value is string => Boolean(value));
  const cache = new Map<string, ImageBitmap | undefined>();
  const visuals = new Map<ImageBitmap, Visual>();
  const bitmaps: Visual[] = [];
  for (const [index, scene] of project.scenes.entries()) {
    throwIfAborted(signal);
    let found: ImageBitmap | undefined;
    for (const candidate of new Set([scene.visual, ...fallbacks].filter(Boolean))) {
      if (!cache.has(candidate)) cache.set(candidate, await loadBitmap(candidate, project.analysis.url));
      found = cache.get(candidate);
      if (found) break;
    }
    if (!found) throw new Error(`Scene ${index + 1} has no image that could be loaded.`);
    let visual = visuals.get(found);
    if (!visual) { visual = await prepareVisual(found, width, height); visuals.set(found, visual); }
    bitmaps.push(visual);
  }
  return bitmaps;
}

function motion(scene: StoryScene, index: number, progress: number) {
  if (scene.purpose === "Hook" || scene.purpose === "Product") return { zoom: 1 + 0.08 * progress, pan: 0.5 };
  if (scene.purpose === "Benefit" || scene.purpose === "Story") return { zoom: 1.05, pan: index % 2 === 0 ? progress : 1 - progress };
  return { zoom: 1.08 - 0.08 * progress, pan: 0.5 };
}

interface Visual { image: ImageBitmap; backdrop?: HTMLCanvasElement }

type Rgb = [number, number, number];

// Crops flat-colour bars (letterboxing/pillarboxing baked into website images) so only the real picture is framed.
function trimBorders(bitmap: ImageBitmap): { sx: number; sy: number; sw: number; sh: number } | null {
  const scale = Math.min(1, 160 / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(8, Math.round(bitmap.width * scale));
  const h = Math.max(8, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(bitmap, 0, 0, w, h);
  const data = context.getImageData(0, 0, w, h).data;
  const pixel = (x: number, y: number): Rgb => { const i = (y * w + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
  const near = (a: Rgb, b: Rgb) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 36;
  const line = (index: number, vertical: boolean): Rgb | null => {
    const count = vertical ? h : w;
    const first = vertical ? pixel(index, 0) : pixel(0, index);
    for (let k = 1; k < count; k += 1) if (!near(vertical ? pixel(index, k) : pixel(k, index), first)) return null;
    return first;
  };
  const walk = (from: number, step: number, limit: number, vertical: boolean) => {
    const ref = line(from, vertical);
    if (!ref) return 0;
    let count = 0;
    for (let index = from; index !== limit; index += step) {
      const current = line(index, vertical);
      if (!current || !near(current, ref)) break;
      count += 1;
    }
    return count;
  };
  const left = walk(0, 1, Math.floor(w * 0.4), true);
  const right = walk(w - 1, -1, Math.ceil(w * 0.6), true);
  const top = walk(0, 1, Math.floor(h * 0.4), false);
  const bottom = walk(h - 1, -1, Math.ceil(h * 0.6), false);
  if (left + right + top + bottom < 2) return null;
  const sx = Math.round(((left > 0 ? left + 1 : 0) / w) * bitmap.width);
  const sy = Math.round(((top > 0 ? top + 1 : 0) / h) * bitmap.height);
  const sw = Math.round(((w - (left > 0 ? left + 1 : 0) - (right > 0 ? right + 1 : 0)) / w) * bitmap.width);
  const sh = Math.round(((h - (top > 0 ? top + 1 : 0) - (bottom > 0 ? bottom + 1 : 0)) / h) * bitmap.height);
  if (sw < bitmap.width * 0.3 || sh < bitmap.height * 0.3) return null;
  return { sx, sy, sw, sh };
}

async function prepareVisual(raw: ImageBitmap, width: number, height: number): Promise<Visual> {
  const crop = trimBorders(raw);
  let image = raw;
  if (crop) { image = await createImageBitmap(raw, crop.sx, crop.sy, crop.sw, crop.sh); raw.close(); }
  const visible = Math.min(image.width / image.height / (width / height), height / width / (image.height / image.width));
  if (visible >= 0.62) return { image };
  // Picture would lose too much when cropped: show it whole over a soft, darkened blow-up of itself, as an agency would.
  const tiny = document.createElement("canvas");
  tiny.width = 40;
  tiny.height = Math.max(2, Math.round((40 * height) / width));
  const tinyContext = tiny.getContext("2d");
  const backdrop = document.createElement("canvas");
  backdrop.width = width;
  backdrop.height = height;
  const context = backdrop.getContext("2d");
  if (!tinyContext || !context) return { image };
  const cover = Math.max(tiny.width / image.width, tiny.height / image.height);
  tinyContext.drawImage(image, (tiny.width - image.width * cover) / 2, (tiny.height - image.height * cover) / 2, image.width * cover, image.height * cover);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(tiny, 0, 0, width, height);
  context.fillStyle = "rgba(0,0,0,0.45)";
  context.fillRect(0, 0, width, height);
  return { image, backdrop };
}

function drawScene(ctx: CanvasRenderingContext2D, visual: Visual, scene: StoryScene, index: number, progress: number, width: number, height: number) {
  const { zoom, pan } = motion(scene, index, progress);
  const { image, backdrop } = visual;
  if (backdrop) {
    ctx.drawImage(backdrop, 0, 0);
    const fit = Math.min(width / image.width, (height * 0.92) / image.height) * (1 + (zoom - 1) * 0.5);
    const w = image.width * fit;
    const h = image.height * fit;
    ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
    return;
  }
  const cover = Math.max(width / image.width, height / image.height) * zoom;
  const drawWidth = image.width * cover;
  const drawHeight = image.height * cover;
  // Bias the crop upward so heads and key subjects stay in frame.
  ctx.drawImage(image, -(drawWidth - width) * pan, -(drawHeight - height) * 0.3, drawWidth, drawHeight);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.replace(/\s+/g, " ").trim().split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

// Lower-third: soft gradient, bold headline over a lighter supporting line, easing in and out with the scene.
function drawText(ctx: CanvasRenderingContext2D, scene: StoryScene, width: number, height: number, local: number, duration: number) {
  const headline = scene.headline.trim();
  const support = scene.supportingText.trim() && scene.supportingText.trim() !== headline ? scene.supportingText.trim() : "";
  if (!headline && !support) return;
  const ease = (value: number) => { const v = Math.max(0, Math.min(1, value)); return v * v * (3 - 2 * v); };
  const appear = ease((local - 0.15) / 0.55) * ease((duration - local) / 0.3);
  if (appear <= 0) return;
  const margin = Math.round(Math.min(width, height) * 0.075);
  const maxWidth = width - margin * 2 - (width > height ? width * 0.15 : 0);
  const headSize = Math.round(Math.min(width, height) * (width >= height ? 0.062 : 0.062));
  const supportSize = Math.round(headSize * 0.52);
  const family = '"Helvetica Neue", "Segoe UI", system-ui, Arial, sans-serif';
  ctx.font = `700 ${headSize}px ${family}`;
  const headLines = headline ? wrap(ctx, headline, maxWidth) : [];
  ctx.font = `400 ${supportSize}px ${family}`;
  const supportLines = support ? wrap(ctx, support, maxWidth).slice(0, 2) : [];
  const blockHeight = headLines.length * headSize * 1.12 + (supportLines.length ? supportSize * 0.7 + supportLines.length * supportSize * 1.3 : 0);
  const baseline = height - margin * 1.15;
  const top = baseline - blockHeight;
  const rise = (1 - appear) * headSize * 0.35;

  const gradient = ctx.createLinearGradient(0, top - headSize * 2.2, 0, height);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(1, "rgba(0,0,0,0.72)");
  ctx.globalAlpha = appear;
  ctx.fillStyle = gradient;
  ctx.fillRect(0, top - headSize * 2.2, width, height - (top - headSize * 2.2));
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = headSize * 0.25;
  let y = top + rise;
  ctx.font = `700 ${headSize}px ${family}`;
  for (const line of headLines) { y += headSize * 1.12; ctx.fillText(line, margin, y - headSize * 0.18); }
  if (supportLines.length) {
    ctx.font = `400 ${supportSize}px ${family}`;
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    y += supportSize * 0.7;
    for (const line of supportLines) { y += supportSize * 1.3; ctx.fillText(line, margin, y - supportSize * 0.3); }
  }
  ctx.shadowBlur = 0;
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
  const loop = fit.shouldLoop && track.commercialUse && track.metadataStatus === "verified";
  const audible = loop ? total : Math.max(0.1, Math.min(total, fit.endSeconds - fit.startSeconds));
  const fadeIn = Math.min(mix?.fadeInSeconds ?? fit.fadeInSeconds, audible);
  const fadeOut = Math.min(mix?.fadeOutSeconds ?? fit.fadeOutSeconds, audible);
  const offline = new OfflineAudioContext(2, Math.ceil(sampleRate * total), sampleRate);
  const node = offline.createBufferSource();
  const gain = offline.createGain();
  node.buffer = source;
  if (loop) { node.loop = true; node.loopStart = fit.startSeconds; node.loopEnd = source.duration; }
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

  const images = await loadSceneImages(project, width, height, signal);
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
      if (showText) drawText(ctx, scene, width, height, local, scene.duration);
      const untilEnd = scene.duration - local;
      if (current < scenes.length - 1 && untilEnd < crossfade) {
        const next = current + 1;
        ctx.globalAlpha = 1 - untilEnd / crossfade;
        drawScene(ctx, images[next], scenes[next], next, 0, width, height);
        if (showText) drawText(ctx, scenes[next], width, height, 0.0, scenes[next].duration);
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
    images.forEach((visual) => visual.image.close());
  }

  onProgress(100);
  return { blob: new Blob([target.buffer], { type: "video/mp4" }), durationSeconds: totalDuration, hasAudio: Boolean(music), audioWarning };
}
