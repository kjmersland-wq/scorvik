// A page's "feel" as music: moods, genres and energy. From Claude when available, otherwise read from what the page is about.
import type { FilmMode, MusicProfile, SiteAnalysis } from "@/types/project";

export const profileMoods = ["Warm", "Bold", "Calm", "Energetic", "Cinematic", "Playful", "Elegant", "Emotional", "Modern", "Nostalgic", "Adventurous", "Authentic", "Blues", "Bright", "Drive", "Quiet"];
export const profileGenres = ["Blues", "Jazz", "Rock", "Electronic", "Acoustic / Folk", "Cinematic", "Soul / R&B", "World", "Orchestral", "Hip-Hop"];

const topics: Array<{ test: RegExp; profile: MusicProfile }> = [
  { test: /\bblues\b|delta|juke ?joint|slide guitar/, profile: { moods: ["Blues", "Warm", "Authentic"], genres: ["Blues", "Jazz"], energy: 5, reason: "A blues page calls for blues", source: "topic" } },
  { test: /toll|vignette|road trip|roadtrip|motorhome|camper|bobil|bompenger|ferry|ferje|campervan|touring|adventure|eventyr/, profile: { moods: ["Adventurous", "Bright", "Warm"], genres: ["World", "Acoustic / Folk", "Cinematic"], energy: 6, reason: "Travel and the open road feel adventurous and bright", source: "topic" } },
  { test: /restaurant|cafe|kafé|coffee|kaffe|menu|meny|bakery|bakeri|dinner|middag|chef|kokk/, profile: { moods: ["Warm", "Playful"], genres: ["Jazz", "Acoustic / Folk"], energy: 4, reason: "Food and hospitality sound warm and relaxed", source: "topic" } },
  { test: /fitness|gym|trening|workout|sport|running|løping|energy drink/, profile: { moods: ["Energetic", "Bold"], genres: ["Electronic", "Rock"], energy: 8, reason: "Training needs drive", source: "topic" } },
  { test: /hotel|hotell|spa\b|luxury|luksus|boutique|jewel|smykke|fashion|mote/, profile: { moods: ["Elegant", "Calm"], genres: ["Jazz", "Orchestral", "Cinematic"], energy: 3, reason: "Refined brands sound elegant and unhurried", source: "topic" } },
  { test: /software|saas|\bapp\b|platform|plattform|dashboard|\bapi\b|automation|ai\b|startup/, profile: { moods: ["Modern", "Calm"], genres: ["Electronic", "Cinematic"], energy: 5, reason: "Software sounds clear, modern and steady", source: "topic" } },
  { test: /kids|barn|toy|leker|game|spill/, profile: { moods: ["Playful", "Bright"], genres: ["Acoustic / Folk", "Electronic"], energy: 7, reason: "Playful audiences like bright, bouncy music", source: "topic" } },
];

export function topicProfile(analysis: SiteAnalysis, mode: FilmMode): MusicProfile {
  const text = `${analysis.title} ${analysis.description} ${(analysis.headings ?? []).join(" ")} ${(analysis.visibleText ?? "").slice(0, 3000)}`.toLowerCase();
  const found = topics.find((topic) => topic.test.test(text))?.profile ?? { moods: ["Modern", "Warm"], genres: ["Cinematic", "Electronic"], energy: 5, reason: "A balanced, modern sound", source: "topic" as const };
  // guides want music that stays out of the way
  return mode === "instruction" ? { ...found, moods: [...new Set(["Calm", ...found.moods])], energy: Math.max(2, found.energy - 2) } : found;
}

export function resolveProfile(analysis: SiteAnalysis, mode: FilmMode): MusicProfile {
  return analysis.musicProfile ?? topicProfile(analysis, mode);
}

/** Cleans a profile that came from a model: known moods and genres only, sensible energy. */
export function sanitizeProfile(raw: unknown): MusicProfile | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as { moods?: unknown; genres?: unknown; energy?: unknown; reason?: unknown };
  const pick = (list: unknown, allowed: string[]) => (Array.isArray(list) ? list.filter((item): item is string => typeof item === "string" && allowed.includes(item)).slice(0, 3) : []);
  const moods = pick(value.moods, profileMoods);
  const genres = pick(value.genres, profileGenres);
  const energy = typeof value.energy === "number" ? Math.max(1, Math.min(10, Math.round(value.energy))) : undefined;
  if (!moods.length || !genres.length || energy === undefined) return undefined;
  return { moods, genres, energy, reason: typeof value.reason === "string" ? value.reason.slice(0, 160) : "", source: "ai" };
}
