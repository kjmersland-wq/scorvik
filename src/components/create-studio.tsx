"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { createCreativeBrief, detectBrandProfile } from "@/lib/creative/create-brief";
import { buildStoryboard } from "@/lib/creative/storyboard-engine";
import { buildMockAnalysis, createScene, defaultSettings, demoScenes } from "@/lib/mock-data";
import { defaultAudioMix, fitMusicToVideo } from "@/lib/audio/mix";
import { saveProject } from "@/lib/projects";
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
  const [project, setProject] = useState<VideoProject | null>(null);
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
    updateSetting("duration", duration);
    if (!analysis) return;
    const brief = createCreativeBrief(analysis, { mode: filmMode, targetDuration: duration });
    const storyboard = buildStoryboard(analysis, brief, { mode: filmMode, locale, targetDuration: duration });
    setCreativeBrief(brief);
    setScenes(storyboard.scenes);
    updateSetting("duration", storyboard.totalDuration);
  }

  async function analyzeUrl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAnalysisError("");
    setIsAnalyzing(true);
    try {
      const response = await fetch("/api/website/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url,
          mode: filmMode,
          duration: filmMode === "instruction" && !durationWasChosen ? undefined : settings.duration,
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
    const recommendation = recommendInstructionDuration(sourcedAnalysis.steps?.length ?? 1, locale);
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

  function changeScene(id: string, patch: Partial<StoryScene>) {
    setScenes((current) => current.map((scene) => scene.id === id ? { ...scene, ...patch } : scene));
  }

  function changeVisual(id: string) {
    setScenes((current) => current.map((scene) => {
      if (scene.id !== id) return scene;
      const nextIndex = (visualChoices.indexOf(scene.visual) + 1) % visualChoices.length;
      return { ...scene, visual: visualChoices[nextIndex] };
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

  function beginRender() {
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
    setStage("result");
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

      {stage === "storyboard" && analysis && <div className="studio-grid">
        <section className="panel panel-pad">
          <div className="panel-head"><div><h2>{text.titles.storyboard}</h2><small>{scenes.length} {text.scenes} · {scenes.reduce((sum, scene) => sum + scene.duration, 0)} {text.seconds} · {text.sampleLabel}</small></div><button className="button button-light button-small" onClick={() => setStage("website")}>{locale === "no" ? "Tilbake" : "Back"}</button></div>
          <p className="field-caption">{storyboardRationale}</p>
          <div className="website-summary"><div className="website-photo" role="img" aria-label={locale === "no" ? "Eksempel på nettbutikk" : "A sample website"}/><div className="website-meta"><span className="eyebrow">{text.summary}</span><h3>{analysis.title}</h3><p>{analysis.description}</p><div className="tag-list">{analysis.sellingPoints.map((point) => <span className="tag" key={point}>{point}</span>)}</div></div></div>
          {creativeBrief && <div className="brief-summary"><div className="brief-title"><span className="eyebrow">{text.firstDirection}</span><span className="tag">{text.startingPoint}</span></div><p><b>{creativeBrief.coreMessage}</b></p><div className="tag-list"><span className="tag">{visualDirectionLabel(creativeBrief.visualStyle)}</span><span className="tag">{pacingLabels[creativeBrief.suggestedPacing]}</span>{creativeBrief.tone.slice(0, 2).map((tone) => <span className="tag" key={tone}>{tone}</span>)}</div><small>{text.drawnFrom}: {creativeBrief.evidence.join(" · ") || (locale === "no" ? "Nettsiden" : "Your website")}</small></div>}
          <div className="scene-list">{scenes.map((scene, index) => <article className="scene-row" key={scene.id}>
            <div className="scene-art" style={{ backgroundImage: `linear-gradient(0deg,#15231a44,transparent),url("${scene.visual}")` }} aria-label={locale === "no" ? `Bilde for scene ${index + 1}` : `Visual for scene ${index + 1}`} />
            <div className="scene-copy"><div className="scene-topline"><b>{String(index + 1).padStart(2, "0")}</b><select aria-label={locale === "no" ? `Hva scene ${index + 1} viser` : `What scene ${index + 1} shows`} value={scene.purpose} onChange={(event) => changeScene(scene.id, { purpose: event.target.value as ScenePurpose })}>{purposes.map((purpose) => <option key={purpose} value={purpose}>{purposeLabels[purpose]}</option>)}</select></div>
              {editingScene === scene.id ? <><input className="field-control" aria-label={text.wordsOnScreen} value={scene.headline} onChange={(event) => changeScene(scene.id, { headline: event.target.value })}/><input className="field-control" aria-label={text.moreDetail} value={scene.supportingText} onChange={(event) => changeScene(scene.id, { supportingText: event.target.value })}/><textarea className="text-control" aria-label={text.wordsToSay} value={scene.voiceover} onChange={(event) => changeScene(scene.id, { voiceover: event.target.value })}/><div className="scene-edit-options"><label>{text.connectScenes}<select aria-label={text.connectScenes} value={scene.transition} onChange={(event) => changeScene(scene.id, { transition: event.target.value })}>{transitions.map((transition) => <option key={transition}>{transition}</option>)}</select></label><button className="button button-light button-small" onClick={() => changeVisual(scene.id)}>{text.tryImage} ↻</button></div><button className="text-link scene-done" onClick={() => setEditingScene(null)}>{text.saveChanges}</button></> : <><h4>{scene.headline}</h4>{showTextOnScreen && <p>{scene.supportingText}</p>}<p>{scene.voiceover}</p><button className="text-link scene-edit" onClick={() => setEditingScene(scene.id)}>{text.changeScene}</button></>}
            </div>
            <div className="scene-controls"><div><button title={locale === "no" ? "Flytt scenen opp" : "Move scene up"} aria-label={locale === "no" ? "Flytt scenen opp" : "Move scene up"} onClick={() => moveScene(index, -1)}>↑</button><button title={locale === "no" ? "Flytt scenen ned" : "Move scene down"} aria-label={locale === "no" ? "Flytt scenen ned" : "Move scene down"} onClick={() => moveScene(index, 1)}>↓</button></div><select aria-label={locale === "no" ? `Lengde på scene ${index + 1}` : `Duration of scene ${index + 1}`} value={scene.duration} onChange={(event) => changeScene(scene.id, { duration: Number(event.target.value) })}>{[3,4,5,6,7,8,10,12,15,20,25,30].map((duration) => <option key={duration} value={duration}>{duration} {text.seconds}</option>)}</select><div><button title={locale === "no" ? "Kopier scenen" : "Duplicate scene"} aria-label={locale === "no" ? "Kopier scenen" : "Duplicate scene"} onClick={() => { const duplicate = { ...scene, id: crypto.randomUUID() }; setScenes((current) => [...current.slice(0, index + 1), duplicate, ...current.slice(index + 1)]); }}>⧉</button><button title={locale === "no" ? "Fjern scenen" : "Remove scene"} aria-label={locale === "no" ? "Fjern scenen" : "Remove scene"} onClick={() => setScenes((current) => current.filter((item) => item.id !== scene.id))}>×</button></div></div>
          </article>)}</div>
          <button className="scene-add" onClick={() => setScenes((current) => [...current, createScene(locale)])}>+ {text.addScene}</button>
        </section>
        <aside className="panel settings">
          <div className="panel-pad"><div className="panel-head"><h3>{text.shapeFilm}</h3><small>{text.makeItYours}</small></div></div>
          <div className="settings-section"><label>{text.shareWhere}</label><div className="platform-choices">{platformPresets.map((preset) => <label key={preset.id} className={settings.platformPresetIds?.includes(preset.id) ? "checked" : ""}><input type="checkbox" checked={settings.platformPresetIds?.includes(preset.id) ?? false} onChange={(event) => { const current = settings.platformPresetIds ?? []; updateSetting("platformPresetIds", event.target.checked ? [...current, preset.id] : current.filter((id) => id !== preset.id)); if (event.target.checked) updateSetting("format", preset.format); }}/><span><b>{preset.platform}</b><small>{preset.width} × {preset.height}</small></span></label>)}</div></div>
          <div className="settings-section"><label>{text.chooseFrame}</label><div className="choice-row">{formats.map((format) => <button key={format} className={`choice ${settings.format === format ? "selected" : ""}`} onClick={() => updateSetting("format", format)}>{format}</button>)}</div></div>
          <div className="settings-section"><label>{text.durationQuestion}</label><div className="choice-row">{durationOptions.map((duration) => <button key={duration} className={`choice ${settings.duration === duration ? "selected" : ""}`} onClick={() => selectDuration(duration)}>{duration} {text.seconds}</button>)}</div></div>
          <div className="settings-section"><label><input type="checkbox" checked={showTextOnScreen} onChange={(event) => { setShowTextOnScreen(event.target.checked); updateSetting("showTextOnScreen", event.target.checked); }} /> {text.textToggle}</label></div>
          <div className="settings-section"><label htmlFor="language">{text.language}</label><select id="language" value={settings.language} onChange={(event) => { const language = event.target.value; updateSetting("language", language); updateSetting("voice", language === "Norsk" ? text.voices.no[0] : text.voices.en[0]); }}>{text.languageOptions.map((language) => <option key={language}>{language}</option>)}</select></div>
          <div className="settings-section"><label htmlFor="voice">{text.voice}</label><select id="voice" value={settings.voice} onChange={(event) => updateSetting("voice", event.target.value)}>{(settings.language === "Norsk" ? text.voices.no : text.voices.en).map((voice) => <option key={voice}>{voice}</option>)}</select></div>
          <div className="settings-section"><label>{text.style}</label><div className="choice-row">{styles.map((style, index) => <button key={style} className={`choice ${settings.style === style ? "selected" : ""}`} onClick={() => updateSetting("style", style)}>{styleLabels[index]}</button>)}</div></div>
          <div className="settings-section" id="music"><MusicStudio locale={locale} mode={filmMode} analysis={analysis} brief={creativeBrief ?? { objective: "Present the clearest information found on the website.", durationMode: filmMode, targetDuration: settings.duration, durationGuidance: "Use the selected duration without repeating source content.", brand: analysis.brand, productOrService: "", valueProposition: analysis.description, targetAudience: [], coreMessage: analysis.description, keyBenefits: analysis.sellingPoints, tone: ["modern"], visualStyle: settings.style, suggestedHook: analysis.title, callToAction: "", suggestedPacing: "balanced", suggestedMusicDirection: "Modern", suggestedVoiceDirection: "Clear", recommendedPlatforms: [], evidence: [], confidence: "low" }} duration={settings.duration} selectedTrackId={settings.musicTrackId ?? null} onSelect={(trackId) => updateSetting("musicTrackId", trackId)}/></div>
          <div className="settings-section"><label>{text.musicFeel}</label><p>{musicDirection}</p><small>{text.noLicensedMusic}</small></div>
          <div className="settings-section mixer-section"><label>{text.adjustSound}</label>{([[text.voiceLevel, "voice", 0.8], [text.musicLevel, "music", 0.55], [text.sceneSounds, "sfx", 0.25]] as const).map(([label, key, defaultValue]) => <div className="mixer-row" key={key}><span>{label}</span><input aria-label={`${label} level`} type="range" min="0" max="1" step="0.05" value={settings.audioMix?.[key].volume ?? defaultValue} onChange={(event) => updateSetting("audioMix", { ...(settings.audioMix ?? { voice: { volume: 0.8, muted: false, fadeInSeconds: 0.8, fadeOutSeconds: 1.5, startSeconds: 0 }, music: { volume: 0.55, muted: false, fadeInSeconds: 0.8, fadeOutSeconds: 1.5, startSeconds: 0 }, sfx: { volume: 0.25, muted: false, fadeInSeconds: 0.8, fadeOutSeconds: 1.5, startSeconds: 0 }, jingle: { volume: 0.35, muted: false, fadeInSeconds: 0.8, fadeOutSeconds: 1.5, startSeconds: 0 }, duckMusicUnderVoice: true }), [key]: { ...(settings.audioMix?.[key] ?? { volume: defaultValue, muted: false, fadeInSeconds: 0.8, fadeOutSeconds: 1.5, startSeconds: 0 }), volume: Number(event.target.value) } })}/><b>{Math.round((settings.audioMix?.[key].volume ?? defaultValue) * 100)}%</b></div>)}{filmMode === "advert" && <div className="mixer-row"><span>{text.closingSound}</span><input aria-label={`${text.closingSound} level`} type="range" min="0" max="1" step="0.05" value={settings.audioMix?.jingle.volume ?? 0.35} onChange={(event) => updateSetting("audioMix", { ...(settings.audioMix ?? { voice: { volume: 0.8, muted: false, fadeInSeconds: 0.8, fadeOutSeconds: 1.5, startSeconds: 0 }, music: { volume: 0.55, muted: false, fadeInSeconds: 0.8, fadeOutSeconds: 1.5, startSeconds: 0 }, sfx: { volume: 0.25, muted: false, fadeInSeconds: 0.8, fadeOutSeconds: 1.5, startSeconds: 0 }, jingle: { volume: 0.35, muted: false, fadeInSeconds: 0.8, fadeOutSeconds: 1.5, startSeconds: 0 }, duckMusicUnderVoice: true }), jingle: { ...(settings.audioMix?.jingle ?? { volume: 0.35, muted: false, fadeInSeconds: 0.8, fadeOutSeconds: 1.5, startSeconds: 0 }), volume: Number(event.target.value) } })}/><b>{Math.round((settings.audioMix?.jingle.volume ?? 0.35) * 100)}%</b></div>}<small>{text.mixNote}</small></div>
          <div className="settings-footer"><button className="button" disabled={!scenes.length} onClick={beginRender}>{text.makeFilm} <span aria-hidden="true">→</span></button><p>{text.savedPreview}</p></div>
        </aside>
      </div>}

      {stage === "render" && <section className="panel render-card"><div className="render-mark" aria-hidden="true">S</div><span className="eyebrow">{text.renderEyebrow}</span><h2>{text.titles.render}</h2><p>{text.renderDescription}</p><div className="render-progress"><div className="progress-track"><span /></div><div className="progress-stages"><span className="complete">{text.story}</span><span className="complete">{text.sound}</span><span>{text.firstLook}</span></div></div><p className="field-caption render-note">{text.renderNote}</p></section>}

      {stage === "result" && project && <div className="result-layout">
        <section className="panel result-frame"><div className="result-preview"><span className="result-play" aria-label={text.draftNotice}>▶</span><div><h2>{project.scenes[0]?.headline ?? project.title}</h2><small>{project.analysis.brand.toUpperCase()} · {text.resultEyebrow}</small></div></div></section>
        <aside className="panel result-side"><span className="eyebrow">{text.resultEyebrow}</span><h3>{project.title}</h3><p>{project.url}</p><p>{text.draftNotice}</p><div className="result-actions"><button className="button button-light" disabled>{locale === "no" ? "Last ned MP4" : "Download MP4"}</button><button className="button" onClick={() => { const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }); const downloadUrl = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = downloadUrl; anchor.download = `${project.analysis.brand}-project.json`; anchor.click(); URL.revokeObjectURL(downloadUrl); }}>{text.downloadProject} <span aria-hidden="true">↓</span></button>{!project.settings.showTextOnScreen && <button className="button button-light" onClick={() => { const blob = new Blob([buildSrt(project.scenes)], { type: "text/plain;charset=utf-8" }); const downloadUrl = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = downloadUrl; anchor.download = `${project.analysis.brand}-subtitles.srt`; anchor.click(); URL.revokeObjectURL(downloadUrl); }}>{text.downloadSrt} <span aria-hidden="true">↓</span></button>}<button className="button button-light" onClick={() => navigator.clipboard?.writeText(project.url)}>{text.copyLink}</button><button className="button button-light" onClick={() => { setProject(null); setAnalysis(null); setUrl(""); setStage("website"); }}>{text.anotherDirection}</button></div><div className="result-details"><div><span>{text.length}</span><b>{project.settings.duration} {text.seconds}</b></div><div><span>{text.format}</span><b>{project.settings.format}</b></div><div><span>{text.feeling}</span><b>{project.settings.style}</b></div><div><span>{text.scenes}</span><b>{project.scenes.length}</b></div></div><Link href={localizedPath(locale, `/projects/${project.id}`)} className="text-link result-detail-link">{text.fullStory} →</Link></aside>
      </div>}
    </div>
  );
}
