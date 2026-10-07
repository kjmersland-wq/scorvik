// Key points: which messages on a page are worth a scene, and how long a film they need.
import type { SiteAnalysis } from "@/types/project";
import { footerNoise } from "./captions.ts";
import { countWords } from "./timing.ts";

export interface KeyPoint {
  text: string;
  score: number;
}

// What makes a message land: something specific, a benefit, a reason to act. UI furniture and legal lines never do.
const benefit = /\b(save|saves|saving|plan|know|exact|live|free|fast|quick|easy|simple|compare|avoid|find|get|see|track|cover|include|works?|spar|planlegg|vet|nøyaktig|gratis|rask|enkel|sammenlign|unngå|finn|se|få|dekker|inkluderer)\b/gi;
const furniture = /\b(click here|read more|learn more|log ?in|sign ?in|menu|cookie|accept|skip to|back to top|les mer|logg inn|meny|godta|tilbake)\b/i;
const specific = /\d[\d\s.,]*\+?|[$€£]\s?\d|%|\b(all|every|alle|hver)\b/i;

/** 0 = nothing to say, 3+ = a point that earns its own scene. */
export function appealScore(text: string): number {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean || footerNoise.test(clean) || furniture.test(clean)) return -10;
  const words = countWords(clean);
  let score = 0;
  if (words >= 4 && words <= 14) score += 2;
  else if (words < 3) score -= 2;
  else if (words > 25) score -= 3;
  if (specific.test(clean)) score += 2;
  if (/\d/.test(clean)) score += 1;
  score += Math.min(3, (clean.match(benefit) ?? []).length);
  const names = (clean.match(/(?<!^)(?<![.!?]\s)\b\p{Lu}[\p{L}]{2,}/gu) ?? []).length;
  score += Math.min(2, names);
  return score;
}

const tokens = (text: string) => new Set((text.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []));

/** True when two texts say nearly the same thing. */
export function overlaps(first: string, second: string, threshold = 0.6): boolean {
  const left = tokens(first);
  const right = tokens(second);
  if (!left.size || !right.size) return false;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / Math.min(left.size, right.size) >= threshold;
}

/** Every distinct message found on the page, strongest first. */
export function collectKeyPoints(analysis: SiteAnalysis): KeyPoint[] {
  const raw = [
    ...(analysis.sellingPoints ?? []),
    ...(analysis.headings ?? []),
    ...(analysis.subheadings ?? []),
    ...(analysis.proofPoints ?? []),
    ...(analysis.visibleText ?? "").split(/(?<=[.!?])\s+/).filter((sentence) => sentence.length >= 25 && sentence.length <= 200),
  ];
  const scored = raw.map((text) => ({ text: text.replace(/\s+/g, " ").trim(), score: appealScore(text) })).filter((point) => point.score >= 2);
  scored.sort((left, right) => right.score - left.score);
  const unique: KeyPoint[] = [];
  for (const point of scored) if (!unique.some((kept) => overlaps(kept.text, point.text))) unique.push(point);
  return unique.slice(0, 30);
}

const lengths = [15, 20, 30, 45, 60, 90];

/** About five seconds per strong point (plus the opening and the close), rounded to a supported length. */
export function recommendPromoDuration(points: KeyPoint[], modelStrong = 0): { seconds: number; keyPoints: number } {
  const strong = Math.max(points.filter((point) => point.score >= 4).length, modelStrong);
  const keyPoints = Math.min(strong, 16);
  const wanted = (keyPoints + 2) * 5;
  const seconds = lengths.find((length) => length >= wanted) ?? 90;
  return { seconds: Math.max(15, seconds), keyPoints };
}
