"use client";

import { detectGraphic } from "@/lib/creative/graphics";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { createCreativeBrief, detectBrandProfile } from "@/lib/creative/create-brief";
import { buildStoryboard } from "@/lib/creative/storyboard-engine";
import { buildMockAnalysis, createScene, defaultSettings, demoScenes } from "@/lib/mock-data";
import { defaultAudioMix, fitMusicToVideo } from "@/lib/audio/mix";
import { saveProject } from "@/lib/projects";
import { browserRenderSupported, renderProjectInBrowser } from "@/lib/render/browser-render";
import { saveVideo } from "@/lib/video-store";
import { VersionsPanel } from "@/components/versions-panel";
import { PosterStudio, StudioTabs, type StudioTab } from "@/components/poster-studio";
import { StockPicker } from "@/components/stock-picker";
import { classifyIntent } from "@/lib/creative/intent";
import { imageHasLettering } from "@/lib/render/lettering";
import { fitDurations, readingSeconds } from "@/lib/creative/timing";
import type { StockItem } from "@/lib/stock/search";
import type { CreativeBrief, FilmMode, ScenePurpose, SiteAnalysis, StoryScene, VideoFormat, VideoProject, VideoSettings } from "@/types/project";
import { MusicStudio } from "@/components/music-studio";
import { platformPresets } from "@/lib/platforms/presets";
import { getCopy, localizedPath, type Locale } from "@/lib/i18n/copy";
import { recommendInstructionDuration } from "@/lib/creative/storyboard-engine";
import { demoMusicCatalog, recommendMusic } from "@/lib/music/recommend";

const formats: VideoFormat[] = ["16:9", "9:16", "1:1", "4:5"];
const durationOptions = [15, 20, 30, 45, 60, 90, 120, 180];
const styles = ["Editorial", "Cinematic", "Clean", "Energetic", "Minimal"];
const purposes: ScenePurpose[] = ["Hook", "Story", "Product", "Benefit", "Proof", "CTA", "Step"];
const visualChoices = [...new Set(demoScenes.map((scene) => scene.visual))];

type Stage = "website" | "storyboard" | "render" | "result";

function formatSrtTime(seconds: number) {
  const totalMilliseconds = Math.round(seconds * 1000);
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const wholeSeconds = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")},${String(milliseconds).padStart(3, "0")}`;
}

function buildSrt(scenes: StoryScene[]) {
  let offset = 0;
  return scenes.map((scene, index) => {
    const start = formatSrtTime(offset);
    offset += scene.duration;
    const end = formatSrtTime(offset);
    return `${index + 1}\n${start} --> ${end}\n${scene.voiceover || scene.headline}`;
  }).join("\n\n");
}

interface CreateStudioProps {
  locale?: Locale;
  initialUrl?: string;
  initialSettings?: Partial<VideoSettings>;
}

export function CreateStudio({ locale = "en", initialUrl = "", initialSettings = {} }: CreateStudioProps) {
  const text = getCopy(locale).create;
  const purposeLabels = text.sceneLabels;
  const styleLabels = text.styles;
  const visualDirectionLabels = locale === "no"
    ? ["Produktbilder med ro", "Tydelige produktbilder", "En luftig reisefortelling", "Varme nærbilder", "En historie som føles som merkevaren"]
    : ["Thoughtful product close-ups", "Clear, focused scenes", "A story with room to breathe", "Warm, sensory moments", "A story that feels like your brand"];
  const visualDirectionKeys = ["Editorial product film", "Clean product-led motion", "Atmospheric destination story", "Warm sensory close-ups", "Editorial brand story"];
  const visualDirectionLabel = (style: string) => visualDirectionLabels[visualDirectionKeys.indexOf(style)] ?? style;
  const pacingLabels = locale === "no" ? { measured: "Rolig", balanced: "Jevnt", fast: "Raskt" } : { measured: "Unhurried", balanced: "Easygoing", fast: "Lively" };
  const transitions = locale === "no" ? ["Rolig åpning", "Mykt klipp", "Matchklipp", "Forsiktig panorering", "Overtoning", "Fade ut"] : ["Slow reveal", "Soft cut", "Match cut", "Gentle pan", "Dissolve", "Fade out"];
  const [url, setUrl] = useState(initialUrl);
  const [analysisError, setAnalysisError] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [stage, setStage] = useState<Stage>("website");
  const [analysis, setAnalysis] = useState<SiteAnalysis | null>(null);
  const [creativeBrief, setCreativeBrief] = useState<CreativeBrief | null>(null);
  const [filmMode, setFilmMode] = useState<FilmMode>(initialSettings.mode ?? "advert");
  const [durationWasChosen, setDurationWasChosen] = useState(initialSettings.duration !== undefined);
  const [showTextOnScreen, setShowTextOnScreen] = useState(initialSettings.showTextOnScreen ?? true);
  const [scenes, setScenes] = useState<StoryScene[]>(demoScenes);
    const [settings, setSettings] = useState<VideoSettings>({ ...defaultSettings, ...initialSettings, language: locale === "no" ? "Norsk" : "English", voice: locale === "no" ? text.voices.no[0] : defaultSettings.voice, mode: initialSettings.mode ?? "advert", showTextOnScreen: initialSettings.showTextOnScreen ?? true });
  const [editingScene, setEditingScene] = useState<string | null>(null);
  const [stockScene, setStockScene] = useState<string | null>(null);
  const [copyTone, setCopyTone] = useState<"auto" | "warm" | "bluesy" | "playful" | "elegant">("auto");
  const [rewriting, setRewriting] = useState(false);
  const [fillingVisuals, setFillingVisuals] = useState(false);
  const [stockSources, setStockSources] = useState<{ pixabay: boolean; unsplash: boolean; pexels: boolean } | null>(null);
  const [useVideo, setUseVideo] = useState(true);
  const [replaceSitePictures, setReplaceSitePictures] = useState(false);
  const [autoFill, setAutoFill] = useState(true);
  const [fillNote, setFillNote] = useState("");
  const [stockHealth, setStockHealth] = useState<Record<string, { configured: boolean; ok: boolean; error?: string }> | null>(null);
  const [recommendation, setRecommendation] = useState<{ seconds: number; keyPoints: number; mode: FilmMode } | null>(null);
  const [leftOut, setLeftOut] = useState<string[]>([]);
  const [lengthChosen, setLengthChosen] = useState(false);
  useEffect(() => {
    void fetch("/api/stock?health=1").then((response) => response.json()).then((data: { sources?: { pixabay: boolean; unsplash: boolean; pexels: boolean }; health?: Record<string, { configured: boolean; ok: boolean; error?: string }> }) => {
      if (data.health) {
        setStockHealth(data.health);
        // only libraries that actually answer are used for the automatic fill
        setStockSources({ pixabay: Boolean(data.health.pixabay?.ok), pexels: Boolean(data.health.pexels?.ok), unsplash: Boolean(data.health.unsplash?.ok) });
      } else if (data.sources) setStockSources(data.sources);
    }).catch(() => {});
  }, []);
  const [project, setProject] = useState<VideoProject | null>(null);
  const [studioTab, setStudioTab] = useState<StudioTab>("film");
  const [renderPercent, setRenderPercent] = useState(0);
  const [renderError, setRenderError] = useState("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const renderAbort = useRef<AbortController | null>(null);
  useEffect(() => () => { renderAbort.current?.abort(); }, []);
  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl); }, [videoUrl]);
  const musicDirection = creativeBrief?.brand
    ? locale === "no"
      ? ({ saas: "Minimal elektronisk: rolig, tydelig og moderne.", restaurant: "Varm og organisk lyd med god plass til fortellerstemmen.", travel: "Luftig og rolig lyd som gir rom til bildene.", ecommerce: "Moderne og nær lyd som løfter produktdetaljene.", service: "Avmålt og trygg lyd som holder fokus på stemmen.", content: "Nær og menneskelig lyd med lite konkurranse fra stemmen.", other: "Rolig, moderne lyd som følger tonen i innholdet." } as Record<string, string>)[analysis?.brandProfile?.category ?? "other"]
      : creativeBrief.suggestedMusicDirection
    : text.noLicensedMusic;

  function updateSetting<Key extends keyof VideoSettings>(key: Key, value: VideoSettings[Key]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function selectDuration(duration: number) {
    setDurationWasChosen(true);
    setLengthChosen(true);
    updateSetting("duration", duration);
    if (!analysis) return;
    const brief = createCreativeBrief(analysis, { mode: filmMode, targetDuration: duration });
    const storyboard = buildStoryboard(analysis, brief, { mode: filmMode, locale, targetDuration: duration });
    setCreativeBrief(brief);
    setScenes(storyboard.scenes);
    updateSetting("duration", storyboard.totalDuration);
  }

  // Optional: Claude tightens the wording (never adding facts). Silent when no API key is configured or the guard rejects a line.
  async function polishInBackground(list: StoryScene[], site: SiteAnalysis, tone = copyTone, force = false, mode: FilmMode = filmMode): Promise<StoryScene[]> {
    try {
      const source = [site.title, site.description, ...(site.headings ?? []), ...(site.subheadings ?? []), ...(site.steps ?? []).map((step) => `${step.title} ${step.description}`), (site.visibleText ?? "").slice(0, 2500)].join("\n");
      const response = await fetch("/api/copy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task: "polish", tone, mode, brand: site.brand, source, scenes: list.map((scene, index) => ({ id: scene.id, purpose: scene.purpose, headline: scene.headline, supportingText: scene.supportingText, locked: index === 0 || index === list.length - 1 })) }),
      });
      if (!response.ok) return list;
      const data = await response.json() as { scenes?: Array<{ id: string; headline: string; supportingText: string; emphasis?: string[]; visualQuery?: string }> };
      const polished = data.scenes;
      if (!polished) return list;
      setScenes((current) => current.map((scene) => {
        const next = polished.find((item) => item.id === scene.id);
        const before = list.find((item) => item.id === scene.id);
        // never overwrite text the user has already edited
        return next && before && (force || (scene.headline === before.headline && scene.supportingText === before.supportingText)) ? { ...scene, headline: next.headline, supportingText: next.supportingText, typography: { emphasis: next.emphasis ?? scene.typography?.emphasis ?? [] }, visualQuery: next.visualQuery ?? scene.visualQuery } : scene;
      }));
      return list.map((scene) => {
        const next = polished.find((item) => item.id === scene.id);
        return next ? { ...scene, headline: next.headline, supportingText: next.supportingText, typography: { emphasis: next.emphasis ?? scene.typography?.emphasis ?? [] }, visualQuery: next.visualQuery ?? scene.visualQuery } : scene;
      });
    } catch {
      // keep the template wording
      return list;
    }
  }

  async function analyzeUrl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAnalysis(filmMode);
  }

  async function runAnalysis(mode: FilmMode) {
    setFilmMode(mode);
    setAnalysisError("");
    setIsAnalyzing(true);
    try {
      const response = await fetch("/api/website/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url,
          mode,
          duration: lengthChosen ? settings.duration : undefined, // untouched length = the engine's recommendation for this page
          platform: settings.platformPresetIds?.[0] ?? "youtube",
          language: settings.language,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setAnalysisError(typeof result.error?.message === "string" ? result.error.message : text.urlHint);
        return;
      }
      const nextAnalysis = result.analysis as SiteAnalysis;
      const nextBrief = result.brief as CreativeBrief;
      const nextScenes = result.storyboard.scenes as StoryScene[];
      setAnalysis(nextAnalysis);
      setCreativeBrief(nextBrief);
      setScenes(nextScenes);
      setRecommendation(result.recommendation ?? null);
      setLeftOut(result.storyboard?.leftOut ?? []);
      const sourcesReady = autoFill && stockSources && (stockSources.pixabay || stockSources.pexels || stockSources.unsplash);
      // Claude rewrites the text first, so the pictures are searched for what each scene finally says
      void polishInBackground(nextScenes, nextAnalysis, copyTone, false, mode).then((merged) => { if (sourcesReady) void fillVisualsFromStock(merged); });
      setSettings((current) => ({
        ...current,
        duration: result.storyboard.totalDuration,
        musicTrackId: result.music[0]?.track?.id ?? null,
      }));
      setDurationWasChosen(true);
      setStage("storyboard");
    } catch {
      setAnalysisError(text.urlHint);
    } finally {
      setIsAnalyzing(false);
    }
  }

  function showSampleStory(sample: string) {
    const baseAnalysis = buildMockAnalysis(`https://${sample}`, locale);
    const sourcedAnalysis: SiteAnalysis = {
      ...baseAnalysis,
      source: {
        submittedUrl: baseAnalysis.url,
        finalUrl: baseAnalysis.url,
        fetchedAt: new Date().toISOString(),
        mode: "mock",
      },
    };
    const enrichedAnalysis = { ...sourcedAnalysis, brandProfile: detectBrandProfile(sourcedAnalysis) };
    const suggestedDuration = durationWasChosen
      ? settings.duration
      : filmMode === "instruction"
        ? recommendInstructionDuration(sourcedAnalysis.steps?.length ?? sourcedAnalysis.headings?.length ?? 1, locale).seconds
        : settings.duration;
    const brief = createCreativeBrief(enrichedAnalysis, { mode: filmMode, targetDuration: suggestedDuration });
    const storyboard = buildStoryboard(enrichedAnalysis, brief, { mode: filmMode, locale, targetDuration: suggestedDuration });
    const suggestedTrack = recommendMusic({ analysis: enrichedAnalysis, brief, duration: storyboard.totalDuration, platform: "youtube", mode: filmMode, style: settings.style })[0]?.track;

    setUrl(baseAnalysis.url);
    setAnalysis(enrichedAnalysis);
    setCreativeBrief(brief);
    setScenes(storyboard.scenes);
    setSettings((current) => ({ ...current, mode: filmMode, showTextOnScreen, duration: storyboard.totalDuration, language: locale === "no" ? "Norsk" : current.language, voice: locale === "no" ? text.voices.no[0] : current.voice }));
      setSettings((current) => ({ ...current, mode: filmMode, showTextOnScreen, duration: storyboard.totalDuration, musicTrackId: suggestedTrack?.id ?? null, language: locale === "no" ? "Norsk" : current.language, voice: locale === "no" ? text.voices.no[0] : current.voice }));
    setStage("storyboard");
  }

  // Adds a point the engine left out as a new scene just before the closing one (the film gets longer by what it needs to read).
  function addPointAsScene(point: string) {
    setScenes((current) => {
      const template = current[Math.max(0, current.length - 2)] ?? current[0];
      if (!template) return current;
      const fresh: StoryScene = { ...template, id: crypto.randomUUID(), purpose: "Benefit", headline: point.length > 70 ? `${point.slice(0, 67)}…` : point, supportingText: "", voiceover: point, duration: 5, visualSource: "website-image", typography: { emphasis: [] }, videoUrl: undefined, credit: undefined, noOverlay: undefined };
      const next = [...current.slice(0, -1), fresh, current[current.length - 1]];
      const { durations } = fitDurations(next.map((scene) => readingSeconds(`${scene.headline} ${scene.supportingText}`)), settings.duration);
      return next.map((scene, index) => ({ ...scene, duration: durations[index] }));
    });
  }

  function changeScene(id: string, patch: Partial<StoryScene>) {
    setScenes((current) => current.map((scene) => scene.id === id ? { ...scene, ...patch } : scene));
  }

  function suggestQuery(scene: StoryScene) {
    const words = scene.headline.split(/\s+/).map((word) => word.replace(/[^\p{L}]/gu, "")).filter((word) => word.length >= 4).slice(0, 3);
    return words.join(" ") || analysis?.brand || "";
  }

  // Adds pictures and video from every connected library (Pixabay, Pexels, Unsplash). The site's own photos stay unless you ask to replace them.
  async function fillVisualsFromStock(list: StoryScene[] = scenes) {
    setFillingVisuals(true);
    setFillNote("");
    let clips = 0;
    let pictures = 0;
    let swapped = 0;
    const used = new Set<string>();
    for (const scene of list) {
      if (!scene.visualQuery || scene.graphic) continue;
      // A picture with its own big lettering never gets our text on top: it is swapped for library footage.
      const lettered = Boolean(scene.visual) && !scene.videoUrl && await imageHasLettering(scene.visual, analysis?.url ?? "");
      if (scene.purpose === "CTA" && !lettered) continue;
      if (scene.visualSource === "website-image" && !replaceSitePictures && !lettered) continue;
      if (lettered) swapped += 1;
      try {
        let item: StockItem | undefined;
        if (useVideo && clips < 3) {
          const response = await fetch(`/api/stock?q=${encodeURIComponent(scene.visualQuery)}&kind=video&lang=en`);
          const data = await response.json() as { items?: StockItem[] };
          item = data.items?.find((candidate) => candidate.width >= candidate.height && !used.has(candidate.url));
          if (item) clips += 1;
        }
        if (!item) {
          const response = await fetch(`/api/stock?q=${encodeURIComponent(scene.visualQuery)}&kind=image&lang=en`);
          const data = await response.json() as { items?: StockItem[] };
          item = data.items?.find((candidate) => candidate.width >= candidate.height && !used.has(candidate.url));
          if (item) pictures += 1;
        }
        if (item) { used.add(item.url); pickStock(scene.id, item); }
      } catch {
        // leave the scene as it was
      }
    }
    setFillNote(locale === "no" ? `La til ${clips} videoklipp og ${pictures} bilder fra arkivene${swapped ? ` (${swapped} bilder med egen stor tekst ble byttet ut)` : ""}.` : `Added ${clips} video clips and ${pictures} pictures from the libraries${swapped ? ` (${swapped} pictures with their own big lettering were swapped out)` : ""}.`);
    setFillingVisuals(false);
  }

  function pickStock(id: string, item: StockItem) {
    changeScene(id, item.kind === "video"
      ? { graphic: undefined, visual: item.previewUrl || item.url, videoUrl: item.url, visualSource: "not-detected", credit: item.source === "pexels" ? `${item.credit} / Pexels` : undefined }
      : { graphic: undefined, visual: item.url, videoUrl: undefined, visualSource: "not-detected", credit: item.source === "unsplash" || item.source === "pexels" ? `${item.credit} / ${item.source === "unsplash" ? "Unsplash" : "Pexels"}` : undefined });
    if (item.downloadLocation) void fetch("/api/stock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ downloadLocation: item.downloadLocation }) }).catch(() => {});
    setStockScene(null);
  }

  function changeVisual(id: string) {
    setScenes((current) => current.map((scene) => {
      if (scene.id !== id) return scene;
      const nextIndex = (visualChoices.indexOf(scene.visual) + 1) % visualChoices.length;
      return { ...scene, graphic: undefined, visual: visualChoices[nextIndex] };
    }));
  }

  function moveScene(index: number, offset: number) {
    setScenes((current) => {
      const target = index + offset;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function beginRender() {
    if (!analysis) return;
    const selectedTrack = settings.musicTrackId ? demoMusicCatalog.find((track) => track.id === settings.musicTrackId) : undefined;
    const fittedMusic = selectedTrack ? fitMusicToVideo(selectedTrack.duration, settings.duration) : undefined;
    const currentAudioMix = settings.audioMix ?? defaultAudioMix;
    const nextProject: VideoProject = {
      id: crypto.randomUUID(),
      title: `${analysis.brand} — ${filmMode === "instruction" ? (locale === "no" ? "instruksjonsfilm" : "how-to film") : (locale === "no" ? "reklamefilm" : "advertising film")}`,
      url: analysis.url,
      createdAt: new Date().toISOString(),
      analysis,
      scenes,
      settings: {
        ...settings,
        mode: filmMode,
        showTextOnScreen,
        copyTone: copyTone === "auto" ? undefined : copyTone,
        audioMix: {
          ...currentAudioMix,
          music: { ...currentAudioMix.music, fadeOutSeconds: fittedMusic?.fadeOutSeconds ?? currentAudioMix.music.fadeOutSeconds },
          jingle: filmMode === "advert" ? currentAudioMix.jingle : { ...currentAudioMix.jingle, volume: 0, muted: true },
        },
      },
      creativeBrief: creativeBrief ?? undefined,
      version: 1,
    };
    saveProject(nextProject);
    setProject(nextProject);
    setRenderError("");
    setRenderPercent(0);
    setVideoUrl(null);
    setStage("render");
    if (!browserRenderSupported()) { setRenderError(text.unsupported); return; }
    const controller = new AbortController();
    renderAbort.current = controller;
    try {
      const result = await renderProjectInBrowser(nextProject, setRenderPercent, controller.signal);
      await saveVideo(nextProject.id, result.blob);
      setVideoUrl(URL.createObjectURL(result.blob));
      setRenderError(result.audioWarning ?? "");
      setStage("result");
    } catch (error) {
      if (controller.signal.aborted) return;
      setRenderError(error instanceof Error ? error.message : text.renderFailed);
    }
  }

  const labels: Stage[] = ["website", "storyboard", "render", "result"];
  const stageNames = text.stageNames;
  const stageIndex = labels.indexOf(stage);
  const actualDuration = scenes.reduce((sum, scene) => sum + scene.duration, 0);
  const suggestion = filmMode === "instruction"
    ? `${settings.duration} ${text.seconds}. ${locale === "no" ? "Tilgjengelige steg bestemmer detaljnivået; fortellerstemmen får rolig plass." : "Available steps determine the detail; leave room for voiceover."}`
    : locale === "no"
      ? `${settings.duration} ${text.seconds}. Scenene følger unikt innhold fra nettsiden; musikken følger merkevarens tone.`
      : `${settings.duration} ${text.seconds}. Scene count and detail follow distinct evidence from the website.`;
  const requestedDuration = creativeBrief?.targetDuration ?? settings.duration;
  const storyboardRationale = actualDuration < requestedDuration
    ? locale === "no"
      ? `Nettsiden støtter ${actualDuration} sekunder med unikt innhold; historien ble kortet ned fra ${requestedDuration} sekunder for å unngå gjentakelser.`
      : `The website supports ${actualDuration} seconds of distinct content; the story was shortened from ${requestedDuration} seconds to avoid repetition.`
    : creativeBrief?.durationGuidance ?? recommendInstructionDuration(scenes.length || 4, locale).rationale;

  return (
    <div className="create-page">
      <div className="page-heading">
        <div><span className="eyebrow">{locale === "no" ? "Filmverksted / " : "Your film / "}{stageNames[stageIndex]}</span><h1>{text.titles[stage]}</h1><p>{text.descriptions[stage]}</p></div>
        {stage === "result" && <Link href={localizedPath(locale, "/projects")} className="button button-light button-small">{locale === "no" ? "Se utkastene" : "See my projects"} <span aria-hidden="true">↗</span></Link>}
      </div>

      {analysis && <StudioTabs tab={studioTab} onChange={setStudioTab} locale={locale} />}
      {analysis && studioTab === "posters" && <PosterStudio analysis={analysis} project={project} locale={locale} mode={filmMode} />}
      <div style={{ display: analysis && studioTab === "posters" ? "none" : "contents" }}>
      {stage !== "website" && <div className="stepper" aria-label={locale === "no" ? "Fremdrift" : "Your progress"}>
        {stageNames.map((name, index) => <button key={name} className={index === stageIndex ? "active" : ""} onClick={() => { if (index < stageIndex && index < 2) setStage(index === 0 ? "website" : "storyboard"); }} aria-current={index === stageIndex ? "step" : undefined}><span className="stepper-num">{index < stageIndex ? "✓" : `0${index + 1}`}</span>{name}</button>)}
      </div>}

      {stage === "website" && <div className="studio-grid">
        <section className="panel panel-pad">
          <div className="panel-head"><div><h2>{text.websitePanel}</h2><small>{text.websiteHelp}</small></div><span className="tag">{text.sampleStory}</span></div>
          <form className="url-form" onSubmit={analyzeUrl}><label className="url-field"><span className="sr-only">{locale === "no" ? "Nettsideadresse" : "Website URL"}</span><input type="url" inputMode="url" autoComplete="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="yourwebsite.com" disabled={isAnalyzing} aria-describedby="url-hint" /></label><button className="button button-light button-small" type="submit" disabled={isAnalyzing || !url.trim()}>{isAnalyzing ? (locale === "no" ? "Analyserer…" : "Analyzing…") : (locale === "no" ? "Analyser nettside" : "Analyze website")}</button></form>
          <div className="field-caption" id="url-hint">{text.urlHint}</div>
          {analysisError && <p className="field-caption" role="alert">{analysisError}</p>}
          <div className="mode-control" role="group" aria-label={locale === "no" ? "Velg filmtype" : "Choose film type"}><button className={filmMode === "advert" ? "selected" : ""} aria-pressed={filmMode === "advert"} onClick={() => { setFilmMode("advert"); setDurationWasChosen(false); updateSetting("mode", "advert"); updateSetting("duration", 30); }}>{text.modes.advert}</button><button className={filmMode === "instruction" ? "selected" : ""} aria-pressed={filmMode === "instruction"} onClick={() => { const duration = recommendInstructionDuration(4, locale).seconds; setFilmMode("instruction"); setDurationWasChosen(false); updateSetting("mode", "instruction"); updateSetting("duration", duration); }}>{text.modes.instruction}</button></div>
          <label className="settings-section"><input type="checkbox" checked={showTextOnScreen} onChange={(event) => { setShowTextOnScreen(event.target.checked); updateSetting("showTextOnScreen", event.target.checked); }} /> {text.textToggle}: {showTextOnScreen ? text.textOn : text.textOff}</label>
          <p className="field-caption">{suggestion}</p>
          <div className="sample-links"><span>{text.samples}</span>{["northline.studio", "quietform.co", "goodfield.market"].map((sample) => <button key={sample} type="button" onClick={() => showSampleStory(sample)}>{sample}</button>)}</div>
        </section>
      </div>}

      {stage === "storyboard" && analysis && (() => {
        const guess = classifyIntent(analysis);
        if (guess.intent === filmMode || guess.confidence < 0.6) return null;
        const toInstruction = guess.intent === "instruction";
        return <div className="panel panel-pad intent-hint" role="note"><p>{locale === "no" ? (toInstruction ? "Denne siden ser ut til å forklare noe steg for steg. En instruksjonsfilm kan passe bedre." : "Denne siden ser ut til å selge noe. En reklamefilm kan passe bedre.") : (toInstruction ? "This page looks like it explains a process. An instructional film may suit it better." : "This page looks like it sells something. A promo film may suit it better.")}</p><button type="button" className="button button-light button-small" disabled={isAnalyzing} onClick={() => void runAnalysis(guess.intent)}>{locale === "no" ? (toInstruction ? "Lag instruksjonsfilm" : "Lag reklamefilm") : (toInstruction ? "Make an instructional film" : "Make a promo film")}</button></div>;
      })()}

      {stage === "storyboard" && analysis && <div className="studio-grid">
        <section className="panel panel-pad">
          <div className="panel-head"><div><h2>{text.titles.storyboard}</h2><small>{scenes.length} {text.scenes} · {scenes.reduce((sum, scene) => sum + scene.duration, 0)} {text.seconds} · {text.sampleLabel}</small></div><button className="button button-light button-small" onClick={() => setStage("website")}>{locale === "no" ? "Tilbake" : "Back"}</button></div>
          <p className="field-caption">{storyboardRationale}</p>
          <div className="website-summary"><div className="website-photo" role="img" aria-label={locale === "no" ? "Eksempel på nettbutikk" : "A sample website"}/><div className="website-meta"><span className="eyebrow">{text.summary}</span><h3>{analysis.title}</h3><p>{analysis.description}</p><div className="tag-list">{analysis.sellingPoints.map((point) => <span className="tag" key={point}>{point}</span>)}</div></div></div>
          {creativeBrief && <div className="brief-summary"><div className="brief-title"><span className="eyebrow">{text.firstDirection}</span><span className="tag">{text.startingPoint}</span></div><p><b>{creativeBrief.coreMessage}</b></p><div className="tag-list"><span className="tag">{visualDirectionLabel(creativeBrief.visualStyle)}</span><span className="tag">{pacingLabels[creativeBrief.suggestedPacing]}</span>{creativeBrief.tone.slice(0, 2).map((tone) => <span className="tag" key={tone}>{tone}</span>)}</div><small>{text.drawnFrom}: {creativeBrief.evidence.join(" · ") || (locale === "no" ? "Nettsiden" : "Your website")}</small></div>}
          <div className="scene-list">{scenes.map((scene, index) => <article className="scene-row" key={scene.id}>
            <div className="scene-art" style={{ backgroundImage: `linear-gradient(0deg,#15231a44,transparent),url("${scene.visual}")` }} aria-label={locale === "no" ? `Bilde for scene ${index + 1}` : `Visual for scene ${index + 1}`} />
            <div className="scene-copy"><div className="scene-topline"><b>{String(index + 1).padStart(2, "0")}</b><select aria-label={locale === "no" ? `Hva scene ${index + 1} viser` : `What scene ${index + 1} shows`} value={scene.purpose} onChange={(event) => changeScene(scene.id, { purpose: event.target.value as ScenePurpose })}>{purposes.map((purpose) => <option key={purpose} value={purpose}>{purposeLabels[purpose]}</option>)}</select></div>
              {editingScene === scene.id ? <><input className="field-control" aria-label={text.wordsOnScreen} value={scene.headline} onChange={(event) => changeScene(scene.id, { headline: event.target.value })}/><input className="field-control" aria-label={text.moreDetail} value={scene.supportingText} onChange={(event) => changeScene(scene.id, { supportingText: event.target.value })}/><textarea className="text-control" aria-label={text.wordsToSay} value={scene.voiceover} onChange={(event) => changeScene(scene.id, { voiceover: event.target.value })}/><div className="scene-edit-options"><label>{text.connectScenes}<select aria-label={text.connectScenes} value={scene.transition} onChange={(event) => changeScene(scene.id, { transition: event.target.value })}>{transitions.map((transition) => <option key={transition}>{transition}</option>)}</select></label><button className="button button-light button-small" onClick={() => changeVisual(scene.id)}>{text.tryImage} ↻</button><button className="button button-light button-small" type="button" onClick={() => changeScene(scene.id, { graphic: scene.graphic ? undefined : detectGraphic(scene.headline, scene.supportingText) ?? { kind: "type" } })}>{scene.graphic ? (locale === "no" ? "Bruk bilde" : "Use a picture") : (locale === "no" ? "Tegn scenen" : "Draw this scene")}</button><button className="button button-light button-small" type="button" onClick={() => setStockScene(stockScene === scene.id ? null : scene.id)}>{locale === "no" ? "Arkiv: bilder og video" : "Library: pictures and video"}</button></div>{stockScene === scene.id && <StockPicker locale={locale} initialQuery={scene.visualQuery ?? suggestQuery(scene)} onPick={(item) => pickStock(scene.id, item)} onClose={() => setStockScene(null)} />}<button className="text-link scene-done" onClick={() => setEditingScene(null)}>{text.saveChanges}</button></> : <><h4>{scene.headline}</h4>{showTextOnScreen && <p>{scene.supportingText}</p>}<p>{scene.voiceover}</p><button className="text-link scene-edit" onClick={() => setEditingScene(scene.id)}>{text.changeScene}</button></>}
            </div>
            <div className="scene-controls"><div><button title={locale === "no" ? "Flytt scenen opp" : "Move scene up"} aria-label={locale === "no" ? "Flytt scenen opp" : "Move scene up"} onClick={() => moveScene(index, -1)}>↑</button><button title={locale === "no" ? "Flytt scenen ned" : "Move scene down"} aria-label={locale === "no" ? "Flytt scenen ned" : "Move scene down"} onClick={() => moveScene(index, 1)}>↓</button></div><select aria-label={locale === "no" ? `Lengde på scene ${index + 1}` : `Duration of scene ${index + 1}`} value={scene.duration} onChange={(event) => changeScene(scene.id, { duration: Number(event.target.value) })}>{[3,4,5,6,7,8,10,12,15,20,25,30].map((duration) => <option key={duration} value={duration}>{duration} {text.seconds}</option>)}</select><div><button title={locale === "no" ? "Kopier scenen" : "Duplicate scene"} aria-label={locale === "no" ? "Kopier scenen" : "Duplicate scene"} onClick={() => { const duplicate = { ...scene, id: crypto.randomUUID() }; setScenes((current) => [...current.slice(0, index + 1), duplicate, ...current.slice(index + 1)]); }}>⧉</button><button title={locale === "no" ? "Fjern scenen" : "Remove scene"} aria-label={locale === "no" ? "Fjern scenen" : "Remove scene"} onClick={() => setScenes((current) => current.filter((item) => item.id !== scene.id))}>×</button></div></div>
          </article>)}</div>
          <button className="scene-add" onClick={() => setScenes((current) => [...current, createScene(locale)])}>+ {text.addScene}</button>
        </section>
        <aside className="panel settings">
          <div className="panel-pad"><div className="panel-head"><h3>{text.shapeFilm}</h3><small>{text.makeItYours}</small></div></div>
          <div className="settings-section"><label>{text.shareWhere}</label><div className="platform-choices">{platformPresets.map((preset) => <label key={preset.id} className={settings.platformPresetIds?.includes(preset.id) ? "checked" : ""}><input type="checkbox" checked={settings.platformPresetIds?.includes(preset.id) ?? false} onChange={(event) => { const current = settings.platformPresetIds ?? []; updateSetting("platformPresetIds", event.target.checked ? [...current, preset.id] : current.filter((id) => id !== preset.id)); if (event.target.checked) updateSetting("format", preset.format); }}/><span><b>{preset.platform}</b><small>{preset.width} × {preset.height}</small></span></label>)}</div></div>
          <div className="settings-section"><label>{text.chooseFrame}</label><div className="choice-row">{formats.map((format) => <button key={format} className={`choice ${settings.format === format ? "selected" : ""}`} onClick={() => updateSetting("format", format)}>{format}</button>)}</div></div>
          <div className="settings-section"><label>{text.durationQuestion}</label><div className="choice-row">{durationOptions.map((duration) => <button key={duration} className={`choice ${settings.duration === duration ? "selected" : ""}`} onClick={() => selectDuration(duration)}>{recommendation?.seconds === duration ? "★ " : ""}{duration} {text.seconds}</button>)}</div>{recommendation && <p className="field-caption">{locale === "no" ? `★ Anbefalt for denne siden: ${recommendation.seconds} sekunder (${recommendation.keyPoints} ${recommendation.mode === "instruction" ? "steg" : "sterke nøkkelpunkter"}).` : `★ Recommended for this page: ${recommendation.seconds} seconds (${recommendation.keyPoints} ${recommendation.mode === "instruction" ? "steps" : "strong key points"}).`}</p>}{leftOut.length > 0 && <div className="left-out"><p className="field-caption">{locale === "no" ? "Flere sterke punkter vi fant, men ikke tok med:" : "More strong points we found but left out:"}</p>{leftOut.map((point) => <button key={point} type="button" className="choice" onClick={() => { addPointAsScene(point); setLeftOut((current) => current.filter((item) => item !== point)); }}>+ {point.length > 60 ? `${point.slice(0, 57)}…` : point}</button>)}</div>}</div>
          <div className="settings-section"><label><input type="checkbox" checked={showTextOnScreen} onChange={(event) => { setShowTextOnScreen(event.target.checked); updateSetting("showTextOnScreen", event.target.checked); }} /> {text.textToggle}</label></div>
          <div className="settings-section"><label>{locale === "no" ? "Tekststil" : "Writing style"}</label>
            <div className="choice-row">{([["auto", "Auto", "Auto"], ["warm", "Varm", "Warm"], ["bluesy", "Bluesy", "Bluesy"], ["playful", "Lekent", "Playful"], ["elegant", "Elegant", "Elegant"]] as const).map(([id, no, en]) => <button key={id} type="button" className={`choice ${copyTone === id ? "selected" : ""}`} aria-pressed={copyTone === id} onClick={() => setCopyTone(id)}>{locale === "no" ? no : en}</button>)}</div>
            <button type="button" className="button button-light button-small" disabled={rewriting || !analysis} onClick={async () => { if (!analysis) return; setRewriting(true); await polishInBackground(scenes, analysis, copyTone, true); setRewriting(false); }}>{rewriting ? (locale === "no" ? "Skriver…" : "Writing…") : (locale === "no" ? "Skriv teksten på nytt" : "Rewrite the text")}</button>
          </div>
          <div className="settings-section"><label>{locale === "no" ? "Tekstanimasjon" : "Text motion"}</label>
            <div className="choice-row">{([["calm", "Rolig", "Calm"], ["kinetic", "Kinetisk (ord for ord)", "Kinetic (word by word)"]] as const).map(([id, no, en]) => <button key={id} type="button" className={`choice ${(settings.typography ?? (settings.style === "Energetic" ? "kinetic" : "calm")) === id ? "selected" : ""}`} onClick={() => updateSetting("typography", id)}>{locale === "no" ? no : en}</button>)}</div>
          </div>
          <div className="settings-section"><label>{locale === "no" ? "Bilder og video fra arkivene" : "Pictures and video from the libraries"}</label>
            <p className="field-caption">{stockHealth ? ([["Pexels", "pexels"], ["Unsplash", "unsplash"], ["Pixabay", "pixabay"]] as const).map(([name, key]) => { const item = stockHealth[key]; return `${name} ${!item?.configured ? (locale === "no" ? "– ikke koblet" : "– not connected") : item.ok ? "✓" : `✗ ${item.error ?? ""}`}`; }).join("  ·  ") : "…"}</p>
            <label><input type="checkbox" checked={autoFill} onChange={(event) => setAutoFill(event.target.checked)} /> {locale === "no" ? "Fyll automatisk etter analysen" : "Fill automatically after the analysis"}</label>
            <label><input type="checkbox" checked={useVideo} onChange={(event) => setUseVideo(event.target.checked)} /> {locale === "no" ? "Bruk videoklipp (mer bevegelse)" : "Use video clips (more motion)"}</label>
            <label><input type="checkbox" checked={replaceSitePictures} onChange={(event) => setReplaceSitePictures(event.target.checked)} /> {locale === "no" ? "Bytt også sidens egne bilder" : "Replace the site's own pictures too"}</label>
            <button type="button" className="button button-light button-small" disabled={fillingVisuals} onClick={() => void fillVisualsFromStock()}>{fillingVisuals ? (locale === "no" ? "Henter bilder og video…" : "Finding pictures and video…") : (locale === "no" ? "Legg til bilder og video nå" : "Add pictures and video now")}</button>
            {fillNote && <p className="field-caption" role="status">{fillNote}</p>}
          </div>
          <div className="settings-section"><label><input type="checkbox" checked={settings.enhanceImages !== false} onChange={(event) => updateSetting("enhanceImages", event.target.checked)} /> {locale === "no" ? "Forbedre bildene (skarphet, lys og farger)" : "Enhance pictures (sharpness, light and colour)"}</label></div>
          <div className="settings-section"><label htmlFor="language">{text.language}</label><select id="language" value={settings.language} onChange={(event) => { const language = event.target.value; updateSetting("language", language); updateSetting("voice", language === "Norsk" ? text.voices.no[0] : text.voices.en[0]); }}>{text.languageOptions.map((language) => <option key={language}>{language}</option>)}</select></div>
          <div className="settings-section"><label htmlFor="voice">{text.voice}</label><select id="voice" value={settings.voice} onChange={(event) => updateSetting("voice", event.target.value)}>{(settings.language === "Norsk" ? text.voices.no : text.voices.en).map((voice) => <option key={voice}>{voice}</option>)}</select></div>
          <div className="settings-section"><label>{text.style}</label><div className="choice-row">{styles.map((style, index) => <button key={style} className={`choice ${settings.style === style ? "selected" : ""}`} onClick={() => updateSetting("style", style)}>{styleLabels[index]}</button>)}</div></div>
          <div className="settings-section" id="music"><MusicStudio locale={locale} mode={filmMode} scenes={scenes} analysis={analysis} brief={creativeBrief ?? { objective: "Present the clearest information found on the website.", durationMode: filmMode, targetDuration: settings.duration, durationGuidance: "Use the selected duration without repeating source content.", brand: analysis.brand, productOrService: "", valueProposition: analysis.description, targetAudience: [], coreMessage: analysis.description, keyBenefits: analysis.sellingPoints, tone: ["modern"], visualStyle: settings.style, suggestedHook: analysis.title, callToAction: "", suggestedPacing: "balanced", suggestedMusicDirection: "Modern", suggestedVoiceDirection: "Clear", recommendedPlatforms: [], evidence: [], confidence: "low" }} duration={settings.duration} selectedTrackId={settings.musicTrackId ?? null} onSelect={(trackId) => updateSetting("musicTrackId", trackId)}/></div>
          <div className="settings-section"><label>{text.musicFeel}</label><p>{musicDirection}</p><small>{text.noLicensedMusic}</small></div>
          <div className="settings-section mixer-section"><label>{text.adjustSound}</label>{([[text.voiceLevel, "voice", 0.8], [text.musicLevel, "music", 0.55], [text.sceneSounds, "sfx", 0.25]] as const).map(([label, key, defaultValue]) => <div className="mixer-row" key={key}><span>{label}</span><input aria-label={`${label} level`} type="range" min="0" max="1" step="0.05" value={settings.audioMix?.[key].volume ?? defaultValue} onChange={(event) => updateSetting("audioMix", { ...(settings.audioMix ?? { voice: { volume: 0.8, muted: false, fadeInSeconds: 0.8, fadeOutSeconds: 1.5, startSeconds: 0 }, music: { volume: 0.55, muted: false, fadeInSeconds: 0.8, fadeOutSeconds: 1.5, startSeconds: 0 }, sfx: { volume: 0.25, muted: false, fadeInSeconds: 0.8, fadeOutSeconds: 1.5, startSeconds: 0 }, jingle: { volume: 0.35, muted: false, fadeInSeconds: 0.8, fadeOutSeconds: 1.5, startSeconds: 0 }, duckMusicUnderVoice: true }), [key]: { ...(settings.audioMix?.[key] ?? { volume: defaultValue, muted: false, fadeInSeconds: 0.8, fadeOutSeconds: 1.5, startSeconds: 0 }), volume: Number(event.target.value) } })}/><b>{Math.round((settings.audioMix?.[key].volume ?? defaultValue) * 100)}%</b></div>)}{filmMode === "advert" && <div className="mixer-row"><span>{text.closingSound}</span><input aria-label={`${text.closingSound} level`} type="range" min="0" max="1" step="0.05" value={settings.audioMix?.jingle.volume ?? 0.35} onChange={(event) => updateSetting("audioMix", { ...(settings.audioMix ?? { voice: { volume: 0.8, muted: false, fadeInSeconds: 0.8, fadeOutSeconds: 1.5, startSeconds: 0 }, music: { volume: 0.55, muted: false, fadeInSeconds: 0.8, fadeOutSeconds: 1.5, startSeconds: 0 }, sfx: { volume: 0.25, muted: false, fadeInSeconds: 0.8, fadeOutSeconds: 1.5, startSeconds: 0 }, jingle: { volume: 0.35, muted: false, fadeInSeconds: 0.8, fadeOutSeconds: 1.5, startSeconds: 0 }, duckMusicUnderVoice: true }), jingle: { ...(settings.audioMix?.jingle ?? { volume: 0.35, muted: false, fadeInSeconds: 0.8, fadeOutSeconds: 1.5, startSeconds: 0 }), volume: Number(event.target.value) } })}/><b>{Math.round((settings.audioMix?.jingle.volume ?? 0.35) * 100)}%</b></div>}<small>{text.mixNote}</small></div>
          <div className="settings-footer"><button className="button" disabled={!scenes.length} onClick={() => void beginRender()}>{text.makeFilm} <span aria-hidden="true">→</span></button><p>{text.savedPreview}</p></div>
        </aside>
      </div>}

      {stage === "render" && <section className="panel render-card"><div className="render-mark" aria-hidden="true">S</div><span className="eyebrow">{text.renderEyebrow}</span><h2>{text.titles.render}</h2><p>{text.renderDescription}</p><div className="render-progress"><div className="progress-track"><span style={{ transform: `scaleX(${renderPercent / 100})`, animation: "none", transition: "transform .3s" }} /></div><div className="progress-stages"><span className={renderPercent > 0 ? "complete" : ""}>{text.story}</span><span className={renderPercent > 3 ? "complete" : ""}>{text.sound}</span><span className={renderPercent >= 100 ? "complete" : ""}>{text.firstLook} {renderPercent}%</span></div></div>{renderError ? <p className="field-caption render-note" role="alert">{text.renderFailed}: {renderError}</p> : <p className="field-caption render-note">{text.renderNote}</p>}<div className="result-actions">{renderError ? <button className="button" onClick={() => void beginRender()}>{text.renderRetry}</button> : null}<button className="button button-light" onClick={() => { renderAbort.current?.abort(); setStage("storyboard"); }}>{text.renderCancel}</button></div></section>}

      {stage === "result" && project && <div className="result-layout">
        <section className="panel result-frame"><div className="result-preview" style={videoUrl ? { background: "#000", minHeight: 0, padding: 0, aspectRatio: project.settings.format.replace(":", " / "), maxHeight: "72vh" } : undefined}>{videoUrl ? <video src={videoUrl} controls playsInline style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} /> : <div><h2>{project.scenes[0]?.headline ?? project.title}</h2><small>{project.analysis.brand.toUpperCase()} · {text.resultEyebrow}</small></div>}</div></section>
        <aside className="panel result-side"><span className="eyebrow">{text.resultEyebrow}</span><h3>{project.title}</h3><p>{project.url}</p><p>{text.draftNotice}</p><div className="result-actions">{videoUrl && <a className="button" href={videoUrl} download={`${project.analysis.brand}.mp4`}>{text.downloadMp4} <span aria-hidden="true">↓</span></a>}<button className="button" onClick={() => { const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }); const downloadUrl = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = downloadUrl; anchor.download = `${project.analysis.brand}-project.json`; anchor.click(); URL.revokeObjectURL(downloadUrl); }}>{text.downloadProject} <span aria-hidden="true">↓</span></button>{!project.settings.showTextOnScreen && <button className="button button-light" onClick={() => { const blob = new Blob([buildSrt(project.scenes)], { type: "text/plain;charset=utf-8" }); const downloadUrl = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = downloadUrl; anchor.download = `${project.analysis.brand}-subtitles.srt`; anchor.click(); URL.revokeObjectURL(downloadUrl); }}>{text.downloadSrt} <span aria-hidden="true">↓</span></button>}<button className="button button-light" onClick={() => navigator.clipboard?.writeText(project.url)}>{text.copyLink}</button><button className="button button-light" onClick={() => { setProject(null); setAnalysis(null); setUrl(""); setStage("website"); }}>{text.anotherDirection}</button></div><div className="result-details"><div><span>{text.length}</span><b>{project.settings.duration} {text.seconds}</b></div><div><span>{text.format}</span><b>{project.settings.format}</b></div><div><span>{text.feeling}</span><b>{project.settings.style}</b></div><div><span>{text.scenes}</span><b>{project.scenes.length}</b></div></div><Link href={localizedPath(locale, `/projects/${project.id}`)} className="text-link result-detail-link">{text.fullStory} →</Link></aside>
      </div>}

      {stage === "result" && project && <VersionsPanel project={project} locale={locale} />}
      </div>
    </div>
  );
}
