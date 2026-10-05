import type { AudioLayerSettings, AudioMix, MusicTrack } from "@/types/project";

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

export interface AudioSource {
  url: string;
  duration?: number;
  startSeconds?: number;
}

export interface AudioTimelineInput {
  videoDuration: number;
  mix?: AudioMix;
  voiceover?: AudioSource;
  music?: MusicTrack;
  sfx?: AudioSource[];
  jingle?: AudioSource;
}

export interface AudioTimelineLayer {
  kind: "voice" | "music" | "sfx" | "jingle";
  sourceUrl?: string;
  enabled: boolean;
  startSeconds: number;
  endSeconds: number;
  sourceStartSeconds: number;
  sourceEndSeconds?: number;
  volume: number;
  fadeInSeconds: number;
  fadeOutSeconds: number;
  duckUnderVoice: boolean;
  ducking: Array<{ startSeconds: number; endSeconds: number; gain: number }>;
  loop: boolean;
  warning?: string;
}

export interface AudioTimeline {
  status: "prepared-not-rendered";
  duration: number;
  layers: AudioTimelineLayer[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

export function fitMusicToVideo(sourceDuration: number, videoDuration: number, startSeconds = 0): TimedAudioFit {
  if (!Number.isFinite(sourceDuration) || sourceDuration <= 0 || !Number.isFinite(videoDuration) || videoDuration <= 0 || !Number.isFinite(startSeconds)) {
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
  return clamp(musicVolume, 0, 1) * (voiceActive && ducking ? 0.38 : 1);
}

export function prepareAudioTimeline(input: AudioTimelineInput): AudioTimeline {
  if (!Number.isFinite(input.videoDuration) || input.videoDuration <= 0) throw new RangeError("Video duration must be positive.");
  const mix = input.mix ?? defaultAudioMix;
  const voiceEnd = Math.min(input.videoDuration, (input.voiceover?.startSeconds ?? mix.voice.startSeconds) + (input.voiceover?.duration ?? input.videoDuration));
  const voiceStart = clamp(input.voiceover?.startSeconds ?? mix.voice.startSeconds, 0, input.videoDuration);

  function layer(
    kind: AudioTimelineLayer["kind"],
    settings: AudioLayerSettings,
    source: AudioSource | undefined,
    startSeconds: number,
    endSeconds: number,
    sourceStartSeconds = 0,
    sourceEndSeconds?: number,
    loop = false,
    warning?: string,
  ): AudioTimelineLayer {
    const start = clamp(startSeconds, 0, input.videoDuration);
    const end = clamp(endSeconds, start, input.videoDuration);
    const span = end - start;
    const active = Boolean(source?.url) && !settings.muted && settings.volume > 0 && span > 0;
    const duckUnderVoice = kind === "music" && mix.duckMusicUnderVoice && Boolean(input.voiceover?.url);
    return {
      kind,
      sourceUrl: source?.url,
      enabled: active,
      startSeconds: start,
      endSeconds: end,
      sourceStartSeconds,
      sourceEndSeconds,
      volume: settings.muted ? 0 : clamp(settings.volume, 0, 1),
      fadeInSeconds: Math.min(clamp(settings.fadeInSeconds, 0, input.videoDuration), span),
      fadeOutSeconds: Math.min(clamp(settings.fadeOutSeconds, 0, input.videoDuration), span),
      duckUnderVoice,
      ducking: duckUnderVoice && voiceEnd > voiceStart
        ? [{ startSeconds: voiceStart, endSeconds: voiceEnd, gain: 0.38 }]
        : [],
      loop,
      warning,
    };
  }

  const voiceStartOffset = input.voiceover?.startSeconds ?? mix.voice.startSeconds;
  const voiceDuration = input.voiceover?.duration ?? input.videoDuration;
  const voiceEndOffset = Math.min(input.videoDuration, Math.max(0, voiceStartOffset) + voiceDuration);
  const musicSettings = mix.music;
  let musicLayer: AudioTimelineLayer;
  if (input.music?.duration && input.music.audioUrl) {
    const fitted = fitMusicToVideo(input.music.duration, input.videoDuration, musicSettings.startSeconds);
    const verifiedForLooping = input.music.metadataStatus === "verified" && input.music.commercialUse && Boolean(input.music.licenseUrl) && Boolean(input.music.licenseCheckedAt);
    const shouldLoop = fitted.shouldLoop && verifiedForLooping;
    const source: AudioSource = { url: input.music.audioUrl, duration: input.music.duration };
    musicLayer = layer("music", musicSettings, source, 0, shouldLoop ? input.videoDuration : Math.min(input.videoDuration, fitted.endSeconds - fitted.startSeconds), fitted.startSeconds, fitted.endSeconds, shouldLoop, shouldLoop ? undefined : fitted.warning);
  } else {
    musicLayer = layer("music", musicSettings, undefined, 0, input.videoDuration);
  }

  const layers = [
    layer("voice", mix.voice, input.voiceover, voiceStartOffset, voiceEndOffset),
    musicLayer,
    ...(input.sfx ?? []).map((source) => {
      const start = source.startSeconds ?? mix.sfx.startSeconds;
      const duration = source.duration ?? input.videoDuration;
      return layer("sfx", mix.sfx, source, start, Math.min(input.videoDuration, start + duration));
    }),
    ...(input.jingle ? [layer("jingle", mix.jingle, input.jingle, input.jingle.startSeconds ?? mix.jingle.startSeconds, Math.min(input.videoDuration, (input.jingle.startSeconds ?? mix.jingle.startSeconds) + (input.jingle.duration ?? input.videoDuration)))] : []),
  ];

  return { status: "prepared-not-rendered", duration: input.videoDuration, layers };
}
