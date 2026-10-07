// Server-side helper that asks Claude to polish or translate on-screen text, with a strict fact guard:
// the model may rephrase and shorten, but it may not introduce numbers or names that are not in the source.

export interface CopyScene {
  id: string;
  purpose: string;
  headline: string;
  supportingText: string;
  /** locked scenes (opening/closing questions) are returned unchanged when polishing */
  locked?: boolean;
}

export const copyLanguages: Record<string, string> = {
  no: "Norwegian (Bokmål)",
  en: "English",
  sv: "Swedish",
  da: "Danish",
  de: "German",
  es: "Spanish",
};

const defaultModel = "claude-haiku-4-5-20251001";
const headlineLimit = 70;
const supportLimit = 120;

function words(text: string): string[] {
  return text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];
}

function numbers(text: string): string[] {
  return (text.match(/\d[\d\s.,]*\d|\d/g) ?? []).map((value) => value.replace(/[\s.,]/g, ""));
}

/** True when `output` adds no number and no capitalised mid-sentence name that `source` doesn't contain. */
export function passesFactGuard(output: string, source: string): boolean {
  const haystack = source.toLowerCase();
  const sourceDigits = new Set(numbers(source));
  if (numbers(output).some((value) => !sourceDigits.has(value))) return false;
  const sentences = output.split(/(?<=[.!?…])\s+/);
  for (const sentence of sentences) {
    const tokens = words(sentence);
    for (const [index, token] of tokens.entries()) {
      if (index === 0 || token.length < 3) continue;
      if (/^\p{Lu}/u.test(token) && !/^\p{Lu}+$/u.test(token) && !haystack.includes(token.toLowerCase())) return false;
    }
  }
  return true;
}

export function validateScenes(output: unknown, input: CopyScene[], source: string, translate: boolean): CopyScene[] | undefined {
  if (!Array.isArray(output)) return undefined;
  const byId = new Map<string, { headline?: unknown; supportingText?: unknown }>();
  for (const item of output) {
    if (item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string") byId.set((item as { id: string }).id, item as { headline?: unknown; supportingText?: unknown });
  }
  const sceneSource = [source, ...input.flatMap((scene) => [scene.headline, scene.supportingText])].join(" ");
  return input.map((scene) => {
    const next = byId.get(scene.id);
    if (!next || (scene.locked && !translate)) return scene;
    const headline = typeof next.headline === "string" ? next.headline.trim() : "";
    const supportingText = typeof next.supportingText === "string" ? next.supportingText.trim() : "";
    const acceptable = headline && headline.length <= headlineLimit && supportingText.length <= supportLimit
      && (translate ? numbers(`${headline} ${supportingText}`).every((value) => numbers(`${scene.headline} ${scene.supportingText}`).includes(value))
        : passesFactGuard(`${headline} ${supportingText}`, sceneSource));
    return acceptable ? { ...scene, headline, supportingText } : scene;
  });
}

async function askClaude(system: string, user: string): Promise<string | undefined> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return undefined;
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || defaultModel, max_tokens: 2000, system, messages: [{ role: "user", content: user }] }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) {
    const detail = await response.json().then((body: { error?: { message?: string } }) => body.error?.message ?? "").catch(() => "");
    throw new Error(`Claude ${response.status}: ${detail}`.slice(0, 240));
  }
  const data = await response.json() as { content?: Array<{ type: string; text?: string }> };
  return data.content?.find((part) => part.type === "text")?.text;
}

function parseJsonArray(text: string | undefined): unknown {
  if (!text) return undefined;
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return undefined;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return undefined; }
}

export function copyAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export type CopyTone = "warm" | "bluesy" | "playful" | "elegant";
export const copyTones: CopyTone[] = ["warm", "bluesy", "playful", "elegant"];

/** Picks a tone from the site itself when the user hasn't chosen one. */
export function detectTone(text: string): CopyTone {
  return /\bblues\b/i.test(text) ? "bluesy" : "warm";
}

const toneNotes: Record<CopyTone, string> = {
  warm: "Warm and personal, like a friendly person who genuinely wants to help.",
  bluesy: "A touch of blues: unhurried, soulful, with a storyteller's cadence and a little worn-in warmth, like a good evening on the porch. Light imagery (a slow song, strings, the road home) is welcome only where it fits the facts. Blues here means soul and heart, never sadness or complaint. Keep it positive and don't overdo it.",
  playful: "Light, smiling and a little cheeky, but still kind and clear.",
  elegant: "Calm, refined and understated, with plenty of space between the words.",
};

function polishSystem(tone: CopyTone): string {
  return `You write the on-screen text for short website films. It must never sound like AI or like an advert: it should sound like one real person talking to another.
Voice: personal, warm and positive, always. Speak directly to the viewer (natural "du"/"dere" in Norwegian, "you" in English). ${toneNotes[tone]}
Style rules:
- Short, concrete sentences with a natural rhythm. Everyday words. Say what it feels like, not what it "enables".
- Positive framing: lead with what the viewer gains or enjoys.
- Avoid AI and marketing clichés: "unlock", "elevate", "seamless", "leverage", "game-changer", "revolutionary", "in today's world", "whether you're", "dive into", "journey", stacked triplets, and long dash-chains. No exclamation marks, no emoji, no hashtags.
- In Norwegian use natural bokmål that reads as written by a person, not translated.
Fact rules:
- Use ONLY facts found in the SOURCE. Never invent numbers, prices, names, awards, guarantees, results or claims.
- One idea per scene. Headline at most 8 words. Supporting line at most 16 words, or empty.
- Keep the language of the source text.
- Scenes marked locked:true must be returned exactly as given.
- Return ONLY a JSON array of {"id","headline","supportingText"} for every scene, same ids, same order.`;
}

export async function polishScenes(brand: string, source: string, scenes: CopyScene[], tone: CopyTone = "warm"): Promise<CopyScene[] | undefined> {
  const answer = await askClaude(polishSystem(tone), `BRAND: ${brand}\nSOURCE:\n${source.slice(0, 4000)}\n\nSCENES:\n${JSON.stringify(scenes)}`);
  const parsed = validateScenes(parseJsonArray(answer), scenes, `${brand} ${source}`, false);
  if (!parsed) throw new Error("Claude answered in an unexpected format.");
  return parsed;
}

export async function translateScenes(language: string, scenes: CopyScene[], tone: CopyTone = "warm"): Promise<CopyScene[] | undefined> {
  const target = copyLanguages[language];
  if (!target) return undefined;
  const system = `You translate on-screen film text into ${target}. Keep the meaning and length, and keep the voice personal, warm and positive, never like a machine translation (${toneNotes[tone]}); keep brand names and numbers exactly as written. Do not add or remove claims. Return ONLY a JSON array of {"id","headline","supportingText"} with the same ids and order. Headlines at most ${headlineLimit} characters.`;
  const answer = await askClaude(system, JSON.stringify(scenes.map(({ id, headline, supportingText }) => ({ id, headline, supportingText }))));
  const parsed = validateScenes(parseJsonArray(answer), scenes, "", true);
  if (!parsed) throw new Error("Claude answered in an unexpected format.");
  return parsed;
}
