import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { fitMusicToVideo } from "@/lib/audio/mix";
import { integratedLoudness } from "@/lib/audio/loudness";
import { estimateBeatGrid, snapToBeats, type BeatGrid } from "@/lib/audio/beats";
import { pickAccent } from "@/lib/creative/captions";
import { detectGraphic } from "@/lib/creative/graphics";
import { drawGraphicScene } from "./graphics";
import { chooseTextPlacement, edgeFraction, type TextLayout } from "./busyness";
import { libraryMusic } from "@/lib/music/recommend";
import type { StoryScene, VideoFormat, VideoProject } from "@/types/project";
import { normalizeSceneDurations, validateRenderProject } from "./validation";

// Renders a storyboard to an H.264/AAC MP4 inside the user's browser (WebCodecs + canvas), so no render server is needed.

const frameRate = 24; // cinema/TV-spot cadence
const crossfade = 0.5; // 0.4-0.6 s: soft, never flashy
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

function frameSize(format: VideoFormat, shortSide: number) {
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

const shortestSide = (bitmap: ImageBitmap) => Math.min(bitmap.width, bitmap.height);
const usable = (bitmap: ImageBitmap) => shortestSide(bitmap) >= 300 && bitmap.width / bitmap.height > 0.3 && bitmap.width / bitmap.height < 3.5;

// Picks the best picture for every scene: the scene's own (name-matched) image when it is good enough,
// otherwise the sharpest unused picture from the site, and only then a repeat.
function placeholderCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  return canvas;
}

async function loadSceneImages(project: VideoProject, width: number, height: number, signal?: AbortSignal): Promise<Visual[]> {
  const logos = new Set(project.analysis.logoCandidates ?? []);
  const cache = new Map<string, ImageBitmap | undefined>();
  const get = async (url: string) => {
    if (!cache.has(url)) cache.set(url, await loadBitmap(url, project.analysis.url));
    return cache.get(url);
  };
  // null marks a drawn scene (no picture needed)
  const chosen: Array<{ url: string; bitmap: ImageBitmap } | undefined | null> = [];
  const clips = new Map<number, { video: HTMLVideoElement; poster: ImageBitmap }>();
  const used = new Set<string>();
  for (const [index, scene] of project.scenes.entries()) {
    throwIfAborted(signal);
    if (scene.graphic) { chosen.push(null); continue; }
    if (scene.videoUrl) {
      const clip = await loadVideoClip(scene.videoUrl);
      if (clip) { clips.set(index, clip); chosen.push({ url: scene.videoUrl, bitmap: clip.poster }); used.add(scene.videoUrl); continue; }
    }
    const own = scene.visual ? await get(scene.visual) : undefined;
    if (own && usable(own) && !used.has(scene.visual)) { chosen.push({ url: scene.visual, bitmap: own }); used.add(scene.visual); } else chosen.push(undefined);
  }
  if (chosen.some((entry) => entry === undefined)) {
    const pool = [...new Set([project.analysis.openGraphImage, ...(project.analysis.images ?? []), project.analysis.image, project.thumbnailUrl].filter((value): value is string => Boolean(value) && !logos.has(value as string)))].slice(0, 14);
    for (let start = 0; start < pool.length; start += 4) {
      throwIfAborted(signal);
      await Promise.all(pool.slice(start, start + 4).map((url) => get(url)));
    }
    const ranked = pool.map((url) => ({ url, bitmap: cache.get(url) })).filter((entry): entry is { url: string; bitmap: ImageBitmap } => Boolean(entry.bitmap && usable(entry.bitmap)))
      .sort((left, right) => shortestSide(right.bitmap) - shortestSide(left.bitmap));
    const fallbackAny = pool.map((url) => ({ url, bitmap: cache.get(url) })).filter((entry): entry is { url: string; bitmap: ImageBitmap } => Boolean(entry.bitmap));
    for (const [index, entry] of chosen.entries()) {
      if (entry !== undefined) continue;
      const fresh = ranked.find((candidate) => !used.has(candidate.url));
      const pick = fresh ?? ranked[index % Math.max(1, ranked.length)] ?? fallbackAny[0];
      if (!pick) throw new Error(`Scene ${index + 1} has no image that could be loaded.`);
      used.add(pick.url);
      chosen[index] = pick;
    }
  }
  const visuals = new Map<ImageBitmap, Visual>();
  const result: Visual[] = [];
  const enhance = project.settings.enhanceImages !== false;
  for (const [index, entry] of chosen.entries()) {
    if (!entry) { result.push({ image: await createImageBitmap(placeholderCanvas()) }); continue; }
    const bitmap = entry.bitmap;
    const clip = clips.get(index);
    if (clip) { result.push({ ...(await prepareVisual(bitmap, width, height, { enhance: false, trim: false })), video: clip.video }); continue; }
    let visual = visuals.get(bitmap);
    if (!visual) { visual = await prepareVisual(bitmap, width, height, { enhance, trim: true }); visuals.set(bitmap, visual); }
    result.push(visual);
  }
  return result;
}

function motion(scene: StoryScene, index: number, rawProgress: number) {
  const progress = rawProgress * rawProgress * (3 - 2 * rawProgress); // ease in/out like a dolly move
  if (scene.purpose === "Hook" || scene.purpose === "Product") return { zoom: 1 + 0.07 * progress, pan: 0.5, tilt: 0.3 - 0.1 * progress };
  if (scene.purpose === "Benefit" || scene.purpose === "Story" || scene.purpose === "Step") return { zoom: 1.06, pan: index % 2 === 0 ? 0.3 + 0.4 * progress : 0.7 - 0.4 * progress, tilt: 0.25 + 0.1 * progress };
  return { zoom: 1.07 - 0.07 * progress, pan: 0.5, tilt: 0.3 };
}

interface Visual { image: ImageBitmap; backdrop?: HTMLCanvasElement; video?: HTMLVideoElement; upscale?: number }

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

// Agency-style retouch: gentle upscale toward the frame size, auto-levels, a touch of colour and an unsharp mask.
async function enhanceImage(image: ImageBitmap, width: number, height: number): Promise<{ bitmap: ImageBitmap; scale: number }> {
  const cover = Math.max(width / image.width, height / image.height);
  let scale = Math.min(Math.max(1, cover), 2.5);
  while (image.width * scale * image.height * scale > 3_500_000 && scale > 1) scale -= 0.1;
  const w = Math.max(1, Math.round(image.width * scale));
  const h = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return { bitmap: image, scale: 1 };
  context.imageSmoothingQuality = "high";
  // upscale in two gentle steps for a smoother result than one big jump
  if (scale > 1.6) {
    const mid = document.createElement("canvas");
    mid.width = Math.round(image.width * Math.sqrt(scale));
    mid.height = Math.round(image.height * Math.sqrt(scale));
    const midContext = mid.getContext("2d");
    if (midContext) { midContext.imageSmoothingQuality = "high"; midContext.drawImage(image, 0, 0, mid.width, mid.height); context.drawImage(mid, 0, 0, w, h); } else context.drawImage(image, 0, 0, w, h);
  } else context.drawImage(image, 0, 0, w, h);
  const frame = context.getImageData(0, 0, w, h);
  const data = frame.data;
  const histogram = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) histogram[Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2])] += 1;
  const total = w * h;
  let low = 0, high = 255, running = 0;
  for (let v = 0; v < 256; v += 1) { running += histogram[v]; if (running >= total * 0.01) { low = v; break; } }
  running = 0;
  for (let v = 255; v >= 0; v -= 1) { running += histogram[v]; if (running >= total * 0.01) { high = v; break; } }
  const gain = Math.min(1.25, 255 / Math.max(60, high - low));
  const saturation = 1.06;
  const source = new Uint8ClampedArray(data);
  for (let i = 0; i < data.length; i += 4) {
    const r0 = (source[i] - low) * gain, g0 = (source[i + 1] - low) * gain, b0 = (source[i + 2] - low) * gain;
    const grey = 0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0;
    data[i] = grey + (r0 - grey) * saturation;
    data[i + 1] = grey + (g0 - grey) * saturation;
    data[i + 2] = grey + (b0 - grey) * saturation;
  }
  // unsharp mask: original + amount * (original - 3x3 blur)
  const leveled = new Uint8ClampedArray(data);
  const amount = scale > 1.3 ? 0.9 : 0.55;
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const index = (y * w + x) * 4;
      for (let c = 0; c < 3; c += 1) {
        const k = index + c;
        const blur = (leveled[k - w * 4 - 4] + leveled[k - w * 4] + leveled[k - w * 4 + 4] + leveled[k - 4] + leveled[k] + leveled[k + 4] + leveled[k + w * 4 - 4] + leveled[k + w * 4] + leveled[k + w * 4 + 4]) / 9;
        data[k] = leveled[k] + amount * (leveled[k] - blur);
      }
    }
  }
  context.putImageData(frame, 0, 0);
  return { bitmap: await createImageBitmap(canvas), scale };
}

async function loadVideoClip(url: string): Promise<{ video: HTMLVideoElement; poster: ImageBitmap } | undefined> {
  try {
    const response = await fetch(`/api/stock/video?u=${encodeURIComponent(url)}`);
    if (!response.ok) return undefined;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = URL.createObjectURL(await response.blob());
    await new Promise<void>((resolve, reject) => { video.onloadeddata = () => resolve(); video.onerror = () => reject(new Error("clip")); });
    await seekVideo(video, 0.05);
    return { video, poster: await createImageBitmap(video) };
  } catch {
    return undefined;
  }
}

function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const target = video.duration ? time % video.duration : 0;
    if (Math.abs(video.currentTime - target) < 0.001) { resolve(); return; }
    const done = () => { video.removeEventListener("seeked", done); resolve(); };
    video.addEventListener("seeked", done);
    video.currentTime = target;
    setTimeout(done, 1500);
  });
}

async function prepareVisual(raw: ImageBitmap, width: number, height: number, options: { enhance: boolean; trim: boolean } = { enhance: false, trim: true }): Promise<Visual> {
  const crop = options.trim ? trimBorders(raw) : null;
  let image = raw;
  if (crop) { image = await createImageBitmap(raw, crop.sx, crop.sy, crop.sw, crop.sh); raw.close(); }
  const visible = Math.min(image.width / image.height / (width / height), height / width / (image.height / image.width));
  const coverScale = Math.max(width / image.width, height / image.height);
  // Needs heavy upscaling (soft, pixelated result) or heavy cropping: show it whole over a blurred backdrop instead.
  const finish = async (backdrop?: HTMLCanvasElement): Promise<Visual> => {
    if (!options.enhance) return { image, backdrop };
    const enhanced = await enhanceImage(image, width, height).catch(() => undefined);
    if (!enhanced || enhanced.bitmap === image) return { image, backdrop };
    image.close();
    return { image: enhanced.bitmap, backdrop, upscale: enhanced.scale };
  };
  if (visible >= 0.7 && coverScale <= 1.7) return finish();
  // Picture would lose too much when cropped: show it whole over a soft, darkened blow-up of itself, as an agency would.
  const tiny = document.createElement("canvas");
  tiny.width = 40;
  tiny.height = Math.max(2, Math.round((40 * height) / width));
  const tinyContext = tiny.getContext("2d");
  const backdrop = document.createElement("canvas");
  backdrop.width = width;
  backdrop.height = height;
  const context = backdrop.getContext("2d");
  if (!tinyContext || !context) return finish();
  const cover = Math.max(tiny.width / image.width, tiny.height / image.height);
  tinyContext.drawImage(image, (tiny.width - image.width * cover) / 2, (tiny.height - image.height * cover) / 2, image.width * cover, image.height * cover);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(tiny, 0, 0, width, height);
  context.fillStyle = "rgba(0,0,0,0.45)";
  context.fillRect(0, 0, width, height);
  return finish(backdrop);
}

function drawScene(ctx: CanvasRenderingContext2D, visual: Visual, scene: StoryScene, index: number, progress: number, width: number, height: number) {
  const { zoom, pan, tilt } = motion(scene, index, progress);
  const { image, backdrop, video } = visual;
  const source: CanvasImageSource = video ?? image;
  const iw = video ? video.videoWidth : image.width;
  const ih = video ? video.videoHeight : image.height;
  if (backdrop) {
    // background drifts against the picture (parallax); slight over-scale hides the edges
    const against = (progress - 0.5) * width * 0.015 * (index % 2 === 0 ? 1 : -1);
    ctx.save();
    ctx.translate(width / 2 - against, height / 2);
    ctx.scale(1.05, 1.05);
    ctx.translate(-width / 2, -height / 2);
    ctx.drawImage(backdrop, 0, 0);
    ctx.restore();
    const fit = Math.min(width / iw, (height * 0.62) / ih, 1.5 / (visual.upscale ?? 1)) * (1 + (zoom - 1) * 0.5);
    const w = iw * fit;
    const h = ih * fit;
    // slow 3% sideways drift keeps even whole-picture shots alive; lifted so titles sit below the picture
    const drift = (progress - 0.5) * width * 0.03 * (index % 2 === 0 ? 1 : -1);
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 25 * (width / 1920);
    ctx.shadowOffsetY = 8 * (width / 1920);
    ctx.drawImage(source, (width - w) / 2 + drift, (height - h) / 2 - height * 0.07, w, h);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    return;
  }
  const cover = Math.max(width / iw, height / ih) * zoom;
  const drawWidth = iw * cover;
  const drawHeight = ih * cover;
  // Bias the crop upward so heads and key subjects stay in frame.
  ctx.drawImage(source, -(drawWidth - width) * pan, -(drawHeight - height) * tilt, drawWidth, drawHeight);
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

const textFamily = '"Helvetica Neue", "Segoe UI", system-ui, Arial, sans-serif';
const serifFamily = '"Playfair Display", "Cormorant Garamond", Georgia, "Times New Roman", serif';
// Headlines use a display serif for the Editorial and Cinematic styles (set per render, see renderProjectInBrowser).
let headlineFamily = textFamily;
let accentColor = "#f3c767";
let typographyMode: "calm" | "kinetic" = "calm";
const easeOutBack = (value: number) => { const t = Math.max(0, Math.min(1, value)); const c1 = 1.70158; return 1 + (c1 + 1) * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const ease = (value: number) => { const v = Math.max(0, Math.min(1, value)); return v * v * (3 - 2 * v); };

function tracking(ctx: CanvasRenderingContext2D, value: string) {
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = value;
}

// Centred title card in the style of a TV spot: headline over a lighter supporting line, easing in and out with the scene.
// Looks at the finished picture (after cropping, backdrop and motion) where a title would sit: top band and lower band.
function analyseLayout(ctx: CanvasRenderingContext2D, width: number, height: number): TextLayout {
  const sample = (fromY: number, toY: number) => {
    const strip = document.createElement("canvas");
    strip.width = 128;
    strip.height = Math.max(8, Math.round(128 * ((toY - fromY) * height) / width));
    const stripContext = strip.getContext("2d", { willReadFrequently: true });
    if (!stripContext) return 0;
    stripContext.drawImage(ctx.canvas, 0, fromY * height, width, (toY - fromY) * height, 0, 0, strip.width, strip.height);
    return edgeFraction(stripContext.getImageData(0, 0, strip.width, strip.height).data, strip.width, strip.height);
  };
  return { top: sample(0.06, 0.34), bottom: sample(0.6, 0.94) };
}

function drawText(ctx: CanvasRenderingContext2D, scene: StoryScene, width: number, height: number, local: number, duration: number, inset: number, hide: number, layout: TextLayout) {
  if (scene.noOverlay) return;
  const headline = scene.headline.trim();
  const support = scene.supportingText.trim() && scene.supportingText.trim() !== headline ? scene.supportingText.trim() : "";
  if (!headline && !support) return;
  const kinetic = typographyMode === "kinetic";
  const appear = ease((local - (kinetic ? 0.1 : 0.2)) / (kinetic ? 0.12 : 0.3)) * ease((duration - local) / 0.35) * (1 - hide); // calm: fades in over 0.3 s; kinetic: the block is up at once and the words pop in
  if (appear <= 0) return;
  const short = Math.min(width, height);
  const maxWidth = width * (width > height ? 0.62 : 0.84);
  const headSize = Math.round(short * 0.056);
  const supportSize = Math.round(headSize * 0.5);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "center";
  tracking(ctx, "0.01em");
  ctx.font = `600 ${headSize}px ${headlineFamily}`;
  const headLines = headline ? wrap(ctx, headline, maxWidth).slice(0, 2) : [];
  tracking(ctx, "0.03em");
  ctx.font = `400 ${supportSize}px ${textFamily}`;
  const supportLines = support ? wrap(ctx, support, maxWidth).slice(0, 2) : [];
  const blockHeight = headLines.length * headSize * 1.15 + (supportLines.length ? supportSize * 0.9 + supportLines.length * supportSize * 1.35 : 0);
  // Vertical films keep titles above the platform's bottom UI zone (about the lower 20%).
  const placement = chooseTextPlacement(layout, height > width);
  const baseline = height > width ? height - Math.max(inset, height * 0.2) - short * 0.03 : height - inset - short * 0.085;
  const top = placement.position === "top" ? Math.max(inset, height * 0.07) + short * 0.02 : baseline - blockHeight;
  const rise = (1 - appear) * headSize * 0.4;

  ctx.globalAlpha = appear;
  if (placement.position === "top") { // soft fade from the top edge
    const scrimBottom = top + blockHeight + headSize * 1.4;
    const downward = ctx.createLinearGradient(0, 0, 0, scrimBottom);
    downward.addColorStop(0, "rgba(0,0,0,0.72)");
    downward.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = downward;
    ctx.fillRect(0, 0, width, scrimBottom);
  } else {
    const scrimTop = top - headSize * 2.6;
    const gradient = ctx.createLinearGradient(0, scrimTop, 0, height);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, "rgba(0,0,0,0.7)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, scrimTop, width, height - scrimTop);
  }
  if (placement.panel > 0) { // the picture has its own lettering here: set ours on a dark panel so the two never collide
    ctx.font = `600 ${headSize}px ${headlineFamily}`;
    const headWidths = headLines.map((line) => ctx.measureText(line).width);
    ctx.font = `400 ${supportSize}px ${textFamily}`;
    const supportWidths = supportLines.map((line) => ctx.measureText(line).width);
    const textWidth = Math.max(0, ...headWidths, ...supportWidths);
    const pad = headSize * 0.55;
    ctx.fillStyle = `rgba(10,9,8,${placement.panel})`;
    ctx.beginPath();
    ctx.roundRect(width / 2 - textWidth / 2 - pad, top - pad * 0.7 + rise, textWidth + pad * 2, blockHeight + pad * 1.4, pad * 0.7);
    ctx.fill();
  }
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = headSize * (kinetic ? 0.45 : 0.3);
  ctx.shadowOffsetY = kinetic ? headSize * 0.05 : 0;
  ctx.fillStyle = "#fff";
  let y = top + rise;
  tracking(ctx, "0.01em");
  ctx.font = `600 ${headSize}px ${headlineFamily}`;
  const emphasis = new Set((scene.typography?.emphasis ?? []).map((word) => word.toLowerCase()));
  const space = ctx.measureText(" ").width;
  let wordNumber = 0;
  for (const line of headLines) {
    y += headSize * 1.15;
    const words = line.split(" ");
    const widths = words.map((word) => ctx.measureText(word).width);
    let x = width / 2 - (widths.reduce((sum, value) => sum + value, 0) + space * (words.length - 1)) / 2;
    ctx.textAlign = "left";
    for (const [index, word] of words.entries()) {
      const hot = emphasis.has(word.toLowerCase().replace(/[^\p{L}\p{N}'’-]/gu, ""));
      const age = local - (0.15 + wordNumber * 0.09); // each word pops in on its own, a beat after the last
      const wordAppear = kinetic ? ease(age / 0.18) : 1;
      const scale = kinetic ? 0.72 + 0.28 * easeOutBack(age / 0.3) : 1;
      if (wordAppear > 0) {
        const centre = x + widths[index] / 2;
        const baselineY = y - headSize * 0.2;
        ctx.save();
        ctx.globalAlpha = appear * wordAppear;
        ctx.translate(centre, baselineY);
        ctx.scale(scale, scale);
        ctx.textAlign = "center";
        if (hot) { ctx.fillStyle = accentColor; ctx.shadowColor = accentColor; ctx.shadowBlur = headSize * 0.35; }
        ctx.fillText(word, 0, 0);
        if (hot && kinetic) { // the highlight underlines itself a moment after the word lands
          ctx.shadowBlur = 0;
          ctx.fillRect(-widths[index] / 2, headSize * 0.12, widths[index] * ease((age - 0.25) / 0.35), Math.max(2, headSize * 0.05));
        }
        ctx.restore();
      }
      x += widths[index] + space;
      wordNumber += 1;
    }
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = headSize * (kinetic ? 0.45 : 0.3);
  }
  ctx.globalAlpha = appear;
  if (supportLines.length) {
    tracking(ctx, "0.03em");
    ctx.font = `400 ${supportSize}px ${textFamily}`;
    ctx.fillStyle = "rgba(255,255,255,0.86)";
    y += supportSize * 0.9;
    for (const line of supportLines) { y += supportSize * 1.35; ctx.fillText(line, width / 2, y - supportSize * 0.3); }
  }
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  tracking(ctx, "0px");
  ctx.globalAlpha = 1;
}

// Loads the site's logo and turns transparent logos into clean white marks (the standard treatment on dark title cards).
async function prepareLogo(project: VideoProject, width: number, height: number): Promise<HTMLCanvasElement | undefined> {
  const candidates = [...new Set([...(project.analysis.logoCandidates ?? []), project.analysis.faviconUrl].filter((value): value is string => Boolean(value)))].slice(0, 4);
  for (const candidate of candidates) {
    const bitmap = await loadBitmap(candidate, project.analysis.url);
    if (!bitmap || bitmap.width < 24 || bitmap.height < 24) { bitmap?.close(); continue; }
    const short = Math.min(width, height);
    const scale = Math.min((short * 0.3) / bitmap.height, (width * 0.5) / bitmap.width, 4);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) { bitmap.close(); continue; }
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    // Only simple, flat-colour marks are turned white; detailed or photographic logos are shown as they are.
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set<number>();
    let opaque = 0;
    let luminance = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] < 128) continue;
      opaque += 1;
      luminance += 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
      colors.add(((pixels[i] >> 5) << 6) | ((pixels[i + 1] >> 5) << 3) | (pixels[i + 2] >> 5));
    }
    const transparent = pixels[3] < 40;
    if (transparent && opaque > 0 && colors.size <= 4 && luminance / opaque < 120) {
      context.globalCompositeOperation = "source-in";
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      return canvas;
    }
    // Detailed logos: lift them so the mark reads at roughly 70-85% brightness on the dark title card.
    const histogram = new Uint32Array(256);
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] >= 128) histogram[Math.round(0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2])] += 1;
    let seen = 0;
    let p90 = 255;
    for (let value = 0; value < 256; value += 1) { seen += histogram[value]; if (seen >= opaque * 0.9) { p90 = value; break; } }
    let lifted = p90;
    if (opaque > 0 && p90 < 190 && p90 > 8) {
      const factor = Math.min(2.4, 205 / p90);
      const frame = context.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < frame.data.length; i += 4) {
        frame.data[i] = frame.data[i] * factor;
        frame.data[i + 1] = frame.data[i + 1] * factor;
        frame.data[i + 2] = frame.data[i + 2] * factor;
      }
      context.putImageData(frame, 0, 0);
      lifted = p90 * factor;
    }
    // Still too dark after lifting: set it on a soft light plate so it never disappears.
    if (opaque > 0 && lifted < 120) {
      const pad = Math.round(Math.min(canvas.width, canvas.height) * 0.1);
      const plate = document.createElement("canvas");
      plate.width = canvas.width + pad * 2;
      plate.height = canvas.height + pad * 2;
      const plateContext = plate.getContext("2d");
      if (plateContext) {
        plateContext.fillStyle = "rgba(244,238,228,0.94)";
        plateContext.beginPath();
        plateContext.roundRect(0, 0, plate.width, plate.height, pad);
        plateContext.fill();
        plateContext.drawImage(canvas, pad, pad);
        return plate;
      }
    }
    return canvas;
  }
  return undefined;
}

// Opening card: the film starts dimmed with the logo (or brand name) fading in, then lifting into the first scene.
function drawIntro(ctx: CanvasRenderingContext2D, logo: HTMLCanvasElement | undefined, brand: string, width: number, height: number, amount: number, progress: number) {
  if (amount <= 0) return;
  const short = Math.min(width, height);
  ctx.globalAlpha = amount * 0.5;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = amount;
  // slow push-in on the lockup, 100% to 108%
  ctx.save();
  const push = 1 + 0.08 * Math.min(1, Math.max(0, progress));
  ctx.translate(width / 2, height / 2);
  ctx.scale(push, push);
  ctx.translate(-width / 2, -height / 2);
  if (logo) {
    ctx.drawImage(logo, (width - logo.width) / 2, (height - logo.height) / 2 - short * 0.03);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    tracking(ctx, "0.3em");
    ctx.font = `300 ${Math.round(short * 0.035)}px ${textFamily}`;
    ctx.fillText(brand.toUpperCase(), width / 2 + short * 0.005, (height + logo.height) / 2 + short * 0.03);
    tracking(ctx, "0px");
  }
  else {
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    tracking(ctx, "0.3em");
    let size = Math.round(short * 0.06);
    ctx.font = `300 ${size}px ${textFamily}`;
    const text = brand.toUpperCase();
    while (ctx.measureText(text).width > width * 0.84 && size > 12) { size -= 2; ctx.font = `300 ${size}px ${textFamily}`; }
    ctx.fillText(text, width / 2 + short * 0.01, height / 2);
    tracking(ctx, "0px");
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

// Closing brand card: the film dims and settles on the brand name, a hairline rule and the web address.
function drawEndCard(ctx: CanvasRenderingContext2D, logo: HTMLCanvasElement | undefined, brand: string, address: string, credits: string, width: number, height: number, amount: number, pulse = 0) {
  if (amount <= 0) return;
  const short = Math.min(width, height);
  ctx.globalAlpha = amount * 0.68;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = amount;
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lift = logo ? short * 0.1 : 0;
  if (logo) { const k = 0.62; ctx.drawImage(logo, (width - logo.width * k) / 2, height / 2 - short * 0.22 - (logo.height * k) / 2 + lift, logo.width * k, logo.height * k); }
  const brandSize = Math.round(short * (logo ? 0.05 : 0.07));
  tracking(ctx, "0.3em");
  ctx.font = `300 ${brandSize}px ${textFamily}`;
  const brandText = brand.toUpperCase();
  let size = brandSize;
  while (ctx.measureText(brandText).width > width * 0.84 && size > 12) { size -= 2; ctx.font = `300 ${size}px ${textFamily}`; }
  ctx.fillText(brandText, width / 2 + short * 0.01, height / 2 - short * 0.02 + lift);
  ctx.fillRect(width / 2 - short * 0.05, height / 2 + short * 0.045 + lift, short * 0.1, Math.max(1, short * 0.002));
  tracking(ctx, "0.22em");
  ctx.font = `400 ${Math.round(short * 0.028)}px ${textFamily}`;
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.shadowColor = "rgba(255,255,255,0.8)";
  ctx.shadowBlur = short * 0.006 + short * 0.012 * pulse; // soft glow that breathes
  ctx.fillText(address.toUpperCase(), width / 2 + short * 0.005, height / 2 + short * 0.1 + lift);
  ctx.shadowBlur = 0;
  if (credits) {
    tracking(ctx, "0.04em");
    ctx.font = `400 ${Math.max(11, Math.round(short * 0.017))}px ${textFamily}`;
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillText(credits, width / 2, height - short * 0.045);
  }
  tracking(ctx, "0px");
  ctx.globalAlpha = 1;
}

interface Finish { vignette: HTMLCanvasElement; grain: CanvasPattern | null; letterbox: number }

// Film finish applied to every frame: gentle teal/amber grade, vignette, fine grain and optional widescreen bars.
function createFinish(ctx: CanvasRenderingContext2D, width: number, height: number, cinemascope: boolean): Finish {
  const vignette = document.createElement("canvas");
  vignette.width = width;
  vignette.height = height;
  const vctx = vignette.getContext("2d");
  if (vctx) {
    const radial = vctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.35, width / 2, height / 2, Math.hypot(width, height) * 0.58);
    radial.addColorStop(0, "rgba(0,0,0,0)");
    radial.addColorStop(1, "rgba(0,0,0,0.5)");
    vctx.fillStyle = radial;
    vctx.fillRect(0, 0, width, height);
  }
  const noise = document.createElement("canvas");
  noise.width = noise.height = 256;
  const nctx = noise.getContext("2d");
  if (nctx) {
    const image = nctx.createImageData(256, 256);
    for (let i = 0; i < image.data.length; i += 4) {
      const value = Math.random() * 255;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = value;
      image.data[i + 3] = 40;
    }
    nctx.putImageData(image, 0, 0);
  }
  const letterbox = cinemascope && width / height > 1.9 ? 0 : cinemascope && width > height ? Math.round((height - width / 2.39) / 2) : 0;
  return { vignette, grain: ctx.createPattern(noise, "repeat"), letterbox };
}

function applyFinish(ctx: CanvasRenderingContext2D, finish: Finish, width: number, height: number, frame: number) {
  ctx.globalCompositeOperation = "soft-light";
  const grade = ctx.createLinearGradient(0, 0, 0, height);
  grade.addColorStop(0, "rgba(30,90,120,0.16)"); // lighter grade so brand colours (gold, burgundy) stay true
  grade.addColorStop(1, "rgba(170,100,40,0.18)");
  ctx.fillStyle = grade;
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(finish.vignette, 0, 0);
  if (finish.grain) {
    ctx.save();
    ctx.translate((frame * 97) % 256, (frame * 53) % 256);
    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = finish.grain;
    ctx.fillRect(-256, -256, width + 256, height + 256);
    ctx.restore();
  }
  // Lift the shadows: nothing in the picture is darker than #12100e, so blacks are never crushed.
  ctx.globalCompositeOperation = "lighten";
  ctx.fillStyle = "#12100e";
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = "source-over";
  if (finish.letterbox > 0) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, finish.letterbox);
    ctx.fillRect(0, height - finish.letterbox, width, finish.letterbox);
  }
}

async function renderMusic(project: VideoProject): Promise<{ buffer: AudioBuffer; grid?: BeatGrid } | undefined> {
  const mix = project.settings.audioMix?.music;
  const track = project.settings.musicTrackId ? libraryMusic.find((candidate) => candidate.id === project.settings.musicTrackId) : undefined;
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
  gain.gain.linearRampToValueAtTime(1, Math.max(fadeIn, 0.01));
  gain.gain.setValueAtTime(1, Math.max(fadeIn, audible - fadeOut));
  gain.gain.linearRampToValueAtTime(0, audible);
  node.connect(gain).connect(offline.destination);
  node.start(0, fit.startSeconds, audible);
  const rendered = await offline.startRendering();
  normalizeLoudness(rendered, volume);
  // Beat grid of the track, moved onto the film's timeline (the film starts at fit.startSeconds inside the track).
  const found = estimateBeatGrid(source.getChannelData(0), source.sampleRate);
  const grid = found && found.confidence >= 0.35 ? { ...found, offset: (((found.offset - fit.startSeconds) % found.period) + found.period) % found.period } : undefined;
  return { buffer: rendered, grid };
}

// Targets about -14 LUFS integrated at the default music level (the volume slider moves it up or down from there),
// and keeps the peak under -1.5 dBFS so the AAC encode never clips.
function normalizeLoudness(buffer: AudioBuffer, volume: number) {
  const channels = [buffer.getChannelData(0), buffer.getChannelData(Math.min(1, buffer.numberOfChannels - 1))];
  const measured = integratedLoudness(channels, buffer.sampleRate);
  if (!Number.isFinite(measured)) return;
  const target = -14 + 20 * Math.log10(Math.max(0.05, volume) / 0.55);
  let gain = Math.pow(10, (target - measured) / 20);
  let peak = 0;
  for (const channel of channels) for (let i = 0; i < channel.length; i += 1) peak = Math.max(peak, Math.abs(channel[i]));
  const ceiling = Math.pow(10, -1.5 / 20);
  if (peak * gain > ceiling) gain = ceiling / peak;
  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i += 1) data[i] *= gain;
  }
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
  // 1080p for normal spots; long films and weaker browsers fall back to 720p to keep rendering time sensible.
  let quality = project.settings.duration > 90 ? 720 : 1080;
  let { width, height } = frameSize(project.settings.format, quality);
  const configFor = (w: number, h: number, q: number): VideoEncoderConfig => ({ codec: "avc1.640032", width: w, height: h, bitrate: q >= 1080 ? 12_000_000 : 6_000_000, framerate: frameRate, avc: { format: "avc" } });
  if (!(await VideoEncoder.isConfigSupported(configFor(width, height, quality))).supported && quality > 720) {
    quality = 720;
    ({ width, height } = frameSize(project.settings.format, quality));
  }
  const totalDuration = project.settings.duration;
  const showText = project.settings.showTextOnScreen !== false;
  accentColor = pickAccent(project.analysis.colors);
  typographyMode = project.settings.typography ?? (project.settings.style === "Energetic" ? "kinetic" : "calm");
  headlineFamily = project.settings.style === "Editorial" || project.settings.style === "Cinematic" ? serifFamily : textFamily;

  const images = await loadSceneImages(project, width, height, signal);
  onProgress(3);

  let music: AudioBuffer | undefined;
  let audioWarning: string | undefined;
  let beatGrid: BeatGrid | undefined;
  try { const made = await renderMusic(project); music = made?.buffer; beatGrid = made?.grid; } catch (error) { audioWarning = error instanceof Error ? error.message : "Music could not be added."; }
  if (music && !("AudioEncoder" in window && (await AudioEncoder.isConfigSupported({ codec: "mp4a.40.2", sampleRate, numberOfChannels: 2, bitrate: 192_000 })).supported)) {
    music = undefined;
    audioWarning = "This browser cannot encode audio, so the film has no music.";
  }
  throwIfAborted(signal);

  const videoConfig = configFor(width, height, quality);
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
  audioEncoder?.configure({ codec: "mp4a.40.2", sampleRate, numberOfChannels: 2, bitrate: 192_000 });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create a drawing surface.");

  const logo = await prepareLogo(project, width, height).catch(() => undefined);
  const finish = createFinish(ctx, width, height, project.settings.style === "Cinematic");
  const brand = project.analysis.brand || project.title;
  const credits = (() => { const names = [...new Set(project.scenes.map((scene) => scene.credit).filter((value): value is string => Boolean(value)))]; return names.length ? `Photos: ${names.join(", ")}` : ""; })();
  const address = (() => { try { return new URL(project.analysis.url).hostname.replace(/^www\./, ""); } catch { return project.analysis.url; } })();
  // Beat-match: every cut lands on a bar line or beat of the chosen track, so scene lengths become whole beats and bars.
  const plainStarts: number[] = [];
  scenes.reduce((sum, scene) => { plainStarts.push(sum); return sum + scene.duration; }, 0);
  // promos cut on the beat; instructional films breathe: bar lines only, longer shots
  const instructional = project.settings.mode === "instruction";
  const starts = beatGrid ? snapToBeats(plainStarts, beatGrid, totalDuration, instructional ? 0.9 : 0.5, instructional ? 3.5 : 2, 4, instructional) : plainStarts;
  const timeline = scenes.map((scene, index) => ({ ...scene, duration: (starts[index + 1] ?? totalDuration) - starts[index] }));
  const frames = Math.round(totalDuration * frameRate);
  const layouts: Array<TextLayout | undefined> = [];
  const graphicStyle = { accent: accentColor, family: textFamily, headlineFamily };
  // Drawn scenes come from shapes, picture scenes from the loaded image; both fill the whole frame.
  const paint = (index: number, local: number, progress: number) => {
    const scene = timeline[index];
    if (scene.graphic) drawGraphicScene(ctx, { graphic: scene.graphic, headline: scene.headline, typography: scene.typography }, local, scene.duration, progress, width, height, graphicStyle);
    else drawScene(ctx, images[index], scene, index, progress, width, height);
  };
  // On a drawn scene the words the graphic already shows are not printed a second time underneath it.
  const captionFor = (scene: StoryScene): StoryScene | undefined => {
    if (!scene.graphic) return scene;
    if (scene.graphic.kind === "type") return undefined;
    return detectGraphic(scene.headline, "") ? { ...scene, headline: scene.supportingText, supportingText: "" } : { ...scene, supportingText: "" };
  };

  try {
    let current = 0;
    for (let frame = 0; frame < frames; frame += 1) {
      throwIfAborted(signal);
      if (failure) throw failure;
      const time = frame / frameRate;
      while (current < timeline.length - 1 && time >= starts[current + 1]) current += 1;
      const scene = timeline[current];
      const local = time - starts[current];
      ctx.globalAlpha = 1;
      const currentClip = images[current].video;
      if (currentClip) await seekVideo(currentClip, local);
      paint(current, local, local / scene.duration);
      if (!layouts[current] && local >= 0.1) layouts[current] = analyseLayout(ctx, width, height);
      const untilEnd = scene.duration - local;
      if (current < timeline.length - 1 && untilEnd < crossfade) {
        const next = current + 1;
        const blend = ease(1 - untilEnd / crossfade);
        ctx.globalAlpha = blend;
        const nextClip = images[next].video;
        if (nextClip) await seekVideo(nextClip, 0);
        ctx.save();
        ctx.translate((1 - blend) * width * 0.03, 0); // the incoming shot glides in, soft and directional
        paint(next, 0, 0);
        ctx.restore();
        ctx.globalAlpha = 1;
      }
      applyFinish(ctx, finish, width, height, frame);
      const isLast = current === timeline.length - 1;
      // end card is fully readable for at least 2.5 s before the closing fade
      const cardWindow = Math.min(3.6, scene.duration * 0.75);
      const endAmount = isLast ? ease((local - (scene.duration - cardWindow)) / 0.5) : 0;
      const introLength = Math.min(3, totalDuration * 0.2);
      const introAmount = current === 0 ? ease(local / 0.5) * (1 - ease((local - (introLength - 0.7)) / 0.7)) : 0;
      const caption = captionFor(scene);
      if (showText && caption) drawText(ctx, caption, width, height, current === 0 ? Math.max(0, local - introLength + 0.6) : local, current === 0 ? scene.duration - introLength + 0.6 : scene.duration, finish.letterbox, Math.max(endAmount, introAmount), layouts[current] ?? { top: 0, bottom: 0 });
      drawIntro(ctx, logo, brand, width, height, introAmount, current === 0 ? local / introLength : 0);
      drawEndCard(ctx, logo, brand, address, credits, width, height, endAmount, isLast ? 0.5 + 0.5 * Math.sin(local * 2.4) : 0);
      // First frame is already readable (never pure black); the picture is up within 0.4 s and the film only fades in the last 0.4 s.
      const fade = Math.max(Math.min(0.5, 1 - time / 0.4), Math.min(1, 1 - (totalDuration - time) / 0.4), 0);
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
    images.forEach((visual) => {
      visual.image.close();
      if (visual.video) { URL.revokeObjectURL(visual.video.src); visual.video.removeAttribute("src"); }
    });
  }

  onProgress(100);
  return { blob: new Blob([target.buffer], { type: "video/mp4" }), durationSeconds: totalDuration, hasAudio: Boolean(music), audioWarning };
}
