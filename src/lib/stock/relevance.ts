// How well does a stock result match what the scene asked for? Libraries rank by their own popularity, so a search for
// "highway toll road" can still return a snowy forest. Words in the result's own tags or title are the best evidence we get.

const stop = new Set(["the", "and", "for", "with", "from", "into", "over", "close", "view", "shot", "photo", "video", "stock"]);

export function queryWords(query: string): string[] {
  return [...new Set(query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= 3 && !stop.has(word)))];
}

const stem = (word: string) => word.replace(/(ing|ies|es|s)$/u, "").replace(/[ey]$/u, "");

/** 0..1: the share of the query's words that appear in the result's text. null when the result carries no text to judge by. */
export function relevanceOf(query: string, text: string | undefined): number | null {
  if (!text || !text.trim()) return null;
  const words = queryWords(query);
  if (!words.length) return null;
  const haystack = text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(stem);
  const hits = words.filter((word) => haystack.includes(stem(word))).length;
  return hits / words.length;
}

/** Adds a relevance bonus to the library score, and a penalty when the text names none of the query's words. */
export function scoreWithRelevance(score: number, query: string, text: string | undefined): number {
  const relevance = relevanceOf(query, text);
  if (relevance === null) return score;
  return relevance === 0 ? score - 35 : score + Math.round(relevance * 30);
}

/** Shorter fallbacks for a query that found nothing good: the full phrase, its last two words, its first word. */
export function queryLadder(query: string): string[] {
  const words = query.trim().split(/\s+/).filter(Boolean);
  const rungs = [words.join(" "), words.slice(-2).join(" "), words.slice(0, 1).join(" ")];
  return [...new Set(rungs.filter((rung) => rung.length >= 3))];
}
