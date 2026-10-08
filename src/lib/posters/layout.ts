import type { PosterBrief, PosterLayoutKind, PosterPlacement } from "@/types/project";
import { chooseFieldAndInk } from "./color.ts";
import { fitText, type FontSpec, type Measure, type PosterFace } from "./text.ts";

// Poster layout engine. Pure functions: no React, no canvas, no network. It only computes rectangles and text blocks.
// Three masters (claim, price, steps). Variation is type size, image crop, and which palette slot is the field colour.

export interface Rect { x: number; y: number; w: number; h: number }

export interface TextBlock {
  lines: string[];
  face: PosterFace;
  weight: number;
  size: number;
  lineHeightPx: number;
  rect: Rect;
  truncated: boolean;
}

export interface StepRow { number: string; disc: Rect; text: TextBlock }

export interface PosterLayout {
  kind: PosterLayoutKind;
  width: number;
  height: number;
  field: string;
  ink: string;
  safe: Rect;
  textSafe: Rect;
  slots: {
    logo?: Rect;
    name?: TextBlock;
    hero?: Rect;
    claim: TextBlock;
    price?: TextBlock;
    location?: TextBlock;
    host?: TextBlock;
    steps?: StepRow[];
  };
}

export interface ImageSize { width: number; height: number }

export interface LayoutInput {
  measure: Measure;
  logo?: ImageSize;
  hero?: ImageSize;
  /** force a master (the studio may let the user switch); otherwise chosen by rule */
  kind?: PosterLayoutKind;
}

/** Layout rule, in order: docs/how-to page with three headings -> steps; price present -> price; else claim. */
export function chooseLayout(brief: Pick<PosterBrief, "docsHint" | "steps" | "price">): PosterLayoutKind {
  if (brief.docsHint && brief.steps.length >= 3) return "steps";
  if (brief.price) return "price";
  return "claim";
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const bottomOf = (rect: Rect) => rect.y + rect.h;
const rightOf = (rect: Rect) => rect.x + rect.w;

/** Fixed type scale from the short side; each step is a ratio of the one above (a perfect fourth, 1.333). */
export function typeScale(placement: PosterPlacement) {
  const short = Math.min(placement.width, placement.height);
  const nameMin = placement.minNamePx ?? Math.round((48 * placement.width) / 1080);
  const name = Math.max(nameMin, Math.round(short * 0.044));
  const claim = Math.max(Math.round(short * 0.092), Math.round(name * 1.5));
  const price = Math.round(claim / 1.333);
  const host = Math.round(name / 1.333);
  const step = Math.round(short * 0.05);
  return { short, nameMin, name, claim, price, host, step };
}

export function computeLayout(brief: PosterBrief, placement: PosterPlacement, input: LayoutInput): PosterLayout {
  const { measure } = input;
  const { width: W, height: H } = placement;
  const kind = input.kind ?? chooseLayout(brief);
  const scale = typeScale(placement);
  const S = scale.short;
  const g = Math.round(S * 0.03);
  const { field, ink } = chooseFieldAndInk(brief.palette, { prefer: kind === "price" ? "accent" : "background", ink: brief.ink });

  const inset = placement.safeInsets;
  const safe: Rect = { x: inset.left, y: inset.top, w: W - inset.left - inset.right, h: H - inset.top - inset.bottom };
  const columnInset = placement.textColumn ? Math.round((W * (1 - placement.textColumn)) / 2) : 0;
  const textLeft = Math.max(safe.x, columnInset);
  const textRight = Math.min(rightOf(safe), W - columnInset);
  const textSafe: Rect = { x: textLeft, y: safe.y, w: textRight - textLeft, h: safe.h };

  const landscape = W / H >= 1.25;
  const hero = kind === "steps" ? undefined : input.hero;
  const heroAspect = hero ? clamp(hero.width / hero.height, 0.8, 1.9) : 1;

  // --- hero slot (landscape: right column; otherwise a band under the header) ---
  let heroRect: Rect | undefined;
  let textRightEdge = rightOf(textSafe);
  if (hero && landscape) {
    const w = Math.round(safe.w * 0.40);
    const h = Math.min(safe.h, Math.round(w / heroAspect));
    heroRect = { x: rightOf(safe) - w, y: safe.y + Math.round((safe.h - h) / 2), w, h };
    textRightEdge = heroRect.x - g * 2;
  }

  // --- header: logo (corner, at most 7% of the short side) and the brand name ---
  let logoRect: Rect | undefined;
  if (input.logo) {
    const aspect = input.logo.width / input.logo.height;
    const maxH = Math.round(S * 0.07);
    const maxW = Math.round(safe.w * 0.28);
    const h = Math.min(maxH, Math.round(maxW / aspect));
    logoRect = { x: textSafe.x, y: safe.y, w: Math.round(h * aspect), h };
  }
  const nameStart = logoRect ? rightOf(logoRect) + g : textSafe.x;
  const nameBox = { w: Math.max(textRightEdge - nameStart, 1), h: Math.round(scale.name * 1.3) };
  const nameFont: FontSpec = { face: "grotesque", weight: 700, size: scale.name };
  const nameFit = brief.name ? fitText(brief.name, nameFont, nameBox, { maxLines: 1, lineHeight: 1.2, minSize: scale.nameMin }, measure) : undefined;
  const headerH = Math.max(logoRect?.h ?? 0, nameFit?.height ?? 0);
  const name: TextBlock | undefined = nameFit && nameFit.lines.length
    ? { lines: nameFit.lines, face: "grotesque", weight: 700, size: nameFit.size, lineHeightPx: nameFit.lineHeightPx, truncated: nameFit.truncated, rect: { x: nameStart, y: safe.y + Math.round((headerH - nameFit.height) / 2), w: nameBox.w, h: nameFit.height } }
    : undefined;
  if (logoRect) logoRect = { ...logoRect, y: safe.y + Math.round((headerH - logoRect.h) / 2) };

  // --- footer: location above the host, both at the bottom of the safe area ---
  const hostFont: FontSpec = { face: "grotesque", weight: 500, size: scale.host };
  const footerItems = [{ key: "location", text: brief.location }, { key: "host", text: brief.host }].filter((item): item is { key: string; text: string } => Boolean(item.text));
  const footer: Record<string, TextBlock> = {};
  let footerTop = bottomOf(safe);
  for (const item of [...footerItems].reverse()) {
    const width = Math.max(textRightEdge - textSafe.x, 1);
    const fit = fitText(item.text, hostFont, { w: width, h: Math.round(scale.host * 1.4) }, { maxLines: 1, lineHeight: 1.25 }, measure);
    footerTop -= fit.height;
    footer[item.key] = { lines: fit.lines, face: "grotesque", weight: 500, size: fit.size, lineHeightPx: fit.lineHeightPx, truncated: fit.truncated, rect: { x: textSafe.x, y: footerTop, w: width, h: fit.height } };
  }
  const { location, host } = footer;
  const bodyTop = safe.y + headerH + Math.round(g * 1.5);
  const bodyBottom = footerItems.length ? footerTop - Math.round(g * 1.5) : bottomOf(safe);

  const displayFont = (size: number): FontSpec => ({ face: "display", weight: 400, size });

  // Fits the claim (and the price) into a width and height. The same fit decides how tall the picture may become.
  const fitClaimGroup = (width: number, height: number) => {
    const priceFit = kind === "price" && brief.price
      ? fitText(brief.price, { face: "grotesque", weight: 700, size: scale.price }, { w: width, h: Math.round(scale.price * 1.4) }, { maxLines: 1, lineHeight: 1.2 }, measure)
      : undefined;
    const claimFit = fitText(brief.claim, displayFont(scale.claim), { w: width, h: Math.max(height - (priceFit ? priceFit.height + g : 0), 1) }, { maxLines: 4, lineHeight: 1.06 }, measure);
    return { claimFit, priceFit, groupH: claimFit.height + (priceFit ? g + priceFit.height : 0) };
  };

  // --- hero band for stacked formats: as tall as the text leaves room for, never cropping more than about 20% ---
  let preFit: ReturnType<typeof fitClaimGroup> | undefined;
  if (hero && !landscape) {
    const bodyH = bodyBottom - bodyTop;
    const below = Math.round(g * 1.5);
    const minHero = Math.round(bodyH * (kind === "price" ? 0.3 : 0.34));
    preFit = fitClaimGroup(Math.max(textRightEdge - textSafe.x, 1), bodyH - minHero - below);
    const leftover = bodyH - preFit.groupH - below;
    const tallestForPicture = Math.round(safe.w / (heroAspect * 0.8));
    heroRect = { x: safe.x, y: bodyTop, w: safe.w, h: Math.max(minHero, Math.min(leftover, tallestForPicture)) };
  }

  // --- text region: what is left after the picture; the text group is centred in it ---
  const regionTop = heroRect && !landscape ? bottomOf(heroRect) + Math.round(g * 1.5) : bodyTop;
  const region: Rect = { x: textSafe.x, y: regionTop, w: Math.max(textRightEdge - textSafe.x, 1), h: Math.max(bodyBottom - regionTop, 1) };

  let claim: TextBlock;
  let price: TextBlock | undefined;
  let steps: StepRow[] | undefined;

  if (kind === "steps") {
    const title = fitText(brief.claim, displayFont(scale.price), { w: region.w, h: Math.round(region.h * 0.3) }, { maxLines: 3, lineHeight: 1.1 }, measure);
    const lines = brief.steps.slice(0, 3);
    const discD = Math.round(scale.step * 1.7);
    const rowH = Math.min(Math.round(S * 0.16), Math.floor((region.h - title.height - g) / Math.max(lines.length, 1)));
    const groupH = title.height + g + rowH * lines.length;
    const top = region.y + Math.max(0, Math.round((region.h - groupH) / 2));
    claim = { lines: title.lines, face: "display", weight: 400, size: title.size, lineHeightPx: title.lineHeightPx, truncated: title.truncated, rect: { x: region.x, y: top, w: region.w, h: title.height } };
    const textW = Math.max(region.w - discD - g, 1);
    const stepFit = (text: string, size: number, minSize?: number) => fitText(text, { face: "grotesque", weight: 500, size }, { w: textW, h: rowH }, { maxLines: 2, lineHeight: 1.15, minSize }, measure);
    // all three lines share one size: the smallest that lets every line fit (the second pass may cut words but never shrink again)
    const commonSize = Math.min(scale.step, ...lines.map((text) => stepFit(text, scale.step).size));
    steps = lines.map((text, index) => {
      const rowTop = top + title.height + g + rowH * index;
      const fit = stepFit(text, commonSize, commonSize);
      return {
        number: String(index + 1),
        disc: { x: region.x, y: rowTop + Math.round((rowH - discD) / 2), w: discD, h: discD },
        text: { lines: fit.lines, face: "grotesque", weight: 500, size: fit.size, lineHeightPx: fit.lineHeightPx, truncated: fit.truncated, rect: { x: region.x + discD + g, y: rowTop + Math.round((rowH - fit.height) / 2), w: textW, h: fit.height } },
      };
    });
  } else {
    const { claimFit, priceFit, groupH } = preFit ?? fitClaimGroup(region.w, region.h);
    const top = region.y + Math.max(0, Math.round((region.h - groupH) / 2));
    claim = { lines: claimFit.lines, face: "display", weight: 400, size: claimFit.size, lineHeightPx: claimFit.lineHeightPx, truncated: claimFit.truncated, rect: { x: region.x, y: top, w: region.w, h: claimFit.height } };
    if (priceFit) {
      price = { lines: priceFit.lines, face: "grotesque", weight: 700, size: priceFit.size, lineHeightPx: priceFit.lineHeightPx, truncated: priceFit.truncated, rect: { x: region.x, y: bottomOf(claim.rect) + g, w: region.w, h: priceFit.height } };
    }
  }

  return {
    kind, width: W, height: H, field, ink, safe, textSafe,
    slots: { logo: logoRect, name, hero: heroRect, claim, price, location, host, steps },
  };
}

/** Every rectangle in a layout, for tests: text blocks, hero, logo, step discs. */
export function layoutRects(layout: PosterLayout): Record<string, Rect> {
  const { slots } = layout;
  const rects: Record<string, Rect> = { claim: slots.claim.rect };
  if (slots.logo) rects.logo = slots.logo;
  if (slots.name) rects.name = slots.name.rect;
  if (slots.hero) rects.hero = slots.hero;
  if (slots.price) rects.price = slots.price.rect;
  if (slots.location) rects.location = slots.location.rect;
  if (slots.host) rects.host = slots.host.rect;
  slots.steps?.forEach((step, index) => {
    rects[`step${index + 1}.disc`] = step.disc;
    rects[`step${index + 1}.text`] = step.text.rect;
  });
  return rects;
}
