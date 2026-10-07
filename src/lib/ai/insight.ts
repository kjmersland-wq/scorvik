// One Claude call that reads the page like a creative director: which messages are worth a scene, and what the music should feel like.
import { passesFactGuard, askClaude, copyAvailable } from "./copy-llm.ts";
import { profileGenres, profileMoods, sanitizeProfile } from "../music/profile.ts";
import type { MusicProfile } from "@/types/project";

export interface Insight {
  keyPoints: Array<{ text: string; strength: number }>;
  music?: MusicProfile;
}

/** Keeps only points that stay inside the source: no numbers or names the page doesn't contain. */
export function validateInsight(raw: unknown, source: string): Insight | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as { keyPoints?: unknown; music?: unknown };
  const points = Array.isArray(value.keyPoints) ? value.keyPoints : [];
  const keyPoints = points.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const { text, strength } = item as { text?: unknown; strength?: unknown };
    if (typeof text !== "string" || text.trim().length < 6 || text.length > 140) return [];
    if (!passesFactGuard(text, source)) return [];
    return [{ text: text.trim(), strength: typeof strength === "number" ? Math.max(1, Math.min(5, Math.round(strength))) : 3 }];
  }).slice(0, 10);
  const music = sanitizeProfile(value.music);
  return keyPoints.length || music ? { keyPoints, music } : undefined;
}

const system = `You are a creative director planning a short website film with on-screen text and music only.
Read the SOURCE and return ONLY a JSON object:
{"keyPoints":[{"text":"...","strength":1-5}],"music":{"moods":[...],"genres":[...],"energy":1-10,"reason":"..."}}
keyPoints: up to 10 DISTINCT messages from the page that would most make a visitor care (concrete features, outcomes, proof), strongest first. Each at most 12 words, in the language of the source. Use only facts that are in the SOURCE; never invent numbers, names, prices or claims. Split long feature lists into separate points where each item is worth showing. Skip navigation, legal text and generic filler.
strength: 5 = would make someone stop scrolling, 1 = filler.
music: choose the background track feel. moods from: ${profileMoods.join(", ")}. genres from: ${profileGenres.join(", ")}. energy: 1 very calm to 10 intense. reason: one short sentence.`;

export async function askInsight(brand: string, source: string, mode: "advert" | "instruction"): Promise<Insight | undefined> {
  if (!copyAvailable()) return undefined;
  const answer = await askClaude(system, `FILM TYPE: ${mode === "instruction" ? "instructional guide" : "promo"}\nBRAND: ${brand}\nSOURCE:\n${source.slice(0, 6000)}`);
  if (!answer) return undefined;
  const start = answer.indexOf("{");
  const end = answer.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try { return validateInsight(JSON.parse(answer.slice(start, end + 1)), `${brand} ${source}`); } catch { return undefined; }
}
