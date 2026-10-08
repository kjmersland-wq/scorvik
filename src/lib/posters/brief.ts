import type { FilmMode, PosterBrief, SiteAnalysis } from "@/types/project";

// Builds a poster brief from an existing site analysis. Pure: no network, no scraping a second time.
// Missing fields stay missing; nothing is invented to fill a slot.

export const CLAIM_MAX = 90;

export function clean(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

/** Cuts on a word boundary so the result is at most `max` characters, ending with an ellipsis when something was cut. */
export function trimOnWord(text: string, max: number): string {
  const value = clean(text);
  if (value.length <= max) return value;
  const cut = value.slice(0, max - 1);
  const atWord = /\s/.test(value[max - 1] ?? "") ? cut : cut.replace(/\s+\S*$/, "");
  return `${(atWord || cut).replace(/[\s,.;:–—-]+$/, "")}…`;
}

const currency = String.raw`(?:kr\.?|NOK|SEK|DKK|USD|EUR|GBP|\$|€|£)`;
const period = String.raw`(?:\s?(?:/|per\s)\s?(?:mnd|md|måned|month|mo|år|year|yr|dag|day))?`;
const digits = String.raw`\d(?:[\d\s.,]*\d)?`;
const priceRule = new RegExp(String.raw`(?:\b(?:fra|from|ab|kun|only)\s+)?(?:${currency}\s?${digits}${period}|${digits}\s?(?:${currency}|,-)${period})`, "i");

/** The first price found in the page text, as written on the page. */
export function extractPrice(text: string | undefined): string | undefined {
  const match = priceRule.exec(text ?? "");
  if (!match) return undefined;
  const value = clean(match[0]).replace(/[\s,.]+$/, "");
  return value.length >= 2 && value.length <= 24 && /\d/.test(value) ? value : undefined;
}

export function hostOf(url: string): string {
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

const docsSegments = /^(docs?|documentation|help|guide|guides|how-?to|tutorials?|learn|support|manual)$/i;

export function isDocsPath(url: string): boolean {
  try {
    const parsed = new URL(url.includes("://") ? url : `https://${url}`);
    const labels = parsed.hostname.replace(/^www\./, "").split(".").slice(0, 1);
    return [...labels, ...parsed.pathname.split("/")].some((segment) => docsSegments.test(segment));
  } catch {
    return false;
  }
}

function firstSentence(text: string): string {
  const value = clean(text);
  return /^(.{20,}?[.!?])(\s|$)/.exec(value)?.[1] ?? value;
}

/** Claims already on the page, best first. The user picks or edits one; nothing here is written by us. */
export function claimCandidates(analysis: SiteAnalysis): string[] {
  const brand = clean(analysis.brandProfile?.name || analysis.brand).toLowerCase();
  const raw = [
    ...(analysis.headings ?? []).slice(0, 4),
    analysis.brandProfile?.valueProposition,
    firstSentence(analysis.description),
    analysis.title,
  ];
  const seen = new Set<string>();
  return raw
    .map((value) => clean(value))
    .filter((value) => value.length >= 8 && value.toLowerCase() !== brand)
    .filter((value) => (seen.has(value.toLowerCase()) ? false : (seen.add(value.toLowerCase()), true)))
    .map((value) => trimOnWord(value, CLAIM_MAX));
}

/** Pictures from the site that can serve as the hero, logos and the favicon excluded. */
export function heroCandidates(analysis: SiteAnalysis): string[] {
  const skip = new Set([...(analysis.logoCandidates ?? []), analysis.faviconUrl].filter((value): value is string => Boolean(value)));
  return [...new Set([...(analysis.images ?? []), analysis.openGraphImage, analysis.image].filter((value): value is string => Boolean(value) && !skip.has(value as string)))];
}

/** Up to three numbered lines from headings or steps already extracted. */
export function stepLines(analysis: SiteAnalysis, claim: string): string[] {
  const fromSteps = (analysis.steps ?? []).map((step) => clean(step.title));
  const fromHeadings = [...(analysis.headings ?? []), ...(analysis.subheadings ?? [])].map(clean).filter((heading) => heading.toLowerCase() !== claim.toLowerCase());
  const seen = new Set<string>();
  return [...fromSteps, ...fromHeadings]
    .filter((line) => line.length >= 3 && line.length <= 80)
    .filter((line) => (seen.has(line.toLowerCase()) ? false : (seen.add(line.toLowerCase()), true)))
    .slice(0, 3);
}

export type PosterOverrides = Partial<Pick<PosterBrief, "name" | "claim" | "price" | "location" | "heroUrl" | "focal" | "ink">> & { mode?: FilmMode };

export function buildPosterBrief(analysis: SiteAnalysis, overrides: PosterOverrides = {}): PosterBrief {
  const name = clean(overrides.name || analysis.brandProfile?.name || analysis.brand);
  const pageUrl = analysis.canonicalUrl || analysis.source?.finalUrl || analysis.url;
  const claim = trimOnWord(overrides.claim ?? claimCandidates(analysis)[0] ?? name, CLAIM_MAX);
  const palette = [...new Set([...analysis.colors, ...(analysis.brandProfile?.colors ?? [])])].slice(0, 5);
  return {
    name,
    claim,
    price: clean(overrides.price) || (overrides.price === undefined ? extractPrice(analysis.visibleText) : undefined),
    location: clean(overrides.location) || undefined,
    palette,
    ink: overrides.ink,
    logoUrl: analysis.logoCandidates?.[0] || analysis.faviconUrl || undefined,
    heroUrl: overrides.heroUrl === "" ? undefined : overrides.heroUrl ?? heroCandidates(analysis)[0],
    category: analysis.brandProfile?.category,
    host: hostOf(pageUrl),
    steps: stepLines(analysis, claim),
    focal: overrides.focal,
    docsHint: isDocsPath(pageUrl) || overrides.mode === "instruction",
    mock: analysis.source?.mode === "mock",
  };
}
