import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { fitMusicToVideo } from "@/lib/audio/mix";
import { scorvikOriginalMusic } from "@/lib/music/recommend";
import type { StoryScene, VideoFormat, VideoProject } from "@/types/project";
import { normalizeSceneDurations, validateRenderProject } from "./validation";

// Renders a storyboard to an H.264/AAC MP4 inside the user's browser (WebCodecs + canvas), so no render server is needed.

const frameRate = 24; // cinema/TV-spot cadence
const crossfade = 0.7;
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
async function loadSceneImages(project: VideoProject, width: number, height: number, signal?: AbortSignal): Promise<Visual[]> {
  const logos = new Set(project.analysis.logoCandidates ?? []);
  const cache = new Map<string, ImageBitmap | undefined>();
  const get = async (url: string) => {
    if (!cache.has(url)) cache.set(url, await loadBitmap(url, project.analysis.url));
    return cache.get(url);
  };
  const chosen: Array<{ url: string; bitmap: ImageBitmap } | undefined> = [];
  const used = new Set<string>();
  for (const scene of project.scenes) {
    throwIfAborted(signal);
    const own = scene.visual ? await get(scene.visual) : undefined;
    if (own && usable(own) && !used.has(scene.visual)) { chosen.push({ url: scene.visual, bitmap: own }); used.add(scene.visual); } else chosen.push(undefined);
  }
  if (chosen.some((entry) => !entry)) {
    const pool = [...new Set([project.analysis.openGraphImage, ...(project.analysis.images ?? []), project.analysis.image, project.thumbnailUrl].filter((value): value is string => Boolean(value) && !logos.has(value as string)))].slice(0, 14);
    for (let start = 0; start < pool.length; start += 4) {
      throwIfAborted(signal);
      await Promise.all(pool.slice(start, start + 4).map((url) => get(url)));
    }
    const ranked = pool.map((url) => ({ url, bitmap: cache.get(url) })).filter((entry): entry is { url: string; bitmap: ImageBitmap } => Boolean(entry.bitmap && usable(entry.bitmap)))
      .sort((left, right) => shortestSide(right.bitmap) - shortestSide(left.bitmap));
    const fallbackAny = pool.map((url) => ({ url, bitmap: cache.get(url) })).filter((entry): entry is { url: string; bitmap: ImageBitmap } => Boolean(entry.bitmap));
    for (const [index, entry] of chosen.entries()) {
      if (entry) continue;
      const fresh = ranked.find((candidate) => !used.has(candidate.url));
      const pick = fresh ?? ranked[index % Math.max(1, ranked.length)] ?? fallbackAny[0];
      if (!pick) throw new Error(`Scene ${index + 1} has no image that could be loaded.`);
      used.add(pick.url);
      chosen[index] = pick;
    }
  }
  const visuals = new Map<ImageBitmap, Visual>();
  const result: Visual[] = [];
  for (const entry of chosen) {
    const bitmap = entry!.bitmap;
    let visual = visuals.get(bitmap);
    if (!visual) { visual = await prepareVisual(bitmap, width, height); visuals.set(bitmap, visual); }
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
  const coverScale = Math.max(width / image.width, height / image.height);
  // Needs heavy upscaling (soft, pixelated result) or heavy cropping: show it whole over a blurred backdrop instead.
  if (visible >= 0.62 && coverScale <= 1.7) return { image };
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
  const { zoom, pan, tilt } = motion(scene, index, progress);
  const { image, backdrop } = visual;
  if (backdrop) {
    ctx.drawImage(backdrop, 0, 0);
    const fit = Math.min(width / image.width, (height * 0.7) / image.height, 1.5) * (1 + (zoom - 1) * 0.5);
    const w = image.width * fit;
    const h = image.height * fit;
    ctx.drawImage(image, (width - w) / 2, (height - h) / 2 - height * 0.07, w, h); // lifted so titles sit below the picture
    return;
  }
  const cover = Math.max(width / image.width, height / image.height) * zoom;
  const drawWidth = image.width * cover;
  const drawHeight = image.height * cover;
  // Bias the crop upward so heads and key subjects stay in frame.
  ctx.drawImage(image, -(drawWidth - width) * pan, -(drawHeight - height) * tilt, drawWidth, drawHeight);
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
const ease = (value: number) => { const v = Math.max(0, Math.min(1, value)); return v * v * (3 - 2 * v); };

function tracking(ctx: CanvasRenderingContext2D, value: string) {
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = value;
}

// Centred title card in the style of a TV spot: headline over a lighter supporting line, easing in and out with the scene.
function drawText(ctx: CanvasRenderingContext2D, scene: StoryScene, width: number, height: number, local: number, duration: number, inset: number, hide: number) {
  if (scene.noOverlay) return;
  const headline = scene.headline.trim();
  const support = scene.supportingText.trim() && scene.supportingText.trim() !== headline ? scene.supportingText.trim() : "";
  if (!headline && !support) return;
  const appear = ease((local - 0.25) / 0.7) * ease((duration - local) / 0.35) * (1 - hide);
  if (appear <= 0) return;
  const short = Math.min(width, height);
  const maxWidth = width * (width > height ? 0.62 : 0.84);
  const headSize = Math.round(short * 0.056);
  const supportSize = Math.round(headSize * 0.5);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "center";
  tracking(ctx, "0.01em");
  ctx.font = `600 ${headSize}px ${textFamily}`;
  const headLines = headline ? wrap(ctx, headline, maxWidth).slice(0, 2) : [];
  tracking(ctx, "0.03em");
  ctx.font = `400 ${supportSize}px ${textFamily}`;
  const supportLines = support ? wrap(ctx, support, maxWidth).slice(0, 2) : [];
  const blockHeight = headLines.length * headSize * 1.15 + (supportLines.length ? supportSize * 0.9 + supportLines.length * supportSize * 1.35 : 0);
  const baseline = height - inset - short * 0.085;
  const top = baseline - blockHeight;
  const rise = (1 - appear) * headSize * 0.4;

  const scrimTop = top - headSize * 2.6;
  const gradient = ctx.createLinearGradient(0, scrimTop, 0, height);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(1, "rgba(0,0,0,0.7)");
  ctx.globalAlpha = appear;
  ctx.fillStyle = gradient;
  ctx.fillRect(0, scrimTop, width, height - scrimTop);
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = headSize * 0.3;
  ctx.fillStyle = "#fff";
  let y = top + rise;
  tracking(ctx, "0.01em");
  ctx.font = `600 ${headSize}px ${textFamily}`;
  for (const line of headLines) { y += headSize * 1.15; ctx.fillText(line, width / 2, y - headSize * 0.2); }
  if (supportLines.length) {
    tracking(ctx, "0.03em");
    ctx.font = `400 ${supportSize}px ${textFamily}`;
    ctx.fillStyle = "rgba(255,255,255,0.86)";
    y += supportSize * 0.9;
    for (const line of supportLines) { y += supportSize * 1.35; ctx.fillText(line, width / 2, y - supportSize * 0.3); }
  }
  ctx.shadowBlur = 0;
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
    }
    return canvas;
  }
  return undefined;
}

// Opening card: the film starts dimmed with the logo (or brand name) fading in, then lifting into the first scene.
function drawIntro(ctx: CanvasRenderingContext2D, logo: HTMLCanvasElement | undefined, brand: string, width: number, height: number, amount: number) {
  if (amount <= 0) return;
  const short = Math.min(width, height);
  ctx.globalAlpha = amount * 0.8;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = amount;
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
  ctx.globalAlpha = 1;
}

// Closing brand card: the film dims and settles on the brand name, a hairline rule and the web address.
function drawEndCard(ctx: CanvasRenderingContext2D, logo: HTMLCanvasElement | undefined, brand: string, address: string, width: number, height: number, amount: number) {
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
  ctx.fillText(address.toUpperCase(), width / 2 + short * 0.005, height / 2 + short * 0.1 + lift);
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
  grade.addColorStop(0, "rgba(30,90,120,0.28)");
  grade.addColorStop(1, "rgba(170,100,40,0.28)");
  ctx.fillStyle = grade;
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(finish.vignette, 0, 0);
  if (finish.grain) {
    ctx.save();
    ctx.translate((frame * 97) % 256, (frame * 53) % 256);
    ctx.globalAlpha = 0.09;
    ctx.fillStyle = finish.grain;
    ctx.fillRect(-256, -256, width + 256, height + 256);
    ctx.restore();
  }
  if (finish.letterbox > 0) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, finish.letterbox);
    ctx.fillRect(0, height - finish.letterbox, width, finish.letterbox);
  }
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
  // 1080p for normal spots; long films and weaker browsers fall back to 720p to keep rendering time sensible.
  let quality = project.settings.duration > 90 ? 720 : 1080;
  let { width, height } = frameSize(project.settings.format, quality);
  const configFor = (w: number, h: number, q: number): VideoEncoderConfig => ({ codec: "avc1.640032", width: w, height: h, bitrate: q >= 1080 ? 9_000_000 : 5_000_000, framerate: frameRate, avc: { format: "avc" } });
  if (!(await VideoEncoder.isConfigSupported(configFor(width, height, quality))).supported && quality > 720) {
    quality = 720;
    ({ width, height } = frameSize(project.settings.format, quality));
  }
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
  audioEncoder?.configure({ codec: "mp4a.40.2", sampleRate, numberOfChannels: 2, bitrate: 128_000 });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create a drawing surface.");

  const logo = await prepareLogo(project, width, height).catch(() => undefined);
  const finish = createFinish(ctx, width, height, project.settings.style === "Cinematic");
  const brand = project.analysis.brand || project.title;
  const address = (() => { try { return new URL(project.analysis.url).hostname.replace(/^www\./, ""); } catch { return project.analysis.url; } })();
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
      const untilEnd = scene.duration - local;
      if (current < scenes.length - 1 && untilEnd < crossfade) {
        const next = current + 1;
        ctx.globalAlpha = ease(1 - untilEnd / crossfade);
        drawScene(ctx, images[next], scenes[next], next, 0, width, height);
        ctx.globalAlpha = 1;
      }
      applyFinish(ctx, finish, width, height, frame);
      const isLast = current === scenes.length - 1;
      const cardWindow = Math.min(3, scene.duration * 0.65);
      const endAmount = isLast ? ease((local - (scene.duration - cardWindow)) / 0.8) : 0;
      const introLength = Math.min(3, totalDuration * 0.2);
      const introAmount = current === 0 ? ease(local / 0.5) * (1 - ease((local - (introLength - 0.7)) / 0.7)) : 0;
      if (showText) drawText(ctx, scene, width, height, current === 0 ? Math.max(0, local - introLength + 0.6) : local, current === 0 ? scene.duration - introLength + 0.6 : scene.duration, finish.letterbox, Math.max(endAmount, introAmount));
      drawIntro(ctx, logo, brand, width, height, introAmount);
      drawEndCard(ctx, logo, brand, address, width, height, endAmount);
      const fade = Math.max(Math.min(1, 1 - time / 0.4), Math.min(1, 1 - (totalDuration - time) / 0.6), 0);
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
