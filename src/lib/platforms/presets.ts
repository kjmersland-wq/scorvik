import type { PlatformPreset, VideoFormat } from "@/types/project";

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

export function getPlatformPreset(id: string): PlatformPreset | undefined {
  return platformPresets.find((preset) => preset.id === id);
}

export function getPlatformPresets(platform: string): PlatformPreset[] {
  return platformPresets.filter((preset) => preset.platform.toLowerCase() === platform.toLowerCase());
}

export function customPlatformPreset(format: VideoFormat, width: number, height: number): PlatformPreset {
  return { id: `custom-${width}x${height}`, platform: "Custom", format, width, height, aspectRatio: `${width}:${height}`, recommendedDuration: { min: 6, max: 60 }, safeArea, textSafeArea: safeArea, captionBehavior: "optional" };
}
