export type VideoFormat = "16:9" | "9:16" | "1:1" | "4:5";
export type FilmMode = "advert" | "instruction";
export type ScenePurpose = "Hook" | "Story" | "Product" | "Benefit" | "Proof" | "CTA" | "Step";
export type Confidence = "high" | "medium" | "low";

export interface SourcedValue<T> {
  value: T;
  source: string;
  confidence: Confidence;
}

export interface WebsiteSource {
  submittedUrl: string;
  finalUrl: string;
  fetchedAt: string;
  mode: "real" | "mock";
}

export interface StoryScene {
  id: string;
  order?: number;
  purpose: ScenePurpose;
  duration: number;
  headline: string;
  supportingText: string;
  voiceover: string;
  transition: string;
  visual: string;
  visualSource?: "website-image" | "open-graph" | "not-detected";
  cta?: string;
  musicCue?: string;
  soundCue?: string;
}

export interface SiteAnalysis {
  url: string;
  title: string;
  description: string;
  brand: string;
  colors: string[];
  sellingPoints: string[];
  image: string;
  source?: WebsiteSource;
  canonicalUrl?: string;
  faviconUrl?: string;
  openGraphImage?: string;
  language?: string;
  headings?: string[];
  subheadings?: string[];
  visibleText?: string;
  images?: string[];
  logoCandidates?: string[];
  relevantLinks?: Array<{ label: string; url: string }>;
  callsToAction?: string[];
  buttons?: string[];
  steps?: Array<{ title: string; description: string; action?: string }>;
  proofPoints?: string[];
  brandProfile?: BrandProfile;
  fieldSources?: Record<string, SourcedValue<unknown>>;
}

export interface BrandProfile {
  name: string;
  category: "saas" | "ecommerce" | "restaurant" | "travel" | "hotel-travel" | "tourism" | "local-service" | "professional-service" | "health-wellness" | "product-brand" | "service" | "content" | "media" | "other";
  productOrService: string;
  tone: string[];
  colors: string[];
  evidence: string[];
  confidence: Confidence;
  targetAudience?: string[];
  valueProposition?: string;
  callToAction?: string;
}

export interface CreativeBrief {
  objective: string;
  durationMode: FilmMode;
  targetDuration: number;
  durationGuidance: string;
  brand: string;
  productOrService: string;
  valueProposition: string;
  targetAudience: string[];
  coreMessage: string;
  keyBenefits: string[];
  tone: string[];
  visualStyle: string;
  suggestedHook: string;
  callToAction: string;
  suggestedPacing: "measured" | "balanced" | "fast";
  suggestedMusicDirection: string;
  suggestedVoiceDirection: string;
  recommendedPlatforms: string[];
  evidence: string[];
  confidence: Confidence;
}

export interface Storyboard {
  scenes: StoryScene[];
  totalDuration: number;
  requestedDuration?: number;
  durationToleranceSeconds?: number;
  durationWithinTolerance?: boolean;
  rationale: string;
}

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  source: string;
  sourceType?: "scorvik-original" | "pixabay" | "other";
  sourceUrl: string;
  audioUrl: string | null;
  duration: number;
  genre: string;
  subgenre: string;
  style: string[];
  mood: string[];
  tags?: string[];
  energy: number | null;
  tempoBpm: number | null;
  instrumentation: string[];
  era: string;
  vocals: boolean;
  instrumental: boolean;
  useCases: string[];
  usage?: "ad" | "guide";
  voiceoverSuitable?: boolean;
  language?: string | null;
  brandFit: string[];
  commercialUse: boolean;
  metadataStatus?: "demo" | "owner-supplied" | "verified";
  allowedPlatforms: string[];
  licenseType: string;
  attributionRequired: boolean;
  licenseUrl: string;
  downloadedAt: string | null;
  licenseCheckedAt: string | null;
}

export interface PlatformPreset {
  id: string;
  platform: string;
  format: VideoFormat;
  width: number;
  height: number;
  aspectRatio: string;
  recommendedDuration: { min: number; max: number };
  safeArea: { top: number; right: number; bottom: number; left: number };
  textSafeArea: { top: number; right: number; bottom: number; left: number };
  captionBehavior: "burn-in" | "platform" | "optional";
}

export interface AudioLayerSettings {
  volume: number;
  muted: boolean;
  fadeInSeconds: number;
  fadeOutSeconds: number;
  startSeconds: number;
}

export interface AudioMix {
  voice: AudioLayerSettings;
  music: AudioLayerSettings;
  sfx: AudioLayerSettings;
  jingle: AudioLayerSettings;
  duckMusicUnderVoice: boolean;
}

export interface VideoSettings {
  mode?: FilmMode;
  showTextOnScreen?: boolean;
  format: VideoFormat;
  duration: number;
  language: string;
  voice: string;
  style: string;
  music: string;
  musicTrackId?: string | null;
  userMood?: string[];
  genrePreference?: string | null;
  platformPresetIds?: string[];
  audioMix?: AudioMix;
}

export interface VideoProject {
  id: string;
  title: string;
  url: string;
  createdAt: string;
  thumbnailUrl?: string;
  analysis: SiteAnalysis;
  scenes: StoryScene[];
  settings: VideoSettings;
  version: number;
  creativeBrief?: CreativeBrief;
  platformVersions?: Array<{ presetId: string; scenes: StoryScene[]; status: "draft" | "rendering" | "complete" }>;
}

export interface UrlIngestionProvider {
  analyze(url: URL): Promise<SiteAnalysis>;
}

export type WebsiteIngestionService = UrlIngestionProvider;

export interface CreativeBriefProvider {
  create(analysis: SiteAnalysis): Promise<CreativeBrief>;
}

export interface StoryboardProvider {
  build(analysis: SiteAnalysis): Promise<StoryScene[]>;
}

export interface VideoRenderProvider {
  render(project: VideoProject): Promise<RenderJob>;
}

export interface AudioAsset {
  id: string;
  kind: "music" | "sfx" | "jingle" | "voice";
  track?: MusicTrack;
  url: string | null;
  licenseUrl: string;
  commercialUse: boolean;
}

export interface VoiceTrack {
  id: string;
  audioUrl: string | null;
  language: string;
  voice: string;
  tone: string;
  speed: number;
}

export interface SoundEffect extends AudioAsset {
  kind: "sfx" | "jingle";
  cue: string;
}

export interface RenderJob {
  renderId: string;
  status: "queued" | "processing" | "complete" | "failed";
  mode: "mock" | "real";
  engine: "demo" | "ffmpeg" | "external";
  outputUrl?: string;
}

export interface VideoVersion {
  id: string;
  projectId: string;
  label: string;
  hook: string;
  tone: string;
  platformPresetIds: string[];
  renderJobIds: string[];
}
