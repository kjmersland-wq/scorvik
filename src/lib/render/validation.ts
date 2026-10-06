import type { StoryScene, VideoFormat, VideoProject } from "@/types/project";

export type RenderErrorCode =
  | "INVALID_PROJECT"
  | "INVALID_RENDER_SETTINGS"
  | "MISSING_SCENES"
  | "INVALID_SCENE_DURATION"
  | "MISSING_VISUAL"
  | "INVALID_MEDIA"
  | "MISSING_AUDIO"
  | "RENDERER_UNAVAILABLE"
  | "RENDER_TIMEOUT"
  | "RENDER_CANCELLED"
  | "ENCODING_FAILED"
  | "RENDER_RESULT_INVALID";

export class RenderError extends Error {
  readonly code: RenderErrorCode;

  constructor(code: RenderErrorCode, message: string) {
    super(message);
    this.name = "RenderError";
    this.code = code;
  }
}

const supportedDurations = new Set([15, 20, 30, 45, 60, 90, 120, 180]);

export const renderDimensions: Record<VideoFormat, { width: number; height: number }> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
};

export function validateRenderProject(value: unknown): asserts value is VideoProject {
  if (!value || typeof value !== "object") throw new RenderError("INVALID_PROJECT", "The render request did not include a project.");
  const project = value as Partial<VideoProject>;
  if (typeof project.id !== "string" || typeof project.title !== "string" || !project.analysis || !project.settings || !Array.isArray(project.scenes)) {
    throw new RenderError("INVALID_PROJECT", "The project is missing required render data.");
  }
  if (!(project.settings.format in renderDimensions) || !supportedDurations.has(project.settings.duration)) {
    throw new RenderError("INVALID_RENDER_SETTINGS", "Choose a supported frame format and film duration.");
  }
  if (!project.scenes.length || project.scenes.length > 60) throw new RenderError("MISSING_SCENES", "The project must contain between 1 and 60 scenes.");
  if (project.scenes.length > project.settings.duration) throw new RenderError("INVALID_SCENE_DURATION", "There are more scenes than available seconds.");
  for (const scene of project.scenes) {
    if (!Number.isFinite(scene.duration) || scene.duration <= 0) throw new RenderError("INVALID_SCENE_DURATION", "Every scene must have a positive duration.");
    if (typeof scene.headline !== "string" || scene.headline.length > 500 || typeof scene.supportingText !== "string" || scene.supportingText.length > 1000 || typeof scene.voiceover !== "string" || scene.voiceover.length > 3000) {
      throw new RenderError("INVALID_PROJECT", "Scene text exceeds the supported render limits.");
    }
  }
  const mix = project.settings.audioMix;
  if (mix && [mix.voice, mix.music, mix.sfx, mix.jingle].some((layer) => !Number.isFinite(layer.volume) || layer.volume < 0 || layer.volume > 1)) {
    throw new RenderError("INVALID_RENDER_SETTINGS", "Audio levels must be between 0 and 1.");
  }
}

export function normalizeSceneDurations(scenes: StoryScene[], targetDuration: number): StoryScene[] {
  if (!Number.isInteger(targetDuration) || targetDuration <= 0 || !scenes.length || scenes.length > targetDuration) {
    throw new RenderError("INVALID_SCENE_DURATION", "Scene count and target duration cannot produce valid timings.");
  }
  const storyboardDuration = scenes.reduce((sum, scene) => sum + scene.duration, 0);
  if (Math.abs(storyboardDuration - targetDuration) > 2) {
    throw new RenderError("INVALID_SCENE_DURATION", "The storyboard duration differs too much from the requested film length. Regenerate or edit the storyboard before rendering.");
  }
  const weights = scenes.map((scene) => Math.max(0.01, scene.duration));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const exact = weights.map((weight) => targetDuration * weight / totalWeight);
  const durations = exact.map((value) => Math.max(1, Math.floor(value)));
  let difference = targetDuration - durations.reduce((sum, duration) => sum + duration, 0);
  if (difference > 0) {
    const order = exact.map((value, index) => ({ index, fraction: value - Math.floor(value) })).sort((left, right) => right.fraction - left.fraction);
    for (let index = 0; difference > 0; index += 1, difference -= 1) durations[order[index % order.length].index] += 1;
  } else if (difference < 0) {
    const order = exact.map((value, index) => ({ index, fraction: value - Math.floor(value) })).sort((left, right) => left.fraction - right.fraction);
    let cursor = 0;
    while (difference < 0) {
      const index = order[cursor++ % order.length].index;
      if (durations[index] > 1) {
        durations[index] -= 1;
        difference += 1;
      }
    }
  }
  return scenes.map((scene, index) => ({ ...scene, order: index, duration: durations[index] }));
}