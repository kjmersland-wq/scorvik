// Decides which scenes are better drawn than photographed. Only the scene's own words are used: a choice scene needs a real
// "A, B or C" list in the text, a route scene a real "from X to Y". Nothing is invented.
import type { SceneGraphic } from "@/types/project";

const words = (value: string) => value.trim().split(/\s+/).filter(Boolean);
const tidy = (value: string) => value.trim().replace(/^[\s"'«»]+|[\s"'«»]+$/gu, "").replace(/[\s.!?…:;]+$/u, "");
const cap = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

const routePattern = /\b(fra|from)\s+([\p{L}][\p{L}'’ -]{1,23}?)\s+(til|to)\s+([\p{L}][\p{L}'’ -]{1,23}?)(?=$|[,.!?;:]|\s+(?:og|and|med|with|via|in|på|i)\b)/iu;

function detectRoute(text: string): SceneGraphic | undefined {
  const match = routePattern.exec(text);
  if (!match) return undefined;
  const from = tidy(match[2]);
  const to = tidy(match[4]);
  if (!from || !to || from.toLowerCase() === to.toLowerCase() || words(from).length > 3 || words(to).length > 3) return undefined;
  const norwegian = match[1].toLowerCase() === "fra";
  return { kind: "route", from: cap(from), to: cap(to), fromLabel: norwegian ? "Fra" : "From", toLabel: norwegian ? "Til" : "To" };
}

// "Car, motorhome or motorcycle": 2-5 short items joined by or/eller (a plain comma list is too easily an ordinary sentence).
function detectChoices(text: string): SceneGraphic | undefined {
  const cue = /\s(?:eller|or)\s|\s\/\s/iu;
  if (!cue.test(text)) return undefined;
  const items = text.split(/\s*,\s*|\s+(?:eller|or)\s+|\s+\/\s+/iu).map(tidy).filter(Boolean);
  if (items.length < 2 || items.length > 5) return undefined;
  if (items.some((item) => words(item).length > 2 || item.length > 22)) return undefined;
  if (new Set(items.map((item) => item.toLowerCase())).size !== items.length) return undefined;
  return { kind: "choices", items: items.map(cap), selected: 0 };
}

export function detectGraphic(headline: string, supportingText = ""): SceneGraphic | undefined {
  const whole = `${headline}. ${supportingText}`;
  return detectRoute(whole) ?? detectChoices(tidy(headline)) ?? (supportingText ? detectChoices(tidy(supportingText)) : undefined);
}
