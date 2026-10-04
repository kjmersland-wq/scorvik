import type { CreativeBrief, FilmMode, MusicTrack, SiteAnalysis } from "@/types/project";
import { musicTaxonomy } from "./taxonomy.ts";

export const localMusicFiles = [
  "blues-60-ad.mp3",
  "blues-60-ad-2.mp3",
  "blues-65-ad.mp3",
  "blues-65-ad-2.mp3",
  "bright-82-ad.mp3",
  "drive-120-ad.mp3",
  "modern-92-ad.mp3",
  "playful-108-ad.mp3",
  "playful-108-ad-2.mp3",
  "playful-116-ad.mp3",
  "calm-84-guide.mp3",
  "quiet-72-guide.mp3",
  "quiet-72-guide-2.mp3",
  "quiet-78-guide.mp3",
  "modern-110-guide.mp3",
  "modern-110-guide-2.mp3",
  "modern-110-guide-3.mp3",
  "warm-104-ad.mp3",
  "warm-108-ad.mp3",
] as const;

const durationByFile: Record<(typeof localMusicFiles)[number], number> = {
  "blues-60-ad.mp3": 121,
  "blues-60-ad-2.mp3": 121,
  "blues-65-ad.mp3": 63,
  "blues-65-ad-2.mp3": 164,
  "bright-82-ad.mp3": 63,
  "drive-120-ad.mp3": 70,
  "modern-92-ad.mp3": 148,
  "playful-108-ad.mp3": 162,
  "playful-108-ad-2.mp3": 163,
  "playful-116-ad.mp3": 61,
  "calm-84-guide.mp3": 89,
  "quiet-72-guide.mp3": 177,
  "quiet-72-guide-2.mp3": 177,
  "quiet-78-guide.mp3": 63,
  "modern-110-guide.mp3": 63,
  "modern-110-guide-2.mp3": 60,
  "modern-110-guide-3.mp3": 63,
  "warm-104-ad.mp3": 62,
  "warm-108-ad.mp3": 68,
};

const genreByMood: Record<string, string> = {
  blues: "Blues",
  bright: "Soul / R&B",
  calm: "Cinematic",
  drive: "Rock",
  modern: "Electronic",
  playful: "Soul / R&B",
  quiet: "Cinematic",
  warm: "Acoustic / Folk",
};

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function trackFromFilename(filename: (typeof localMusicFiles)[number]): MusicTrack {
  const match = filename.match(/^([a-z]+)-(\d+)-(ad|guide)(?:-(\d+))?\.mp3$/);
  if (!match) throw new Error(`Invalid local music filename: ${filename}`);
  const [, mood, tempo, usageToken, version] = match;
  const usage: "ad" | "guide" = usageToken === "guide" ? "guide" : "ad";
  const moodLabel = titleCase(mood);
  const usageLabel = usage === "ad" ? "Ad" : "Guide";
  const path = `/music/${filename}`;
  return {
    id: filename.replace(/\.mp3$/, ""),
    title: `${moodLabel} ${tempo} ${usageLabel}${version ? ` ${version}` : ""}`,
    artist: "SCORVIK",
    source: "Local SCORVIK music",
    sourceUrl: path,
    audioUrl: path,
    duration: durationByFile[filename],
    genre: genreByMood[mood],
    subgenre: moodLabel,
    style: [moodLabel],
    mood: [moodLabel],
    energy: Math.max(1, Math.min(10, Math.round(Number(tempo) / 14))),
    tempoBpm: Number(tempo),
    instrumentation: [],
    era: "Contemporary",
    vocals: false,
    instrumental: true,
    useCases: [usageLabel],
    usage,
    brandFit: [],
    commercialUse: true,
    allowedPlatforms: ["youtube", "instagram", "tiktok", "facebook", "web"],
    licenseType: "SCORVIK-owned royalty-free",
    attributionRequired: false,
    licenseUrl: "",
    downloadedAt: null,
    licenseCheckedAt: null,
  };
}

export const demoMusicCatalog: MusicTrack[] = localMusicFiles.map(trackFromFilename);

export interface MusicRecommendationInput {
  analysis: SiteAnalysis;
  brief: CreativeBrief;
  duration: number;
  platform: string;
  mode?: FilmMode;
  userMoods?: string[];
  genrePreference?: string | null;
  style?: string;
}

export interface RankedMusicTrack {
  track: MusicTrack;
  alternatives: MusicTrack[];
  score: number;
  matchReasons: string[];
  licenseWarning: string;
}

export function isClearedRoyaltyFreeTrack(track: MusicTrack, platform: string): boolean {
  return track.commercialUse
    && Boolean(track.audioUrl?.startsWith("/music/"))
    && localMusicFiles.some((filename) => track.audioUrl === `/music/${filename}`)
    && track.licenseType === "SCORVIK-owned royalty-free"
    && track.allowedPlatforms.includes(platform);
}

function suggestedGenres(category: string, brief: CreativeBrief): string[] {
  const text = `${brief.tone.join(" ")} ${brief.suggestedMusicDirection}`.toLowerCase();
  if (category === "restaurant" || category === "travel") return /premium|elegant|sophisticated/.test(text) ? ["Jazz", "Cinematic", "Acoustic / Folk"] : ["Acoustic / Folk", "Soul / R&B", "Jazz"];
  if (category === "saas") return ["Electronic", "Cinematic", "Orchestral"];
  if (category === "ecommerce") return /authentic|vintage/.test(text) ? ["Blues", "Soul / R&B", "Acoustic / Folk"] : ["Soul / R&B", "Electronic", "Acoustic / Folk"];
  return ["Cinematic", "Acoustic / Folk", "Electronic"];
}

function scoreTrack(track: MusicTrack, input: MusicRecommendationInput, inferredGenres: string[]) {
  const reasons: string[] = [];
  const moodWords = `${input.brief.tone.join(" ")} ${input.brief.suggestedMusicDirection}`.toLowerCase();
  const moodAliases: Record<string, RegExp> = {
    Blues: /blues|authentic|soul|roots/,
    Bright: /bright|energetic|upbeat|playful/,
    Drive: /drive|energetic|powerful|rock/,
    Modern: /modern|confident|clean|electronic/,
    Playful: /playful|fun|lively|bright/,
    Quiet: /quiet|calm|measured|gentle|cinematic/,
    Calm: /calm|quiet|gentle|measured|soft/,
    Warm: /warm|considered|organic|human/,
  };
  let score = moodAliases[track.mood[0]]?.test(moodWords) ? 12 : 0;
  if (score) reasons.push(`${track.mood[0]} mood matches the brief`);
  if (inferredGenres.includes(track.genre)) { score += 6; reasons.push("Genre fits the brand tone"); }
  if (input.style && track.style.some((style) => style.toLowerCase().includes(input.style!.toLowerCase()))) score += 2;
  const targetTempo = input.brief.suggestedPacing === "fast" ? 116 : input.brief.suggestedPacing === "measured" ? 78 : 100;
  const tempoFit = Math.max(0, 8 - Math.round(Math.abs(track.tempoBpm - targetTempo) / 5));
  score += tempoFit;
  reasons.push(`${track.tempoBpm} BPM matches the suggested pace`);
  const durationFit = 1 - Math.min(Math.abs(track.duration - input.duration) / Math.max(input.duration, 1), 1);
  score += Math.round(durationFit * 5);
  if (durationFit > 0.8) reasons.push("Track length fits the film");
  return { score, reasons };
}

export function recommendMusic(input: MusicRecommendationInput, catalog: MusicTrack[] = demoMusicCatalog): RankedMusicTrack[] {
  const category = input.analysis.brandProfile?.category ?? "other";
  const inferred = suggestedGenres(category, input.brief);
  const requestedUsage = input.mode === "instruction" ? "guide" : "ad";
  const eligible = catalog
    .filter((track) => isClearedRoyaltyFreeTrack(track, input.platform))
    .filter((track) => track.usage === requestedUsage)
    .filter((track) => !input.genrePreference || track.genre === input.genrePreference || track.subgenre === input.genrePreference)
    .map((track) => ({ ...scoreTrack(track, input, inferred), track }))
    .sort((left, right) => right.score - left.score || left.track.id.localeCompare(right.track.id));

  const grouped = new Map<string, RankedMusicTrack>();
  for (const candidate of eligible) {
    const key = `${candidate.track.usage}:${candidate.track.mood[0].toLowerCase()}`;
    const current = grouped.get(key);
    if (current) current.alternatives.push(candidate.track);
    else grouped.set(key, { track: candidate.track, alternatives: [], score: candidate.score, matchReasons: candidate.reasons, licenseWarning: "SCORVIK-owned royalty-free track." });
  }
  return [...grouped.values()].sort((left, right) => right.score - left.score || left.track.id.localeCompare(right.track.id));
}