"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import Link from "next/link";
import { createScene, defaultSettings, demoScenes } from "@/lib/mock-data";
import { saveProject } from "@/lib/projects";
import type { CreativeBrief, ScenePurpose, SiteAnalysis, StoryScene, VideoFormat, VideoProject, VideoSettings } from "@/types/project";
import { MusicStudio } from "@/components/music-studio";
import { platformPresets } from "@/lib/platforms/presets";

const analysisSteps = ["Reading website", "Extracting content", "Identifying brand", "Understanding the offer", "Building creative direction", "Building storyboard"];
const formats: VideoFormat[] = ["16:9", "9:16", "1:1", "4:5"];
const styles = ["Editorial", "Cinematic", "Clean", "Energetic", "Minimal"];
const purposes: ScenePurpose[] = ["Hook", "Story", "Product", "Benefit", "Proof", "CTA"];
const transitions = ["Slow reveal", "Soft cut", "Match cut", "Gentle pan", "Dissolve", "Fade out"];
const visualChoices = [...new Set(demoScenes.map((scene) => scene.visual))];

type Stage = "website" | "storyboard" | "render" | "result";

interface CreateStudioProps {
  initialUrl?: string;
  initialSettings?: Partial<VideoSettings>;
}

export function CreateStudio({ initialUrl = "", initialSettings = {} }: CreateStudioProps) {
  const [url, setUrl] = useState(initialUrl);
  const [error, setError] = useState("");
  const [stage, setStage] = useState<Stage>("website");
  const [analysis, setAnalysis] = useState<SiteAnalysis | null>(null);
  const [creativeBrief, setCreativeBrief] = useState<CreativeBrief | null>(null);
  const [mode, setMode] = useState<"mock" | "real">("mock");
  const [analyzing, setAnalyzing] = useState(false);
  const [scenes, setScenes] = useState<StoryScene[]>(demoScenes);
  const [settings, setSettings] = useState<VideoSettings>({ ...defaultSettings, ...initialSettings });
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [editingScene, setEditingScene] = useState<string | null>(null);
  const [project, setProject] = useState<VideoProject | null>(null);

  function updateSetting<Key extends keyof VideoSettings>(key: Key, value: VideoSettings[Key]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function analyzeWebsite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const value = url.trim();
    if (!value) {
      setError("Enter a valid website URL, such as northline.studio.");
      return;
    }
    setAnalyzing(true);
    setAnalysisProgress(0);
    const progressTimer = window.setInterval(() => setAnalysisProgress((current) => Math.min(current + 1, analysisSteps.length - 1)), mode === "real" ? 1800 : 320);
    void fetch("/api/website/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: value, mode, targetDuration: settings.duration }),
    }).then(async (response) => {
      const payload = await response.json() as { error?: string; analysis?: SiteAnalysis; creativeBrief?: CreativeBrief; storyboard?: { scenes: StoryScene[] } };
      if (!response.ok || !payload.analysis || !payload.creativeBrief || !payload.storyboard) throw new Error(payload.error ?? "We couldn't analyze this website. Try another public URL.");
      return payload;
    }).then((payload) => {
      window.clearInterval(progressTimer);
      setAnalysisProgress(analysisSteps.length);
      setAnalysis(payload.analysis!);
      setCreativeBrief(payload.creativeBrief!);
      setScenes(payload.storyboard!.scenes);
      setUrl(payload.analysis!.url);
      window.setTimeout(() => setStage("storyboard"), 350);
    }).catch((cause: unknown) => {
      window.clearInterval(progressTimer);
      setAnalysisProgress(0);
      setError(cause instanceof Error ? cause.message : "We couldn't access this website. Try a public URL.");
    }).finally(() => setAnalyzing(false));
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
    setStage("render");
    window.setTimeout(() => {
      const nextProject: VideoProject = {
        id: crypto.randomUUID(),
        title: `${analysis.brand} — brand film`,
        url: analysis.url,
        createdAt: new Date().toISOString(),
        analysis,
        scenes,
        settings,
        version: 1,
      };
      saveProject(nextProject);
      setProject(nextProject);
      setStage("result");
    }, 5200);
  }

  const labels: Stage[] = ["website", "storyboard", "render", "result"];
  const stageNames = ["Website", "Storyboard", "Render", "Your video"];
  const stageIndex = labels.indexOf(stage);

  return (
    <div className="create-page">
      <div className="page-heading">
        <div><span className="eyebrow">Create / New video</span><h1>{stage === "result" ? "Your mock preview is ready." : stage === "storyboard" ? "Shape your story." : stage === "render" ? "Composing your first cut." : "Start with a website."}</h1><p>{stage === "result" ? "A first cut, made from the story already on your site." : "A URL in. A story in motion."}</p></div>
        {stage === "result" && <Link href="/projects" className="button button-light button-small">Open projects <span aria-hidden="true">↗</span></Link>}
      </div>

      <div className="stepper" aria-label="Creation progress">
        {stageNames.map((name, index) => <button key={name} className={index === stageIndex ? "active" : ""} onClick={() => { if (index < stageIndex && index < 2) setStage(index === 0 ? "website" : "storyboard"); }} aria-current={index === stageIndex ? "step" : undefined}><span className="stepper-num">{index < stageIndex ? "✓" : `0${index + 1}`}</span>{name}</button>)}
      </div>

      {stage === "website" && <div className="studio-grid">
        <section className="panel panel-pad">
          <div className="panel-head"><div><h2>Where should we begin?</h2><small>Paste a public website URL</small></div><span className="tag">{mode.toUpperCase()} MODE</span></div>
          <div className="mode-control" role="group" aria-label="Website analysis mode"><button className={mode === "mock" ? "selected" : ""} aria-pressed={mode === "mock"} onClick={() => setMode("mock")}>Mock demo</button><button className={mode === "real" ? "selected" : ""} aria-pressed={mode === "real"} onClick={() => setMode("real")}>Real website</button></div>
          <form className="url-form" onSubmit={analyzeWebsite}>
            <label className="url-field"><span className="sr-only">Website URL</span><input type="text" inputMode="url" autoComplete="url" value={url} onChange={(event) => { setUrl(event.target.value); setError(""); }} placeholder="https://yourwebsite.com" aria-describedby={error ? "url-error" : "url-hint"} /></label>
            <button className="button" type="submit" disabled={analyzing}>{analyzing ? "Analyzing…" : "Analyze website"} <span aria-hidden="true">→</span></button>
          </form>
          {error && <p className="error-text" id="url-error" role="alert">{error}</p>}
          <div className="field-caption" id="url-hint">We’ll turn the pages, products and point of view into a first draft.</div>
          <div className="sample-links"><span>TRY A SAMPLE</span>{["northline.studio", "quietform.co", "goodfield.market"].map((sample) => <button key={sample} type="button" onClick={() => setUrl(`https://${sample}`)}>{sample}</button>)}</div>
          {analyzing && <div className="analysis-panel" aria-live="polite"><div className="analysis-title">{mode === "real" ? "Reading your website" : "Preparing the demo story"}<span>{Math.min(Math.round(analysisProgress / analysisSteps.length * 90), 90)}%</span></div><ul className="analysis-list">{analysisSteps.map((item, index) => <li className={index < analysisProgress ? "done" : ""} key={item}><span className="analysis-check">{index < analysisProgress ? "✓" : "·"}</span>{item}{index === analysisProgress ? "…" : ""}</li>)}</ul></div>}
        </section>
        <aside className="panel panel-pad"><div className="panel-head"><h3>What happens next</h3></div><div className="step"><span className="step-no">01 / READ</span><h3>Your site, understood</h3><p>We find the content, images and language that make the brand recognizable.</p></div><div className="step"><span className="step-no">02 / SHAPE</span><h3>A story with a point</h3><p>See a storyboard before anything renders. You decide what stays.</p></div></aside>
      </div>}

      {stage === "storyboard" && analysis && <div className="studio-grid">
        <section className="panel panel-pad">
          <div className="panel-head"><div><h2>Shape the story</h2><small>{scenes.length} scenes · {scenes.reduce((sum, scene) => sum + scene.duration, 0)} seconds · {analysis.source?.mode === "real" ? "REAL ANALYSIS" : "DEMO MODE"}</small></div><button className="button button-light button-small" onClick={() => setStage("website")}>Change URL</button></div>
          <div className="website-summary"><div className="website-photo" role="img" aria-label="A considered modern clothing shop"/><div className="website-meta"><span className="eyebrow">WEBSITE FOUND</span><h3>{analysis.title}</h3><p>{analysis.description}</p><div className="tag-list">{analysis.sellingPoints.map((point) => <span className="tag" key={point}>{point}</span>)}</div></div></div>
          {creativeBrief && <div className="brief-summary"><div className="brief-title"><span className="eyebrow">CREATIVE DIRECTION</span><span className="tag">{creativeBrief.confidence.toUpperCase()} CONFIDENCE</span></div><p><b>{creativeBrief.coreMessage}</b></p><div className="tag-list"><span className="tag">{creativeBrief.visualStyle}</span><span className="tag">{creativeBrief.suggestedPacing} pace</span>{creativeBrief.tone.slice(0, 2).map((tone) => <span className="tag" key={tone}>{tone}</span>)}</div><small>Based on: {creativeBrief.evidence.join(" · ") || "Available page content"}</small></div>}
          <div className="scene-list">{scenes.map((scene, index) => <article className="scene-row" key={scene.id}>
            <div className="scene-art" style={{ backgroundImage: `linear-gradient(0deg,#15231a44,transparent),url("${scene.visual}")` }} aria-label={`Visual for scene ${index + 1}`} />
            <div className="scene-copy"><div className="scene-topline"><b>{String(index + 1).padStart(2, "0")}</b><select aria-label={`Scene ${index + 1} purpose`} value={scene.purpose} onChange={(event) => changeScene(scene.id, { purpose: event.target.value as ScenePurpose })}>{purposes.map((purpose) => <option key={purpose}>{purpose}</option>)}</select></div>
              {editingScene === scene.id ? <><input className="field-control" aria-label="Scene headline" value={scene.headline} onChange={(event) => changeScene(scene.id, { headline: event.target.value })}/><input className="field-control" aria-label="Supporting text" value={scene.supportingText} onChange={(event) => changeScene(scene.id, { supportingText: event.target.value })}/><textarea className="text-control" aria-label="Scene voiceover" value={scene.voiceover} onChange={(event) => changeScene(scene.id, { voiceover: event.target.value })}/><div className="scene-edit-options"><label>Transition<select aria-label="Scene transition" value={scene.transition} onChange={(event) => changeScene(scene.id, { transition: event.target.value })}>{transitions.map((transition) => <option key={transition}>{transition}</option>)}</select></label><button className="button button-light button-small" onClick={() => changeVisual(scene.id)}>Change visual ↻</button></div><button className="text-link scene-done" onClick={() => setEditingScene(null)}>Done editing</button></> : <><h4>{scene.headline}</h4><p>{scene.supportingText}</p><button className="text-link scene-edit" onClick={() => setEditingScene(scene.id)}>Edit scene</button></>}
            </div>
            <div className="scene-controls"><div><button title="Move scene up" aria-label="Move scene up" onClick={() => moveScene(index, -1)}>↑</button><button title="Move scene down" aria-label="Move scene down" onClick={() => moveScene(index, 1)}>↓</button></div><select aria-label={`Scene ${index + 1} duration`} value={scene.duration} onChange={(event) => changeScene(scene.id, { duration: Number(event.target.value) })}>{[3,4,5,6,7,8].map((duration) => <option key={duration} value={duration}>{duration}s</option>)}</select><div><button title="Duplicate scene" aria-label="Duplicate scene" onClick={() => { const duplicate = { ...scene, id: crypto.randomUUID() }; setScenes((current) => [...current.slice(0, index + 1), duplicate, ...current.slice(index + 1)]); }}>⧉</button><button title="Remove scene" aria-label="Remove scene" onClick={() => setScenes((current) => current.filter((item) => item.id !== scene.id))}>×</button></div></div>
          </article>)}</div>
          <button className="scene-add" onClick={() => setScenes((current) => [...current, createScene()])}>+ Add a scene</button>
        </section>
        <aside className="panel settings">
          <div className="panel-pad"><div className="panel-head"><h3>Video settings</h3><small>FIRST CUT</small></div></div>
          <div className="settings-section"><label>Where are you publishing?</label><div className="platform-choices">{platformPresets.map((preset) => <label key={preset.id} className={settings.platformPresetIds?.includes(preset.id) ? "checked" : ""}><input type="checkbox" checked={settings.platformPresetIds?.includes(preset.id) ?? false} onChange={(event) => { const current = settings.platformPresetIds ?? []; updateSetting("platformPresetIds", event.target.checked ? [...current, preset.id] : current.filter((id) => id !== preset.id)); if (event.target.checked) updateSetting("format", preset.format); }}/><span><b>{preset.platform}</b><small>{preset.width} × {preset.height}</small></span></label>)}</div></div>
          <div className="settings-section"><label>Custom format</label><div className="choice-row">{formats.map((format) => <button key={format} className={`choice ${settings.format === format ? "selected" : ""}`} onClick={() => updateSetting("format", format)}>{format}</button>)}</div></div>
          <div className="settings-section"><label>Target duration</label><div className="choice-row">{[15,20,30,45,60].map((duration) => <button key={duration} className={`choice ${settings.duration === duration ? "selected" : ""}`} onClick={() => updateSetting("duration", duration)}>{duration}s</button>)}</div></div>
          <div className="settings-section"><label htmlFor="language">Language</label><select id="language" value={settings.language} onChange={(event) => updateSetting("language", event.target.value)}><option>English</option><option>Norsk</option><option>Deutsch</option><option>Français</option><option>Español</option></select></div>
          <div className="settings-section"><label htmlFor="voice">Voice</label><select id="voice" value={settings.voice} onChange={(event) => updateSetting("voice", event.target.value)}><option>Maya · warm</option><option>Jules · considered</option><option>Alex · assured</option><option>No voiceover</option></select></div>
          <div className="settings-section"><label>Visual style</label><div className="choice-row">{styles.map((style) => <button key={style} className={`choice ${settings.style === style ? "selected" : ""}`} onClick={() => updateSetting("style", style)}>{style}</button>)}</div></div>
          <div className="settings-section" id="music"><MusicStudio analysis={analysis} brief={creativeBrief ?? { brand: analysis.brand, productOrService: "", targetAudience: [], coreMessage: analysis.description, keyBenefits: analysis.sellingPoints, tone: ["modern"], visualStyle: settings.style, suggestedHook: analysis.title, callToAction: "Explore", suggestedPacing: "balanced", suggestedMusicDirection: "Modern", suggestedVoiceDirection: "Clear", recommendedPlatforms: [], evidence: [], confidence: "low" }} duration={settings.duration} selectedTrackId={settings.musicTrackId ?? null} onSelect={(trackId) => updateSetting("musicTrackId", trackId)}/></div>
          <div className="settings-section"><label htmlFor="music">Soundtrack direction</label><select id="music" value={settings.music} onChange={(event) => updateSetting("music", event.target.value)}><option>Modern</option><option>Subtle</option><option>Cinematic</option><option>Energetic</option><option>None</option></select></div>
          <div className="settings-section mixer-section"><label>Audio mix</label>{([ ["Voice", "voice", 0.8], ["Music", "music", 0.55], ["Sound effects", "sfx", 0.25], ["Jingle", "jingle", 0.35] ] as const).map(([label, key, defaultValue]) => <div className="mixer-row" key={key}><span>{label}</span><input aria-label={`${label} volume`} type="range" min="0" max="1" step="0.05" value={settings.audioMix?.[key].volume ?? defaultValue} onChange={(event) => updateSetting("audioMix", { ...(settings.audioMix ?? { voice: { volume: 0.8, muted: false, fadeInSeconds: 0.8, fadeOutSeconds: 1.5, startSeconds: 0 }, music: { volume: 0.55, muted: false, fadeInSeconds: 0.8, fadeOutSeconds: 1.5, startSeconds: 0 }, sfx: { volume: 0.25, muted: false, fadeInSeconds: 0.8, fadeOutSeconds: 1.5, startSeconds: 0 }, jingle: { volume: 0.35, muted: false, fadeInSeconds: 0.8, fadeOutSeconds: 1.5, startSeconds: 0 }, duckMusicUnderVoice: true }), [key]: { ...(settings.audioMix?.[key] ?? { volume: defaultValue, muted: false, fadeInSeconds: 0.8, fadeOutSeconds: 1.5, startSeconds: 0 }), volume: Number(event.target.value) } })}/><b>{Math.round((settings.audioMix?.[key].volume ?? defaultValue) * 100)}%</b></div>)}<small>Music ducks under voice. Audio layers remain independent.</small></div>
          <div className="settings-footer"><button className="button" disabled={!scenes.length} onClick={beginRender}>Generate video <span aria-hidden="true">→</span></button><p>Story stays editable until you render.</p></div>
        </aside>
      </div>}

      {stage === "render" && <section className="panel render-card"><div className="render-mark" aria-hidden="true">S</div><span className="eyebrow">A little patience, then the first cut</span><h2>Making your story move.</h2><p>Putting the scenes together with your visual direction, voice and soundtrack.</p><div className="render-progress"><div className="progress-track"><span /></div><div className="progress-stages"><span className="complete">Scenes</span><span className="complete">Voice</span><span className="complete">Sound</span><span>Final cut</span></div></div><p className="field-caption render-note">Composing your preview…</p></section>}

      {stage === "result" && project && <div className="result-layout">
        <section className="panel result-frame"><div className="result-preview"><span className="result-play" aria-label="Preview is ready">▶</span><div><h2>{project.scenes[0]?.headline ?? project.title}</h2><small>{project.analysis.brand.toUpperCase()} · BRAND FILM</small></div></div></section>
        <aside className="panel result-side"><span className="eyebrow">MOCK PREVIEW / VERSION 01</span><h3>{project.title}</h3><p>{project.url}</p><div className="result-actions"><button className="button" onClick={() => { const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }); const downloadUrl = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = downloadUrl; anchor.download = `${project.analysis.brand}-project.json`; anchor.click(); URL.revokeObjectURL(downloadUrl); }}>Download project file <span aria-hidden="true">↓</span></button><button className="button button-light" onClick={() => navigator.clipboard?.writeText(project.url)}>Copy website URL</button><button className="button button-light" onClick={() => { setProject(null); setAnalysis(null); setUrl(""); setStage("website"); }}>Create another version</button></div><div className="result-details"><div><span>Duration</span><b>{project.settings.duration} sec</b></div><div><span>Format</span><b>{project.settings.format}</b></div><div><span>Visual style</span><b>{project.settings.style}</b></div><div><span>Scenes</span><b>{project.scenes.length}</b></div></div><Link href={`/projects/${project.id}`} className="text-link result-detail-link">Open project details →</Link></aside>
      </div>}
    </div>
  );
}
