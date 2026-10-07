// Decides whether a page sells (promo film) or teaches (instructional film), so Scorvik can suggest the right format.
import type { FilmMode, SiteAnalysis } from "@/types/project";

export interface IntentResult {
  intent: FilmMode;
  /** 0..1 */
  confidence: number;
  reasons: string[];
}

const teaches = /\b(how to|how-to|guide|tutorial|documentation|docs|walkthrough|getting started|step[- ]by[- ]step|steg for steg|slik gjør du|veiledning|kom i gang|oppskrift|instruksjon|manual)\b|\b(step|steg)\s*\d/i;
const sells = /\b(buy|shop|pricing|price|order|book(ing)?|free trial|sign up|subscribe|demo|get started free|kjøp|bestill|pris|priser|gratis|prøv|abonnement|tilbud|rabatt|bli med)\b|\d[\d\s.,]*\s?(kr|nok|usd|eur)\b|[$€£]\s?\d/i;

export function classifyIntent(analysis: SiteAnalysis): IntentResult {
  const headlines = [analysis.title, analysis.description, ...(analysis.headings ?? []), ...(analysis.subheadings ?? [])].join(" ");
  const actions = [...(analysis.callsToAction ?? []), ...(analysis.buttons ?? [])].join(" ");
  const reasons: string[] = [];
  let teach = 0;
  let sell = 0;
  if ((analysis.steps?.length ?? 0) >= 3) { teach += 2; reasons.push("The page lists ordered steps"); }
  if (teaches.test(headlines)) { teach += 2; reasons.push("Headings talk about guides or how-to"); }
  if (teaches.test(analysis.visibleText ?? "")) teach += 1;
  if (sells.test(actions)) { sell += 2; reasons.push("Buttons ask for a purchase, trial or booking"); }
  if (sells.test(headlines)) { sell += 1; reasons.push("Headings mention offers or prices"); }
  if (sells.test(analysis.visibleText ?? "")) sell += 1;
  if ((analysis.proofPoints?.length ?? 0) > 0) sell += 1;
  const intent: FilmMode = teach > sell + 1 ? "instruction" : "advert";
  const total = teach + sell || 1;
  return { intent, confidence: Math.round((Math.max(teach, sell) / total) * 100) / 100, reasons };
}
