import type { CreativeBrief, MusicTrack, SiteAnalysis } from "@/types/project";
import { musicTaxonomy } from "./taxonomy.ts";

export const demoMusicCatalog: MusicTrack[] = [
  { id: "track-modern-horizon", title: "Modern Horizon", artist: "SCORVIK Demo Library", source: "Demo catalog", sourceUrl: "https://example.invalid/licenses/demo", audioUrl: null, duration: 42, genre: "Electronic", subgenre: "Minimal Electronic", style: ["Polished", "Minimal"], mood: ["Modern", "Confident", "Premium"], energy: 5, tempoBpm: 108, instrumentation: ["Synth", "Electronic percussion"], era: "Contemporary", vocals: false, instrumental: true, useCases: ["Product", "SaaS", "Technology"], brandFit: ["saas", "service"], commercialUse: false, allowedPlatforms: [], licenseType: "No audio file or usage grant; mock metadata only", attributionRequired: false, licenseUrl: "", downloadedAt: null, licenseCheckedAt: null },
  { id: "track-southern-drive", title: "Southern Drive", artist: "SCORVIK Demo Library", source: "Demo catalog", sourceUrl: "https://example.invalid/licenses/demo", audioUrl: null, duration: 47, genre: "Rock", subgenre: "Blues Rock", style: ["Raw", "Groove-led"], mood: ["Energetic", "Authentic", "Powerful"], energy: 8, tempoBpm: 118, instrumentation: ["Electric guitar", "Drums", "Bass"], era: "Modern", vocals: false, instrumental: true, useCases: ["Brand film", "Events", "Lifestyle"], brandFit: ["ecommerce", "content"], commercialUse: false, allowedPlatforms: [], licenseType: "No audio file or usage grant; mock metadata only", attributionRequired: false, licenseUrl: "", downloadedAt: null, licenseCheckedAt: null },
  { id: "track-midnight-blue", title: "Midnight Blue", artist: "SCORVIK Demo Library", source: "Demo catalog", sourceUrl: "https://example.invalid/licenses/demo", audioUrl: null, duration: 51, genre: "Blues", subgenre: "Chicago Blues", style: ["Cool", "Vintage"], mood: ["Warm", "Nostalgic", "Authentic"], energy: 4, tempoBpm: 92, instrumentation: ["Guitar", "Piano", "Harmonica"], era: "Vintage-inspired", vocals: false, instrumental: true, useCases: ["Hospitality", "Craft", "Storytelling"], brandFit: ["restaurant", "travel", "service"], commercialUse: false, allowedPlatforms: [], licenseType: "No audio file or usage grant; mock metadata only", attributionRequired: false, licenseUrl: "", downloadedAt: null, licenseCheckedAt: null },
  { id: "track-soft-focus", title: "Soft Focus", artist: "SCORVIK Demo Library", source: "Demo catalog", sourceUrl: "https://example.invalid/licenses/demo", audioUrl: null, duration: 39, genre: "Jazz", subgenre: "Lounge Jazz", style: ["Sophisticated", "Lounge"], mood: ["Elegant", "Warm", "Premium"], energy: 3, tempoBpm: 96, instrumentation: ["Piano", "Saxophone", "Double bass"], era: "Contemporary", vocals: false, instrumental: true, useCases: ["Hospitality", "Luxury", "Lifestyle"], brandFit: ["restaurant", "travel", "service"], commercialUse: false, allowedPlatforms: [], licenseType: "No audio file or usage grant; mock metadata only", attributionRequired: false, licenseUrl: "", downloadedAt: null, licenseCheckedAt: null },
  { id: "track-open-road", title: "Open Road", artist: "SCORVIK Demo Library", source: "Demo catalog", sourceUrl: "https://example.invalid/licenses/demo", audioUrl: null, duration: 55, genre: "Acoustic / Folk", subgenre: "Americana", style: ["Organic", "Roots"], mood: ["Adventurous", "Authentic", "Inspirational"], energy: 6, tempoBpm: 104, instrumentation: ["Acoustic guitar", "Mandolin", "Hand percussion"], era: "Contemporary", vocals: false, instrumental: true, useCases: ["Travel", "Outdoor", "Brand story"], brandFit: ["travel", "content", "ecommerce"], commercialUse: false, allowedPlatforms: [], licenseType: "No audio file or usage grant; mock metadata only", attributionRequired: false, licenseUrl: "", downloadedAt: null, licenseCheckedAt: null },
  { id: "track-golden-hour", title: "Golden Hour", artist: "SCORVIK Demo Library", source: "Demo catalog", sourceUrl: "https://example.invalid/licenses/demo", audioUrl: null, duration: 45, genre: "Soul / R&B", subgenre: "Neo-Soul", style: ["Smooth", "Modern"], mood: ["Warm", "Playful", "Confident"], energy: 6, tempoBpm: 102, instrumentation: ["Rhodes", "Bass", "Claps"], era: "Contemporary", vocals: false, instrumental: true, useCases: ["Lifestyle", "Product", "Social"], brandFit: ["ecommerce", "restaurant", "content"], commercialUse: false, allowedPlatforms: [], licenseType: "No audio file or usage grant; mock metadata only", attributionRequired: false, licenseUrl: "", downloadedAt: null, licenseCheckedAt: null },
];

export interface MusicRecommendationInput {
  analysis: SiteAnalysis;
  brief: CreativeBrief;
  duration: number;
  platform: string;
  userMoods?: string[];
  genrePreference?: string | null;
  style?: string;
}

export interface RankedMusicTrack {
  track: MusicTrack;
  score: number;
  matchReasons: string[];
  licenseWarning: string;
}

function suggestedGenres(category: string, brief: CreativeBrief): string[] {
  const text = `${brief.tone.join(" ")} ${brief.suggestedMusicDirection}`.toLowerCase();
  if (category === "restaurant" || category === "travel") return /premium|elegant|sophisticated/.test(text) ? ["Jazz", "Cinematic", "Acoustic / Folk"] : ["Acoustic / Folk", "Soul / R&B", "Jazz"];
  if (category === "saas") return ["Electronic", "Cinematic", "Orchestral"];
  if (category === "ecommerce") return /authentic|vintage/.test(text) ? ["Blues", "Soul / R&B", "Acoustic / Folk"] : ["Soul / R&B", "Electronic", "Acoustic / Folk"];
  return ["Cinematic", "Acoustic / Folk", "Electronic"];
}

export function recommendMusic(input: MusicRecommendationInput, catalog: MusicTrack[] = demoMusicCatalog): RankedMusicTrack[] {
  const category = input.analysis.brandProfile?.category ?? "other";
  const inferred = suggestedGenres(category, input.brief);
  return catalog
    .filter((track) => !input.genrePreference || track.genre === input.genrePreference || track.subgenre === input.genrePreference)
    .map((track) => {
      let score = 0;
      const matchReasons: string[] = [];
      const moodTargets = input.userMoods?.length ? input.userMoods : input.brief.tone;
      const matchedMoods = moodTargets.filter((mood) => track.mood.some((item) => item.toLowerCase() === mood.toLowerCase()));
      score += matchedMoods.length * 4;
      if (matchedMoods.length) matchReasons.push(`A ${matchedMoods[0].toLowerCase()} feel`);
      const genreMatch = input.genrePreference ? 12 : inferred.includes(track.genre) ? 7 : 0;
      score += genreMatch;
      if (genreMatch) matchReasons.push(input.genrePreference ? "Your pick" : "Fits your brand");
      if (track.brandFit.includes(category)) { score += 6; matchReasons.push("A natural fit"); }
      if (input.style && track.style.some((style) => style.toLowerCase().includes(input.style!.toLowerCase()))) score += 2;
      const tempoMidpoint = musicTaxonomy.find((entry) => entry.genre === track.genre)?.tempoRange.reduce((sum, value) => sum + value, 0) ?? 180;
      if (track.tempoBpm >= tempoMidpoint / 2 - 12 && track.tempoBpm <= tempoMidpoint / 2 + 12) score += 2;
      const durationFit = 1 - Math.min(Math.abs(track.duration - input.duration) / Math.max(input.duration, 1), 1);
      score += Math.round(durationFit * 5);
      if (durationFit > 0.8) matchReasons.push("Fits your film");
      if (track.allowedPlatforms.includes(input.platform)) score += 2;
      return {
        track,
        score,
        matchReasons,
        licenseWarning: track.commercialUse && track.licenseUrl ? "Check that this permission covers your use before adding the track." : "Sample details only. There is no audio file or permission to use the track.",
      };
    })
    .sort((left, right) => right.score - left.score || left.track.id.localeCompare(right.track.id));
}
