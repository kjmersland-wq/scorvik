// Scorvik's copy voice: calm, curious and message-first. Scenes carry one idea each, openings and closings
// are phrased as soft questions instead of claims, and nothing is invented beyond what the website says.

export type VoiceLanguage = "no" | "en";

const variants = {
  no: {
    intro: [
      (n: number) => `Hva om det bare tok ${n} enkle steg?`,
      (n: number) => `Tenk om det kunne gå på ${n} steg?`,
      (n: number) => `Hvor enkelt kan det bli? ${n} steg.`,
    ],
    close: ["Høres det riktig ut for deg?", "Er dette noe for deg?", "Passer dette for deg?"],
  },
  en: {
    intro: [
      (n: number) => `What if it only took ${n} simple steps?`,
      (n: number) => `Imagine getting there in ${n} steps.`,
      (n: number) => `How simple can it get? ${n} steps.`,
    ],
    close: ["Does that sound right for you?", "Is this something for you?", "Does this fit what you need?"],
  },
} as const;

// Stable per brand, so a film keeps its wording between renders but different brands don't all sound alike.
function pick<T>(items: readonly T[], seed: string): T {
  let hash = 0;
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return items[hash % items.length];
}

export function introQuestion(language: VoiceLanguage, steps: number, seed: string): string {
  return pick(variants[language].intro, seed)(steps);
}

export function closingQuestion(language: VoiceLanguage, seed: string): string {
  return pick(variants[language].close, seed);
}

/**
 * Keeps a scene on one message: a long headline is cut at its first natural clause and the remainder
 * becomes the supporting line (if there isn't one already) rather than being lost.
 */
export function focusHeadline(headline: string, limit = 64): { headline: string; rest: string } {
  const text = headline.trim().replace(/\s+/g, " ");
  if (text.length <= limit) return { headline: text, rest: "" };
  for (const pattern of [/^(.{12,}?)(?:\s*[:–—;]\s+|\s+-\s+)(.+)$/, /^(.{12,}?)(?:,\s+|\.\s+)(.+)$/]) {
    const match = text.match(pattern);
    if (match && match[1].length <= limit) return { headline: match[1].replace(/[.,;:]$/, ""), rest: match[2] };
  }
  return { headline: text, rest: "" };
}
