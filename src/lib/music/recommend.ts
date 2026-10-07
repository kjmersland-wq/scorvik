import { pixabayMusic } from "./pixabay-library.ts";
import type { CreativeBrief, FilmMode, MusicTrack, SiteAnalysis } from "@/types/project";

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
    source: "Scorvik Original Music",
    sourceType: "scorvik-original",
    sourceUrl: path,
    audioUrl: path,
    duration: durationByFile[filename],
    genre: genreByMood[mood],
    subgenre: moodLabel,
    style: [moodLabel],
    mood: [moodLabel],
    tags: [moodLabel, genreByMood[mood], usageLabel],
    energy: Math.max(1, Math.min(10, Math.round(Number(tempo) / 14))),
    tempoBpm: Number(tempo),
    instrumentation: [],
    era: "Contemporary",
    vocals: false,
    instrumental: true,
    useCases: [usageLabel],
    usage,
    voiceoverSuitable: true,
    language: null,
    brandFit: [],
    commercialUse: true,
    allowedPlatforms: ["youtube", "instagram", "facebook", "tiktok", "square-social"],
    licenseType: "Owner-created with Suno Pro; commercial use included in the plan",
    metadataStatus: "verified",
    attributionRequired: false,
    licenseUrl: "https://suno.com/terms",
    downloadedAt: null,
    licenseCheckedAt: "2026-10-07",
  };
}

export const scorvikOriginalMusic: MusicTrack[] = localMusicFiles.map(trackFromFilename);
export const libraryMusic: MusicTrack[] = [...scorvikOriginalMusic, ...pixabayMusic];
export const demoMusicCatalog = libraryMusic;

export interface MusicRecommendationInput {
  analysis: SiteAnalysis;
  brief: CreativeBrief;
  duration: number;
  platform: string;
  mode?: FilmMode;
  userMoods?: string[];
  genrePreference?: string | null;
  style?: string;
  hasVoiceover?: boolean;
  language?: string;
  storyboard?: { scenes: Array<{ purpose: string; headline: string; supportingText: string; voiceover: string }> };
}

export interface MusicRankingOptions {
  originalTrackBonus?: number;
  strongMatchThreshold?: number;
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
    && track.metadataStatus === "verified"
    && Boolean(track.licenseUrl)
    && Boolean(track.licenseCheckedAt)
    && Boolean(track.audioUrl?.startsWith("/music/"))
    && track.allowedPlatforms.some((allowed) => platformsMatch(allowed, platform));
}

function platformsMatch(allowed: string, requested: string): boolean {
  const family = (platform: string) => platform.startsWith("youtube") ? "youtube"
    : platform.startsWith("instagram") ? "instagram"
      : platform.startsWith("facebook") ? "facebook"
        : platform;
  return allowed === requested || family(allowed) === family(requested);
}

function hasPreviewAsset(track: MusicTrack, platform: string): boolean {
  if (!track.audioUrl) return false;
  if (track.allowedPlatforms.length && !track.allowedPlatforms.some((allowed) => platformsMatch(allowed, platform))) return false;
  if (track.sourceType === "scorvik-original" || track.metadataStatus === "owner-supplied" || track.metadataStatus === "demo") {
    return localMusicFiles.some((filename) => track.audioUrl === `/music/${filename}`);
  }
  return isClearedRoyaltyFreeTrack(track, platform) || track.sourceType === "pixabay";
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
  const tags = `${track.mood.join(" ")} ${track.style.join(" ")} ${track.tags?.join(" ") ?? ""} ${track.subgenre} ${track.genre}`.toLowerCase();
  let score = moodAliases[track.mood[0]]?.test(moodWords) || track.mood.some((mood) => moodWords.includes(mood.toLowerCase())) ? 12 : 0;
  if (score) reasons.push(`${track.mood[0]} mood matches the brief`);
  const requestedMoods = input.userMoods?.map((mood) => mood.toLowerCase()) ?? [];
  if (requestedMoods.some((mood) => tags.includes(mood))) {
    score += 12;
    reasons.push("Matches the selected mood");
  }
  if (inferredGenres.some((genre) => tags.includes(genre.toLowerCase()))) { score += 6; reasons.push("Genre fits the brand tone"); }
  if (input.style && track.style.some((style) => style.toLowerCase().includes(input.style!.toLowerCase()))) score += 2;
  const targetTempo = input.brief.suggestedPacing === "fast" ? 116 : input.brief.suggestedPacing === "measured" ? 78 : 100;
  if (track.tempoBpm !== null && Number.isFinite(track.tempoBpm)) {
    const tempoFit = Math.max(0, 8 - Math.round(Math.abs(track.tempoBpm - targetTempo) / 5));
    score += tempoFit;
    reasons.push(`${track.tempoBpm} BPM is close to the suggested pace`);
  }
  const energyTarget = input.brief.suggestedPacing === "fast" ? 8 : input.brief.suggestedPacing === "measured" ? 3 : 5;
  if (track.energy !== null && Number.isFinite(track.energy)) score += Math.max(0, 5 - Math.abs(track.energy - energyTarget));
  if (input.storyboard) {
    const storyText = input.storyboard.scenes.map((scene) => `${scene.purpose} ${scene.headline} ${scene.supportingText}`).join(" ").toLowerCase();
    if (track.mood.some((mood) => storyText.includes(mood.toLowerCase()))) {
      score += 3;
      reasons.push("Tags relate to storyboard source language");
    }
  }
  if (input.mode !== "instruction" && input.brief.suggestedPacing === "fast" && track.energy !== null && track.energy >= 6) {
    score += 5;
    reasons.push("High-energy track for a fast-paced promo");
  }
  if (input.mode === "instruction" && ["Calm", "Quiet", "Warm"].includes(track.mood[0])) {
    score += 14;
    reasons.push("Calm music keeps attention on the steps");
  }
  if (input.hasVoiceover && track.vocals) {
    score -= 10;
    reasons.push("Instrumental options are preferred under voiceover");
  }
  if (input.hasVoiceover && track.voiceoverSuitable) {
    score += 3;
    reasons.push("Suitable under voiceover");
  }
  if (track.vocals && input.language && track.language && track.language.toLowerCase() === input.language.toLowerCase()) {
    score += 3;
    reasons.push("Vocal language matches the project");
  }
  const durationFit = 1 - Math.min(Math.abs(track.duration - input.duration) / Math.max(input.duration, 1), 1);
  score += Math.round(durationFit * 5);
  if (durationFit > 0.8) reasons.push("Track length fits the film");
  return { score, reasons };
}

export function recommendMusic(
  input: MusicRecommendationInput,
  catalog: MusicTrack[] = libraryMusic,
  options: MusicRankingOptions = {},
): RankedMusicTrack[] {
  const category = input.analysis.brandProfile?.category ?? "other";
  const inferred = suggestedGenres(category, input.brief);
  const requestedUsage = input.mode === "instruction" ? "guide" : "ad";
  const originalTrackBonus = Math.max(0, options.originalTrackBonus ?? 6);
  const strongMatchThreshold = options.strongMatchThreshold ?? 25;
  const eligible = catalog
    .filter((track) => hasPreviewAsset(track, input.platform))
    .filter((track) => !track.usage || track.usage === requestedUsage)
    .filter((track) => !input.genrePreference || track.genre === input.genrePreference || track.subgenre === input.genrePreference)
    .map((track) => {
      const ranked = scoreTrack(track, input, inferred);
      const preferenceBonus = track.sourceType === "scorvik-original" && ranked.score >= strongMatchThreshold ? originalTrackBonus : 0;
      if (preferenceBonus) ranked.reasons.push(`Strong Scorvik Original match (+${preferenceBonus})`);
      return { ...ranked, score: ranked.score + preferenceBonus, track };
    })
    .sort((left, right) => right.score - left.score || left.track.id.localeCompare(right.track.id));

  const grouped = new Map<string, RankedMusicTrack>();
  for (const candidate of eligible) {
    const key = `${candidate.track.usage}:${candidate.track.mood[0].toLowerCase()}`;
    const current = grouped.get(key);
    if (current) current.alternatives.push(candidate.track);
    else grouped.set(key, {
      track: candidate.track,
      alternatives: [],
      score: candidate.score,
      matchReasons: candidate.reasons,
      licenseWarning: isClearedRoyaltyFreeTrack(candidate.track, input.platform)
        ? "License metadata verified for this platform."
        : candidate.track.sourceType === "scorvik-original"
          ? "Scorvik Original Music; commercial terms are unverified pending a Suno plan check."
          : "Commercial-use rights are unverified; preview only.",
    });
  }
  return [...grouped.values()].sort((left, right) => right.score - left.score || left.track.id.localeCompare(right.track.id));
}