// Caption craft: short, punchy on-screen text and the words worth emphasising.
import { countWords } from "./timing.ts";

const stopwords: Record<"no" | "en", Set<string>> = {
  en: new Set("the and for with from that this your you are was were have has had not but all any can will our their they them its into over under about more most than then just also very what when where which who how why out off too own per via".split(" ")),
  no: new Set("og i jeg det at en et den til er som på de har av med han for ikke var meg seg men sin sitt vi du dere deg oss man kan skal vil hva når hvor hvem hvordan fra om ut inn opp ned over under etter før også bare mer mest enn så da her der denne dette disse eller hos ved".split(" ")),
};

const trailing = /[\s,;:–—-]+$/;

/** Emoji and pictographs look off in film titles; drop them and tidy the spaces. */
export function stripEmoji(text: string): string {
  return text.replace(/[\p{Extended_Pictographic}\u200d\ufe0f]/gu, "").replace(/\s+/g, " ").trim();
}

/** Footer, legal and credit lines are not story material. */
export const footerNoise = /©|all rights reserved|privacy|cookies?\b|terms (of|and)|a product by|powered by|made (with|by)|built (with|by)|alle rettigheter|personvern|vilkår|informasjonskapsler|disclaimer|indicative|estimates only|for informational purposes|verify with official|uforpliktende|kun veiledende/i;

/** Cuts text to at most `maxWords` words, preferring a sentence or clause boundary over a hard cut. */
export function condenseCaption(text: string, maxWords: number): string {
  const clean = stripEmoji(text);
  if (countWords(clean) <= maxWords) return clean;
  const words = clean.split(" ");
  const head = words.slice(0, maxWords).join(" ");
  const sentenceEnd = Math.max(head.lastIndexOf(". "), head.lastIndexOf("? "), head.lastIndexOf("! "));
  if (sentenceEnd > 0 && countWords(head.slice(0, sentenceEnd + 1)) >= Math.min(3, maxWords)) return head.slice(0, sentenceEnd + 1);
  const clauseEnd = Math.max(head.lastIndexOf(", "), head.lastIndexOf("; "), head.lastIndexOf(": "), head.lastIndexOf(" – "), head.lastIndexOf(" — "));
  const cut = clauseEnd > head.length * 0.5 ? head.slice(0, clauseEnd) : head;
  let result = cut.replace(trailing, "");
  // never end on a dangling little word ("and", "of", "til")
  const parts = result.split(" ");
  while (parts.length > 2 && (stopwords.en.has(parts[parts.length - 1].toLowerCase()) || stopwords.no.has(parts[parts.length - 1].toLowerCase()))) parts.pop();
  result = parts.join(" ").replace(trailing, "");
  return /[.!?…]$/.test(result) ? result : `${result}…`;
}

/** Up to `max` words that carry the message: numbers first, then names, then the longest meaningful words. */
export function highlightKeywords(text: string, language: "no" | "en", max = 2): string[] {
  const tokens = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];
  const stop = stopwords[language];
  const scored = tokens.map((token, index) => {
    const lower = token.toLowerCase();
    if (stop.has(lower) || token.length < 3) return { token, score: -1, index };
    let score = token.length;
    if (/\d/.test(token)) score += 20;
    else if (index > 0 && /^\p{Lu}/u.test(token) && !/^\p{Lu}+$/u.test(token)) score += 10;
    return { token, score, index };
  }).filter((item) => item.score >= 5);
  const picked = scored.sort((left, right) => right.score - left.score || left.index - right.index).slice(0, max);
  return picked.sort((left, right) => left.index - right.index).map((item) => item.token);
}

/** Brand colour that reads on a dark card: bright enough, clearly coloured. Falls back to warm gold. */
export function pickAccent(colors: string[] | undefined): string {
  for (const value of colors ?? []) {
    const match = value.trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i);
    if (!match) continue;
    const hex = match[1].length === 3 ? match[1].split("").map((c) => c + c).join("") : match[1];
    const [r, g, b] = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (luminance > 0.35 && luminance < 0.9 && max - min > 0.25) return `#${hex}`;
  }
  return "#f3c767";
}
