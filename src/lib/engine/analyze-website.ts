import { createCreativeBrief, detectBrandProfile } from "../creative/create-brief.ts";
import { buildStoryboard, recommendInstructionDuration } from "../creative/storyboard-engine.ts";
import { recommendMusic } from "../music/recommend.ts";
import { getPlatformPreset } from "../platforms/presets.ts";
import { WebsiteIngestionService } from "../ingestion/website-ingestion.ts";
import type { FilmMode } from "@/types/project";

export interface AnalyzeWebsiteOptions {
  mode?: FilmMode;
  duration?: number;
  platform?: string;
  language?: string;
}

export async function analyzeWebsite(
  url: string,
  options: AnalyzeWebsiteOptions = {},
  ingestion = new WebsiteIngestionService(),
) {
  const platform = options.platform ?? "youtube";
  if (!getPlatformPreset(platform)) throw new Error("Unsupported platform preset");

  const { source, analysis: extracted } = await ingestion.analyze(url);
  const brandProfile = detectBrandProfile(extracted);
  const analysis = { ...extracted, brandProfile };
  const mode = options.mode ?? "advert";
  const instructionCount = analysis.steps?.length || analysis.headings?.length || 1;
  const targetDuration = options.duration ?? (mode === "instruction" ? recommendInstructionDuration(instructionCount).seconds : 30);
  const brief = createCreativeBrief(analysis, { mode, targetDuration });
  const storyboard = buildStoryboard(analysis, brief, {
    mode,
    targetDuration,
    idFactory: (() => {
      let index = 0;
      return () => `scene-${++index}`;
    })(),
  });
  const configuredBonus = Number(process.env.SCORVIK_ORIGINAL_MUSIC_BONUS);
  const music = recommendMusic({
    analysis,
    brief,
    duration: storyboard.totalDuration,
    platform,
    mode,
    language: options.language,
    hasVoiceover: storyboard.scenes.some((scene) => Boolean(scene.voiceover.trim())),
    storyboard,
  }, undefined, Number.isFinite(configuredBonus) ? { originalTrackBonus: configuredBonus } : {});

  return { source, analysis, brandProfile, brief, storyboard, music };
}