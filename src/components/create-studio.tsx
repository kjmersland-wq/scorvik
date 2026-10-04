"use client";

import { useState } from "react";
import Link from "next/link";
import { createCreativeBrief, detectBrandProfile } from "@/lib/creative/create-brief";
import { buildStoryboard } from "@/lib/creative/storyboard-engine";
import { buildMockAnalysis, createScene, defaultSettings, demoScenes } from "@/lib/mock-data";
import { saveProject } from "@/lib/projects";
import type { CreativeBrief, ScenePurpose, SiteAnalysis, StoryScene, VideoFormat, VideoProject, VideoSettings } from "@/types/project";
import { MusicStudio } from "@/components/music-studio";
import { platformPresets } from "@/lib/platforms/presets";

const formats: VideoFormat[] = ["16:9", "9:16", "1:1", "4:5"];
const styles = ["Editorial", "Cinematic", "Clean", "Energetic", "Minimal"];
const purposeLabels: Record<ScenePurpose, string> = { Hook: "The hook", Story: "The story", Product: "The product", Benefit: "The benefit", Proof: "The proof", CTA: "The close" };
const styleLabels: Record<string, string> = { Editorial: "Thoughtful", Cinematic: "Film-like", Clean: "Clear", Energetic: "Lively", Minimal: "Quiet" };
const visualDirectionLabels: Record<string, string> = {
  "Editorial product film": "Thoughtful product close-ups",
  "Clean product-led motion": "Clear, focused scenes",
  "Atmospheric destination story": "A story with room to breathe",
  "Warm sensory close-ups": "Warm, sensory moments",
  "Editorial brand story": "A story that feels like your brand",
};
const pacingLabels: Record<CreativeBrief["suggestedPacing"], string> = { measured: "Unhurried", balanced: "Easygoing", fast: "Lively" };
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
  const [stage, setStage] = useState<Stage>("website");
  const [analysis, setAnalysis] = useState<SiteAnalysis | null>(null);
  const [creativeBrief, setCreativeBrief] = useState<CreativeBrief | null>(null);
  const [mode, setMode] = useState<"mock" | "real">("mock");
  const [scenes, setScenes] = useState<StoryScene[]>(demoScenes);
  const [settings, setSettings] = useState<VideoSettings>({ ...defaultSettings, ...initialSettings });
  const [editingScene, setEditingScene] = useState<string | null>(null);
  const [project, setProject] = useState<VideoProject | null>(null);

  function updateSetting<Key extends keyof VideoSettings>(key: Key, value: VideoSettings[Key]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function showSampleStory(sample: string) {
    const baseAnalysis = buildMockAnalysis(`https://${sample}`);
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
    const brief = createCreativeBrief(enrichedAnalysis);
    const storyboard = buildStoryboard(enrichedAnalysis, brief, { targetDuration: settings.duration });

    setUrl(baseAnalysis.url);
    setAnalysis(enrichedAnalysis);
    setCreativeBrief(brief);
    setScenes(storyboard.scenes);
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
    setStage("render");
    window.setTimeout(() => {
      const nextProject: VideoProject = {
        id: crypto.randomUUID(),
        title: `${analysis.brand} — your film`,
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
  const stageNames = ["Website", "Your story", "Make your film", "Ready"];
  const stageIndex = labels.indexOf(stage);

  return (
    <div className="create-page">
      <div className="page-heading">
        <div><span className="eyebrow">Your film / {stageNames[stageIndex]}</span><h1>{stage === "result" ? "Your first look is ready." : stage === "storyboard" ? "Here’s the story we found." : stage === "render" ? "Putting your film together." : "Start with your website."}</h1><p>{stage === "result" ? "Take a look. Your story and choices are saved in this browser." : stage === "storyboard" ? "Want to change something? Go ahead." : stage === "render" ? "Bringing your story, voice and soundtrack together." : "Share your link and we’ll find what makes your brand yours."}</p></div>
        {stage === "result" && <Link href="/projects" className="button button-light button-small">See my projects <span aria-hidden="true">↗</span></Link>}
      </div>

      <div className="stepper" aria-label="Your progress">
        {stageNames.map((name, index) => <button key={name} className={index === stageIndex ? "active" : ""} onClick={() => { if (index < stageIndex && index < 2) setStage(index === 0 ? "website" : "storyboard"); }} aria-current={index === stageIndex ? "step" : undefined}><span className="stepper-num">{index < stageIndex ? "✓" : `0${index + 1}`}</span>{name}</button>)}
      </div>

      {stage === "website" && <div className="studio-grid">
        <section className="panel panel-pad">
          <div className="panel-head"><div><h2>Start with your website.</h2><small>Paste a link and we’ll take a look.</small></div><span className="tag">{mode === "real" ? "YOUR WEBSITE" : "SAMPLE STORY"}</span></div>
          <div className="mode-control" role="group" aria-label="Choose how to start"><button className={mode === "mock" ? "selected" : ""} aria-pressed={mode === "mock"} onClick={() => setMode("mock")}>Try a sample</button><button className={mode === "real" ? "selected" : ""} aria-pressed={mode === "real"} disabled>Use my website</button></div>
          <form className="url-form" onSubmit={(event) => event.preventDefault()}>
            <label className="url-field"><span className="sr-only">Your website link</span><input type="text" inputMode="url" autoComplete="url" value={url} placeholder="yourwebsite.com" disabled aria-describedby="url-hint" /></label>
            <button className="button" type="submit" disabled>Build a sample story <span aria-hidden="true">→</span></button>
          </form>
          <div className="field-caption" id="url-hint">Preview is open. Adding your own website opens soon.</div>
          <div className="sample-links"><span>OR START WITH A SAMPLE</span>{["northline.studio", "quietform.co", "goodfield.market"].map((sample) => <button key={sample} type="button" onClick={() => showSampleStory(sample)}>{sample}</button>)}</div>
        </section>
        <aside className="panel panel-pad"><div className="panel-head"><h3>Here’s what we’ll do</h3></div><div className="step"><span className="step-no">01 / TAKE A LOOK</span><h3>Get to know your brand</h3><p>We’ll pick out the words, images and details that feel like you.</p></div><div className="step"><span className="step-no">02 / SHAPE THE STORY</span><h3>Your story, your way</h3><p>Take a look at the first draft and change anything you like.</p></div></aside>
      </div>}

      {stage === "storyboard" && analysis && <div className="studio-grid">
        <section className="panel panel-pad">
          <div className="panel-head"><div><h2>Here’s the story we found.</h2><small>{scenes.length} scenes · {scenes.reduce((sum, scene) => sum + scene.duration, 0)} seconds · {analysis.source?.mode === "real" ? "From your website" : "Sample story"}</small></div><button className="button button-light button-small" onClick={() => setStage("website")}>Change website</button></div>
          <div className="website-summary"><div className="website-photo" role="img" aria-label="A sample clothing shop"/><div className="website-meta"><span className="eyebrow">A FEW THINGS WE NOTICED</span><h3>{analysis.title}</h3><p>{analysis.description}</p><div className="tag-list">{analysis.sellingPoints.map((point) => <span className="tag" key={point}>{point}</span>)}</div></div></div>
          {creativeBrief && <div className="brief-summary"><div className="brief-title"><span className="eyebrow">A FIRST DIRECTION</span><span className="tag">A starting point</span></div><p><b>{creativeBrief.coreMessage}</b></p><div className="tag-list"><span className="tag">{visualDirectionLabels[creativeBrief.visualStyle] ?? creativeBrief.visualStyle}</span><span className="tag">{pacingLabels[creativeBrief.suggestedPacing]}</span>{creativeBrief.tone.slice(0, 2).map((tone) => <span className="tag" key={tone}>{tone}</span>)}</div><small>Drawn from: {creativeBrief.evidence.join(" · ") || "Your website"}</small></div>}
          <div className="scene-list">{scenes.map((scene, index) => <article className="scene-row" key={scene.id}>
            <div className="scene-art" style={{ backgroundImage: `linear-gradient(0deg,#15231a44,transparent),url("${scene.visual}")` }} aria-label={`Visual for scene ${index + 1}`} />
            <div className="scene-copy"><div className="scene-topline"><b>{String(index + 1).padStart(2, "0")}</b><select aria-label={`What scene ${index + 1} is about`} value={scene.purpose} onChange={(event) => changeScene(scene.id, { purpose: event.target.value as ScenePurpose })}>{purposes.map((purpose) => <option key={purpose} value={purpose}>{purposeLabels[purpose]}</option>)}</select></div>
              {editingScene === scene.id ? <><input className="field-control" aria-label="Words on screen" value={scene.headline} onChange={(event) => changeScene(scene.id, { headline: event.target.value })}/><input className="field-control" aria-label="A little more detail" value={scene.supportingText} onChange={(event) => changeScene(scene.id, { supportingText: event.target.value })}/><textarea className="text-control" aria-label="Words to say aloud" value={scene.voiceover} onChange={(event) => changeScene(scene.id, { voiceover: event.target.value })}/><div className="scene-edit-options"><label>How scenes connect<select aria-label="How scenes connect" value={scene.transition} onChange={(event) => changeScene(scene.id, { transition: event.target.value })}>{transitions.map((transition) => <option key={transition}>{transition}</option>)}</select></label><button className="button button-light button-small" onClick={() => changeVisual(scene.id)}>Try another image ↻</button></div><button className="text-link scene-done" onClick={() => setEditingScene(null)}>Save changes</button></> : <><h4>{scene.headline}</h4><p>{scene.supportingText}</p><button className="text-link scene-edit" onClick={() => setEditingScene(scene.id)}>Change this scene</button></>}
            </div>
            <div className="scene-controls"><div><button title="Move scene up" aria-label="Move scene up" onClick={() => moveScene(index, -1)}>↑</button><button title="Move scene down" aria-label="Move scene down" onClick={() => moveScene(index, 1)}>↓</button></div><select aria-label={`How long scene ${index + 1} stays on screen`} value={scene.duration} onChange={(event) => changeScene(scene.id, { duration: Number(event.target.value) })}>{[3,4,5,6,7,8].map((duration) => <option key={duration} value={duration}>{duration}s</option>)}</select><div><button title="Make a copy of this scene" aria-label="Make a copy of this scene" onClick={() => { const duplicate = { ...scene, id: crypto.randomUUID() }; setScenes((current) => [...current.slice(0, index + 1), duplicate, ...current.slice(index + 1)]); }}>⧉</button><button title="Remove this scene" aria-label="Remove this scene" onClick={() => setScenes((current) => current.filter((item) => item.id !== scene.id))}>×</button></div></div>
          </article>)}</div>
          <button className="scene-add" onClick={() => setScenes((current) => [...current, createScene()])}>+ Add another scene</button>
        </section>
        <aside className="panel settings">
          <div className="panel-pad"><div className="panel-head"><h3>Shape your film</h3><small>Make it yours</small></div></div>
          <div className="settings-section"><label>Where will you share it?</label><div className="platform-choices">{platformPresets.map((preset) => <label key={preset.id} className={settings.platformPresetIds?.includes(preset.id) ? "checked" : ""}><input type="checkbox" checked={settings.platformPresetIds?.includes(preset.id) ?? false} onChange={(event) => { const current = settings.platformPresetIds ?? []; updateSetting("platformPresetIds", event.target.checked ? [...current, preset.id] : current.filter((id) => id !== preset.id)); if (event.target.checked) updateSetting("format", preset.format); }}/><span><b>{preset.platform}</b><small>{preset.width} × {preset.height}</small></span></label>)}</div></div>
          <div className="settings-section"><label>Choose a frame</label><div className="choice-row">{formats.map((format) => <button key={format} className={`choice ${settings.format === format ? "selected" : ""}`} onClick={() => updateSetting("format", format)}>{format}</button>)}</div></div>
          <div className="settings-section"><label>How long should it be?</label><div className="choice-row">{[15,20,30,45,60].map((duration) => <button key={duration} className={`choice ${settings.duration === duration ? "selected" : ""}`} onClick={() => updateSetting("duration", duration)}>{duration}s</button>)}</div></div>
          <div className="settings-section"><label htmlFor="language">Film language</label><select id="language" value={settings.language} onChange={(event) => updateSetting("language", event.target.value)}><option>English</option><option>Norsk</option><option>Deutsch</option><option>Français</option><option>Español</option></select></div>
          <div className="settings-section"><label htmlFor="voice">Choose a voice that feels right</label><select id="voice" value={settings.voice} onChange={(event) => updateSetting("voice", event.target.value)}><option value="Maya · warm">Maya · warm</option><option value="Jules · considered">Jules · thoughtful</option><option value="Alex · assured">Alex · confident</option><option value="No voiceover">No voiceover</option></select></div>
          <div className="settings-section"><label>How should your film feel?</label><div className="choice-row">{styles.map((style) => <button key={style} className={`choice ${settings.style === style ? "selected" : ""}`} onClick={() => updateSetting("style", style)}>{styleLabels[style]}</button>)}</div></div>
          <div className="settings-section" id="music"><MusicStudio analysis={analysis} brief={creativeBrief ?? { brand: analysis.brand, productOrService: "", targetAudience: [], coreMessage: analysis.description, keyBenefits: analysis.sellingPoints, tone: ["modern"], visualStyle: settings.style, suggestedHook: analysis.title, callToAction: "Explore", suggestedPacing: "balanced", suggestedMusicDirection: "Modern", suggestedVoiceDirection: "Clear", recommendedPlatforms: [], evidence: [], confidence: "low" }} duration={settings.duration} selectedTrackId={settings.musicTrackId ?? null} onSelect={(trackId) => updateSetting("musicTrackId", trackId)}/></div>
          <div className="settings-section"><label htmlFor="music">Overall soundtrack feel</label><select id="music" value={settings.music} onChange={(event) => updateSetting("music", event.target.value)}><option value="Modern">Modern</option><option value="Subtle">Gentle</option><option value="Cinematic">Cinematic</option><option value="Energetic">Energetic</option><option value="None">No music</option></select></div>
          <div className="settings-section mixer-section"><label>Adjust the sound</label>{([ ["Narration", "voice", 0.8], ["Music", "music", 0.55], ["Scene sounds", "sfx", 0.25], ["Closing sound", "jingle", 0.35] ] as const).map(([label, key, defaultValue]) => <div className="mixer-row" key={key}><span>{label}</span><input aria-label={`${label} level`} type="range" min="0" max="1" step="0.05" value={settings.audioMix?.[key].volume ?? defaultValue} onChange={(event) => updateSetting("audioMix", { ...(settings.audioMix ?? { voice: { volume: 0.8, muted: false, fadeInSeconds: 0.8, fadeOutSeconds: 1.5, startSeconds: 0 }, music: { volume: 0.55, muted: false, fadeInSeconds: 0.8, fadeOutSeconds: 1.5, startSeconds: 0 }, sfx: { volume: 0.25, muted: false, fadeInSeconds: 0.8, fadeOutSeconds: 1.5, startSeconds: 0 }, jingle: { volume: 0.35, muted: false, fadeInSeconds: 0.8, fadeOutSeconds: 1.5, startSeconds: 0 }, duckMusicUnderVoice: true }), [key]: { ...(settings.audioMix?.[key] ?? { volume: defaultValue, muted: false, fadeInSeconds: 0.8, fadeOutSeconds: 1.5, startSeconds: 0 }), volume: Number(event.target.value) } })}/><b>{Math.round((settings.audioMix?.[key].volume ?? defaultValue) * 100)}%</b></div>)}<small>The music gently steps back while someone speaks. Adjust anything to taste.</small></div>
          <div className="settings-footer"><button className="button" disabled={!scenes.length} onClick={beginRender}>Make my film <span aria-hidden="true">→</span></button><p>Your story stays here as a preview you can revisit.</p></div>
        </aside>
      </div>}

      {stage === "render" && <section className="panel render-card"><div className="render-mark" aria-hidden="true">S</div><span className="eyebrow">One moment while we bring it together</span><h2>Putting your film together.</h2><p>Bringing your story, chosen voice and soundtrack together.</p><div className="render-progress"><div className="progress-track"><span /></div><div className="progress-stages"><span className="complete">Story</span><span className="complete">Voice</span><span className="complete">Sound</span><span>Your first look</span></div></div><p className="field-caption render-note">Putting your preview together…</p></section>}

      {stage === "result" && project && <div className="result-layout">
        <section className="panel result-frame"><div className="result-preview"><span className="result-play" aria-label="Your preview is ready">▶</span><div><h2>{project.scenes[0]?.headline ?? project.title}</h2><small>{project.analysis.brand.toUpperCase()} · FIRST LOOK</small></div></div></section>
        <aside className="panel result-side"><span className="eyebrow">YOUR FIRST LOOK / VERSION 1</span><h3>{project.title}</h3><p>{project.url}</p><p>Your story and settings are saved here. This preview doesn’t include a finished video file yet.</p><div className="result-actions"><button className="button" onClick={() => { const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }); const downloadUrl = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = downloadUrl; anchor.download = `${project.analysis.brand}-project.json`; anchor.click(); URL.revokeObjectURL(downloadUrl); }}>Download my project <span aria-hidden="true">↓</span></button><button className="button button-light" onClick={() => navigator.clipboard?.writeText(project.url)}>Copy website link</button><button className="button button-light" onClick={() => { setProject(null); setAnalysis(null); setUrl(""); setStage("website"); }}>Try another direction</button></div><div className="result-details"><div><span>Length</span><b>{project.settings.duration} sec</b></div><div><span>Format</span><b>{project.settings.format}</b></div><div><span>Feeling</span><b>{project.settings.style}</b></div><div><span>Scenes</span><b>{project.scenes.length}</b></div></div><Link href={`/projects/${project.id}`} className="text-link result-detail-link">See the full story →</Link></aside>
      </div>}
    </div>
  );
}
