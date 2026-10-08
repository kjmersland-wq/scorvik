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
  /** true when the text names someone/something that no image can be tied to, so it must not be printed over the picture */
  noOverlay?: boolean;
  /** words to highlight when the caption animates; chosen from the scene's tone */
  typography?: { emphasis: string[] };
  /** English search phrase for stock libraries (Pexels/Unsplash/Pixabay) */
  visualQuery?: string;
  /** stock video clip (same-origin proxied mp4) drawn instead of a still */
  videoUrl?: string;
  /** photographer credit shown on the end card when the source requires it (Unsplash) */
  credit?: string;
  visualSource?: "website-image" | "open-graph" | "not-detected";
  cta?: string;
  musicCue?: string;
  soundCue?: string;
}

export interface MusicProfile {
  moods: string[];
  genres: string[];
  /** 1 very calm .. 10 intense */
  energy: number;
  reason: string;
  source: "ai" | "topic";
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
  /** how the page should sound; set from Claude's reading of the page when available */
  musicProfile?: MusicProfile;
  /** alt text, title and file name for each image URL; used to pair names and headings with the right picture */
  imageAlts?: Record<string, string>;
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
  /** strong messages found on the page that did not get a scene, strongest first */
  leftOut?: string[];
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

export type PosterLayoutKind = "claim" | "price" | "steps";

export interface PosterInsets { top: number; right: number; bottom: number; left: number }

/** One exported poster size. All pixel values are exact; nothing is derived from percentages. */
export interface PosterPlacement {
  id: string;
  label: string;
  width: number;
  height: number;
  safeInsets: PosterInsets;
  fileStem: string;
  usage: string;
  /** share of the width that text may use, centred (0.8 keeps text inside the middle 80%) */
  textColumn?: number;
  /** smallest allowed brand-name size in pixels (thumbnails must read at phone size) */
  minNamePx?: number;
  dpi?: number;
  /** also export this placement as a PDF */
  pdf?: boolean;
  /** rendered once from another placement's master and saved as a separate file */
  sameMasterAs?: string;
}

/** Everything a poster is made of. Missing fields stay missing; nothing is invented to fill a slot. */
export interface PosterBrief {
  name: string;
  /** one claim already on the page, at most 90 characters */
  claim: string;
  price?: string;
  location?: string;
  /** up to five brand colours; slot 0 is the page background when the site gave one */
  palette: string[];
  ink?: string;
  logoUrl?: string;
  heroUrl?: string;
  category?: BrandProfile["category"];
  host: string;
  /** three numbered lines from headings already extracted (docs and how-to pages) */
  steps: string[];
  /** where the picture's subject sits, 0-1 each; centre when unset */
  focal?: { x: number; y: number };
  /** the page address says docs/help/guide */
  docsHint: boolean;
  /** posters made from a mock analysis are labelled Mock */
  mock: boolean;
}

export interface PosterState {
  claim: string;
  price?: string;
  layout: PosterLayoutKind;
  updatedAt: string;
  location?: string;
  heroUrl?: string;
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
  /** sharpen, level and upscale pictures before filming (default on) */
  enhanceImages?: boolean;
  /** on-screen text motion: calm (fade and rise) or kinetic (word pop-in, highlights) */
  typography?: "calm" | "kinetic";
  /** writing style chosen by the user (warm, bluesy, playful, elegant); unset = detect from the site */
  copyTone?: string;
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
  renderJob?: RenderJob;
  /** the poster pack's editable copy; the pictures are re-rendered locally from the saved analysis */
  posters?: PosterState;
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
  progress?: number;
  updatedAt?: string;
  outputUrl?: string;
  errorCode?: string;
  errorMessage?: string;
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
