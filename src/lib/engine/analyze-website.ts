import { createCreativeBrief, detectBrandProfile } from "../creative/create-brief.ts";
import { buildStoryboard, recommendInstructionDuration } from "../creative/storyboard-engine.ts";
import { askInsight } from "../ai/insight.ts";
import { collectKeyPoints, recommendPromoDuration } from "../creative/key-points.ts";
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
  const mode = options.mode ?? "advert";
  // With a Claude key the page is read like a creative director would: its strongest messages and the right sound. Without one, everything below still works.
  const reading = [extracted.title, extracted.description, ...(extracted.headings ?? []), ...(extracted.subheadings ?? []), extracted.visibleText ?? ""].join("\n");
  const insight = await Promise.race([askInsight(extracted.brand, reading, mode), new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 9000))]).catch(() => undefined);
  const modelPoints = insight?.keyPoints.map((point) => point.text) ?? [];
  const analysis = {
    ...extracted,
    brandProfile,
    sellingPoints: [...new Set([...modelPoints, ...extracted.sellingPoints])],
    ...(insight?.music ? { musicProfile: insight.music } : {}),
  };
  const instructionCount = analysis.steps?.length || analysis.headings?.length || 1;
  const keyPoints = collectKeyPoints(analysis);
  const promo = recommendPromoDuration(keyPoints, insight?.keyPoints.filter((point) => point.strength >= 3).length ?? 0);
  const recommended = mode === "instruction" ? { seconds: recommendInstructionDuration(instructionCount).seconds, keyPoints: instructionCount } : promo;
  const targetDuration = options.duration ?? recommended.seconds;
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

  return { source, analysis, brandProfile, brief, storyboard, music, recommendation: { seconds: recommended.seconds, keyPoints: recommended.keyPoints, mode } };
}