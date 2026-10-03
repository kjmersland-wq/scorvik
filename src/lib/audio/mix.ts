import type { AudioLayerSettings, AudioMix } from "@/types/project";

const defaultLayer = (volume: number): AudioLayerSettings => ({ volume, muted: false, fadeInSeconds: 0.8, fadeOutSeconds: 1.5, startSeconds: 0 });

export const defaultAudioMix: AudioMix = {
  voice: defaultLayer(0.8),
  music: defaultLayer(0.55),
  sfx: defaultLayer(0.25),
  jingle: defaultLayer(0.35),
  duckMusicUnderVoice: true,
};

export interface TimedAudioFit {
  sourceDuration: number;
  videoDuration: number;
  startSeconds: number;
  endSeconds: number;
  fadeInSeconds: number;
  fadeOutSeconds: number;
  shouldLoop: boolean;
  warning?: string;
}

export function fitMusicToVideo(sourceDuration: number, videoDuration: number, startSeconds = 0): TimedAudioFit {
  if (!Number.isFinite(sourceDuration) || sourceDuration <= 0 || !Number.isFinite(videoDuration) || videoDuration <= 0) {
    throw new RangeError("Audio and video durations must be positive numbers.");
  }
  const safeStart = Math.max(0, Math.min(startSeconds, Math.max(0, sourceDuration - 0.1)));
  const available = sourceDuration - safeStart;
  const endSeconds = Math.min(sourceDuration, safeStart + videoDuration);
  const fadeInSeconds = Math.min(1.2, videoDuration * 0.08);
  const fadeOutSeconds = Math.min(2.5, videoDuration * 0.12, Math.max(0.2, videoDuration - fadeInSeconds));
  const shouldLoop = available < videoDuration * 0.65;
  return { sourceDuration, videoDuration, startSeconds: safeStart, endSeconds, fadeInSeconds, fadeOutSeconds, shouldLoop, warning: shouldLoop ? "Track is short for this duration; looping requires a verified license and editorial review." : undefined };
}

export function musicGainWithVoiceDucking(musicVolume: number, voiceActive: boolean, ducking: boolean): number {
  return Math.max(0, Math.min(1, musicVolume)) * (voiceActive && ducking ? 0.38 : 1);
}
