import type { PlatformPreset, PosterInsets, PosterPlacement, VideoFormat } from "@/types/project";

const safeArea = { top: 0.08, right: 0.08, bottom: 0.08, left: 0.08 };
const verticalSafe = { top: 0.12, right: 0.08, bottom: 0.2, left: 0.08 };

export const platformPresets: PlatformPreset[] = [
  { id: "youtube", platform: "YouTube", format: "16:9", width: 1920, height: 1080, aspectRatio: "16:9", recommendedDuration: { min: 15, max: 60 }, safeArea, textSafeArea: safeArea, captionBehavior: "optional" },
  { id: "youtube-shorts", platform: "YouTube Shorts", format: "9:16", width: 1080, height: 1920, aspectRatio: "9:16", recommendedDuration: { min: 15, max: 60 }, safeArea: verticalSafe, textSafeArea: { ...verticalSafe, bottom: 0.24 }, captionBehavior: "burn-in" },
  { id: "instagram-feed", platform: "Instagram Feed", format: "4:5", width: 1080, height: 1350, aspectRatio: "4:5", recommendedDuration: { min: 6, max: 60 }, safeArea: { ...safeArea, bottom: 0.12 }, textSafeArea: { ...safeArea, bottom: 0.16 }, captionBehavior: "optional" },
  { id: "instagram-reels", platform: "Instagram Reels", format: "9:16", width: 1080, height: 1920, aspectRatio: "9:16", recommendedDuration: { min: 15, max: 90 }, safeArea: verticalSafe, textSafeArea: { ...verticalSafe, bottom: 0.24 }, captionBehavior: "burn-in" },
  { id: "facebook-landscape", platform: "Facebook", format: "16:9", width: 1920, height: 1080, aspectRatio: "16:9", recommendedDuration: { min: 15, max: 60 }, safeArea, textSafeArea: safeArea, captionBehavior: "optional" },
  { id: "facebook-feed", platform: "Facebook", format: "4:5", width: 1080, height: 1350, aspectRatio: "4:5", recommendedDuration: { min: 6, max: 60 }, safeArea: { ...safeArea, bottom: 0.12 }, textSafeArea: { ...safeArea, bottom: 0.16 }, captionBehavior: "optional" },
  { id: "facebook-reels", platform: "Facebook", format: "9:16", width: 1080, height: 1920, aspectRatio: "9:16", recommendedDuration: { min: 15, max: 90 }, safeArea: verticalSafe, textSafeArea: { ...verticalSafe, bottom: 0.24 }, captionBehavior: "burn-in" },
  { id: "tiktok", platform: "TikTok", format: "9:16", width: 1080, height: 1920, aspectRatio: "9:16", recommendedDuration: { min: 15, max: 60 }, safeArea: verticalSafe, textSafeArea: { ...verticalSafe, bottom: 0.26 }, captionBehavior: "burn-in" },
  { id: "square-social", platform: "Custom Square", format: "1:1", width: 1080, height: 1080, aspectRatio: "1:1", recommendedDuration: { min: 6, max: 60 }, safeArea, textSafeArea: safeArea, captionBehavior: "optional" },
];

const insets = (all: number, extra: Partial<PosterInsets> = {}): PosterInsets => ({ top: all, right: all, bottom: all, left: all, ...extra });

// Poster placements. These are the only place poster sizes and safe zones are defined.
export const posterPlacements: PosterPlacement[] = [
  { id: "instagram-feed-portrait", label: "Instagram feed, portrait", width: 1080, height: 1350, safeInsets: insets(64, { bottom: 64 + 80 }), fileStem: "instagram-feed-portrait", usage: "Instagram feed post (4:5)" },
  { id: "story-reel-cover", label: "Story and reel cover", width: 1080, height: 1920, safeInsets: { top: 96, right: 64, bottom: 220, left: 64 }, fileStem: "story-reel-cover", usage: "Instagram, Facebook and TikTok story or reel cover (9:16)" },
  { id: "square-feed", label: "Square feed", width: 1080, height: 1080, safeInsets: insets(64), fileStem: "square-feed", usage: "Square feed post (1:1)" },
  { id: "link-share", label: "Facebook and LinkedIn link", width: 1200, height: 628, safeInsets: insets(48), fileStem: "link-share", usage: "Link preview card on Facebook and LinkedIn", textColumn: 0.8 },
  { id: "x-post", label: "X post", width: 1600, height: 900, safeInsets: insets(64), fileStem: "x-post", usage: "Image post on X (16:9)" },
  { id: "youtube-thumbnail", label: "YouTube thumbnail", width: 1280, height: 720, safeInsets: insets(48), fileStem: "youtube-thumbnail", usage: "YouTube video thumbnail; reads at phone size", minNamePx: 64 },
  { id: "pinterest", label: "Pinterest", width: 1000, height: 1500, safeInsets: insets(64), fileStem: "pinterest", usage: "Pinterest pin (2:3)" },
  { id: "linkedin-square", label: "LinkedIn square", width: 1080, height: 1080, safeInsets: insets(64), fileStem: "linkedin-square", usage: "LinkedIn square post; same master as the square feed, separate file", sameMasterAs: "square-feed" },
  { id: "print-a3", label: "Print A3 (150 dpi)", width: 1754, height: 2480, safeInsets: insets(96), fileStem: "print-a3", usage: "A3 print at 150 dpi, also exported as PDF", dpi: 150, pdf: true },
];

export function getPosterPlacement(id: string): PosterPlacement | undefined {
  return posterPlacements.find((placement) => placement.id === id);
}

export function getPlatformPreset(id: string): PlatformPreset | undefined {
  return platformPresets.find((preset) => preset.id === id);
}

export function getPlatformPresets(platform: string): PlatformPreset[] {
  return platformPresets.filter((preset) => preset.platform.toLowerCase() === platform.toLowerCase());
}

export function validatePlatformOutput(
  preset: PlatformPreset,
  output: { width: number; height: number; duration: number; captionsEnabled?: boolean },
): string[] {
  const issues: string[] = [];
  if (!Number.isInteger(output.width) || !Number.isInteger(output.height) || output.width !== preset.width || output.height !== preset.height) {
    issues.push("dimensions must match the platform preset");
  }
  if (output.width <= 0 || output.height <= 0 || output.width * Number(preset.aspectRatio.split(":")[1]) !== output.height * Number(preset.aspectRatio.split(":")[0])) {
    issues.push("aspect ratio does not match the platform preset");
  }
  if (!Number.isFinite(output.duration) || output.duration < preset.recommendedDuration.min || output.duration > preset.recommendedDuration.max) {
    issues.push("duration is outside the recommended platform range");
  }
  for (const area of [preset.safeArea, preset.textSafeArea]) {
    if (Object.values(area).some((value) => !Number.isFinite(value) || value < 0 || value >= 0.5)) {
      issues.push("safe-area values are invalid");
      break;
    }
  }
  if (preset.captionBehavior === "burn-in" && output.captionsEnabled !== true) issues.push("captions are required for this preset");
  return issues;
}

export function customPlatformPreset(format: VideoFormat, width: number, height: number): PlatformPreset {
  return { id: `custom-${width}x${height}`, platform: "Custom", format, width, height, aspectRatio: `${width}:${height}`, recommendedDuration: { min: 6, max: 60 }, safeArea, textSafeArea: safeArea, captionBehavior: "optional" };
}
