import type { PosterBrief, PosterLayoutKind, PosterPlacement } from "@/types/project";
import type { PosterImages } from "./assets.ts";
import { contrastRatio, IVORY, NEAR_BLACK, toHex } from "./color.ts";
import { computeContactSheet, defaultSheetOptions, type SheetCell } from "./contact-sheet.ts";
import { ensurePosterFonts, fontCss } from "./fonts.ts";
import { computeLayout, type PosterLayout, type Rect, type TextBlock } from "./layout.ts";
import type { FontSpec, Measure } from "./text.ts";

// Draws posters on a canvas in the browser, so no render server is needed (Vercel Hobby keeps working).
// Deterministic: the same brief, placement, pictures and fonts always give the same pixels. Nothing is random.
// Flat colour only: no gradients, no shadows, no mock UI.

export function canvasMeasure(): Measure {
  const context = document.createElement("canvas").getContext("2d");
  return (text: string, font: FontSpec) => {
    if (!context) return text.length * font.size * 0.55;
    context.font = fontCss(font);
    return context.measureText(text).width;
  };
}

function drawBlock(ctx: CanvasRenderingContext2D, block: TextBlock, colour: string) {
  ctx.fillStyle = colour;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = fontCss({ face: block.face, weight: block.weight, size: block.size });
  block.lines.forEach((line, index) => {
    ctx.fillText(line, block.rect.x, block.rect.y + index * block.lineHeightPx + (block.lineHeightPx - block.size) / 2);
  });
}

/** Cover-crops the picture into the slot. The stored focal point wins over the geometric centre. */
function drawCover(ctx: CanvasRenderingContext2D, bitmap: ImageBitmap, slot: Rect, focal?: { x: number; y: number }) {
  const scale = Math.max(slot.w / bitmap.width, slot.h / bitmap.height);
  const sw = slot.w / scale;
  const sh = slot.h / scale;
  const fx = focal?.x ?? 0.5;
  const fy = focal?.y ?? 0.5;
  const sx = Math.min(Math.max(fx * bitmap.width - sw / 2, 0), bitmap.width - sw);
  const sy = Math.min(Math.max(fy * bitmap.height - sh / 2, 0), bitmap.height - sh);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, sx, sy, sw, sh, slot.x, slot.y, slot.w, slot.h);
}

/** Average colour of the logo's visible pixels, to decide whether it needs a flat plate to stay readable. */
function meanColour(bitmap: ImageBitmap): string | undefined {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 24;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return undefined;
  context.drawImage(bitmap, 0, 0, 24, 24);
  const data = context.getImageData(0, 0, 24, 24).data;
  let r = 0, g = 0, b = 0, count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    r += data[i]; g += data[i + 1]; b += data[i + 2]; count += 1;
  }
  return count ? toHex([r / count, g / count, b / count]) : undefined;
}

function drawLogo(ctx: CanvasRenderingContext2D, bitmap: ImageBitmap, slot: Rect, field: string) {
  const mean = meanColour(bitmap);
  const needsPlate = mean !== undefined && contrastRatio(mean, field) < 3;
  if (needsPlate) {
    ctx.fillStyle = contrastRatio(IVORY, mean) >= contrastRatio(NEAR_BLACK, mean) ? IVORY : NEAR_BLACK;
    ctx.fillRect(slot.x, slot.y, slot.w, slot.h);
    const pad = Math.round(slot.h * 0.12);
    ctx.drawImage(bitmap, slot.x + pad, slot.y + pad, slot.w - pad * 2, slot.h - pad * 2);
  } else {
    ctx.drawImage(bitmap, slot.x, slot.y, slot.w, slot.h);
  }
}

export function drawPoster(ctx: CanvasRenderingContext2D, layout: PosterLayout, brief: PosterBrief, images: PosterImages) {
  const { slots } = layout;
  ctx.fillStyle = layout.field;
  ctx.fillRect(0, 0, layout.width, layout.height);
  if (images.hero && slots.hero) drawCover(ctx, images.hero, slots.hero, brief.focal);
  if (images.logo && slots.logo) drawLogo(ctx, images.logo, slots.logo, layout.field);
  if (slots.name) drawBlock(ctx, slots.name, layout.ink);
  drawBlock(ctx, slots.claim, layout.ink);
  if (slots.price) drawBlock(ctx, slots.price, layout.ink);
  for (const step of slots.steps ?? []) {
    ctx.fillStyle = layout.ink;
    ctx.beginPath();
    ctx.arc(step.disc.x + step.disc.w / 2, step.disc.y + step.disc.h / 2, step.disc.w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = layout.field;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = fontCss({ face: "grotesque", weight: 700, size: Math.round(step.disc.w * 0.46) });
    ctx.fillText(step.number, step.disc.x + step.disc.w / 2, step.disc.y + step.disc.h / 2 + step.disc.w * 0.03);
    drawBlock(ctx, step.text, layout.ink);
  }
  if (slots.location) drawBlock(ctx, slots.location, layout.ink);
  if (slots.host) drawBlock(ctx, slots.host, layout.ink);
  if (brief.mock) { // posters from a mock analysis are always labelled
    const size = Math.round(Math.min(layout.width, layout.height) * 0.028);
    ctx.font = fontCss({ face: "grotesque", weight: 700, size });
    const label = "MOCK";
    const width = ctx.measureText(label).width + size;
    const x = layout.safe.x + layout.safe.w - width;
    ctx.strokeStyle = layout.ink;
    ctx.lineWidth = Math.max(2, size * 0.1);
    ctx.strokeRect(x, layout.safe.y, width, size * 1.6);
    ctx.fillStyle = layout.ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + width / 2, layout.safe.y + size * 0.82);
  }
}

export interface RenderedPoster { canvas: HTMLCanvasElement; layout: PosterLayout }

export async function renderPosterCanvas(brief: PosterBrief, placement: PosterPlacement, images: PosterImages, options: { kind?: PosterLayoutKind } = {}): Promise<RenderedPoster> {
  await ensurePosterFonts();
  const canvas = document.createElement("canvas");
  canvas.width = placement.width;
  canvas.height = placement.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create a drawing surface.");
  const layout = computeLayout(brief, placement, {
    measure: canvasMeasure(),
    kind: options.kind,
    logo: images.logo ? { width: images.logo.width, height: images.logo.height } : undefined,
    hero: images.hero ? { width: images.hero.width, height: images.hero.height } : undefined,
  });
  drawPoster(ctx, layout, brief, images);
  return { canvas, layout };
}

export function canvasBlob(canvas: HTMLCanvasElement, type: "image/png" | "image/jpeg", quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the poster."))), type, quality));
}

export async function renderPosterBlob(brief: PosterBrief, placement: PosterPlacement, images: PosterImages, options: { kind?: PosterLayoutKind } = {}): Promise<{ blob: Blob; layout: PosterLayout }> {
  const { canvas, layout } = await renderPosterCanvas(brief, placement, images, options);
  return { blob: await canvasBlob(canvas, "image/png"), layout };
}

/** One sheet with every poster, two columns, each labelled with the placement name and pixel size. */
export async function renderContactSheet(items: Array<{ cell: SheetCell; blob: Blob }>, brandName: string): Promise<Blob> {
  await ensurePosterFonts();
  const options = defaultSheetOptions;
  const sheet = computeContactSheet(items.map((item) => item.cell), options);
  const canvas = document.createElement("canvas");
  canvas.width = sheet.width;
  canvas.height = sheet.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create a drawing surface.");
  ctx.fillStyle = "#0b0b0c";
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  ctx.textBaseline = "top";
  for (const [index, placed] of sheet.items.entries()) {
    const bitmap = await createImageBitmap(items[index].blob);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, placed.x, placed.y, placed.w, placed.h);
    bitmap.close();
    ctx.strokeStyle = "#3a3534";
    ctx.lineWidth = 2;
    ctx.strokeRect(placed.x - 1, placed.y - 1, placed.w + 2, placed.h + 2);
    ctx.fillStyle = "#f1ece6";
    ctx.textAlign = "left";
    ctx.font = fontCss({ face: "grotesque", weight: 500, size: 22 });
    ctx.fillText(placed.label, placed.x, placed.labelY);
  }
  ctx.fillStyle = "#a49a92";
  ctx.font = fontCss({ face: "grotesque", weight: 500, size: 18 });
  ctx.textAlign = "right";
  ctx.fillText(`${brandName} · poster pack`, sheet.width - options.margin, 18);
  return canvasBlob(canvas, "image/png");
}
