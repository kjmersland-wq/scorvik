"use client";

import { useEffect, useRef, useState } from "react";
import { renderProjectInBrowser } from "@/lib/render/browser-render";
import type { VideoFormat, VideoProject } from "@/types/project";
import type { Locale } from "@/lib/i18n/copy";

const formats: Array<{ id: VideoFormat; label: string; note: { en: string; no: string } }> = [
  { id: "16:9", label: "16:9", note: { en: "YouTube, web", no: "YouTube, nett" } },
  { id: "9:16", label: "9:16", note: { en: "Reels, TikTok, Shorts", no: "Reels, TikTok, Shorts" } },
  { id: "1:1", label: "1:1", note: { en: "Feed, LinkedIn", no: "Feed, LinkedIn" } },
  { id: "4:5", label: "4:5", note: { en: "Instagram feed", no: "Instagram-feed" } },
];

const languages = [
  { id: "no", label: "Norsk" }, { id: "en", label: "English" }, { id: "sv", label: "Svenska" },
  { id: "da", label: "Dansk" }, { id: "de", label: "Deutsch" }, { id: "es", label: "Español" },
];

interface Job { key: string; label: string; status: "waiting" | "working" | "done" | "failed"; percent: number; url?: string; file?: string; error?: string }

function sourceLanguage(project: VideoProject): string {
  const value = project.settings.language.toLowerCase();
  if (value.startsWith("nors") || value === "no") return "no";
  return "en";
}

export function VersionsPanel({ project, locale = "en" }: { project: VideoProject; locale?: Locale }) {
  const nb = locale === "no";
  const original = sourceLanguage(project);
  const [selectedFormats, setSelectedFormats] = useState<VideoFormat[]>([project.settings.format]);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([original]);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const urls = useRef<string[]>([]);

  useEffect(() => {
    void fetch("/api/copy").then((response) => response.ok ? response.json() : { available: false }).then((data: { available?: boolean }) => setAiAvailable(Boolean(data.available))).catch(() => {});
    const created = urls;
    return () => { abort.current?.abort(); created.current.forEach((url) => URL.revokeObjectURL(url)); };
  }, []);

  const toggle = <T,>(list: T[], value: T) => list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  const patch = (key: string, change: Partial<Job>) => setJobs((current) => current.map((job) => job.key === key ? { ...job, ...change } : job));

  async function translate(language: string) {
    if (language === original) return project.scenes;
    const response = await fetch("/api/copy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ task: "translate", language, scenes: project.scenes.map((scene) => ({ id: scene.id, purpose: scene.purpose, headline: scene.headline, supportingText: scene.supportingText })) }),
    });
    if (!response.ok) throw new Error(nb ? "Oversettelse er ikke tilgjengelig akkurat nå." : "Translation is not available right now.");
    const data = await response.json() as { scenes: Array<{ id: string; headline: string; supportingText: string }> };
    return project.scenes.map((scene) => {
      const next = data.scenes.find((item) => item.id === scene.id);
      return next ? { ...scene, headline: next.headline, supportingText: next.supportingText } : scene;
    });
  }

  async function run() {
    const plan = selectedLanguages.flatMap((language) => selectedFormats.map((format) => ({ language, format })));
    if (!plan.length) return;
    urls.current.forEach((url) => URL.revokeObjectURL(url));
    urls.current = [];
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setJobs(plan.map(({ language, format }) => ({ key: `${language}-${format}`, label: `${languages.find((item) => item.id === language)?.label ?? language} · ${format}`, status: "waiting", percent: 0 })));
    const scenesByLanguage = new Map<string, Awaited<ReturnType<typeof translate>>>();
    for (const { language, format } of plan) {
      const key = `${language}-${format}`;
      if (controller.signal.aborted) break;
      patch(key, { status: "working" });
      try {
        if (!scenesByLanguage.has(language)) scenesByLanguage.set(language, await translate(language));
        const variant: VideoProject = { ...project, settings: { ...project.settings, format }, scenes: scenesByLanguage.get(language)! };
        const result = await renderProjectInBrowser(variant, (percent) => patch(key, { percent }), controller.signal);
        const url = URL.createObjectURL(result.blob);
        urls.current.push(url);
        patch(key, { status: "done", percent: 100, url, file: `${project.analysis.brand}-${format.replace(":", "x")}-${language}.mp4` });
      } catch (error) {
        if (controller.signal.aborted) break;
        patch(key, { status: "failed", error: error instanceof Error ? error.message : "Failed" });
      }
    }
    setBusy(false);
  }

  return <section className="panel panel-pad versions-panel">
    <div className="panel-head"><h2>{nb ? "Flere versjoner" : "More versions"}</h2><small>{nb ? "Alle formater og språk i én omgang" : "All formats and languages in one go"}</small></div>
    <div className="settings-section"><label>{nb ? "Formater" : "Formats"}</label>
      <div className="choice-row">{formats.map((format) => <button key={format.id} type="button" className={`choice ${selectedFormats.includes(format.id) ? "selected" : ""}`} aria-pressed={selectedFormats.includes(format.id)} onClick={() => setSelectedFormats((current) => toggle(current, format.id))} disabled={busy}>{format.label} · {format.note[nb ? "no" : "en"]}</button>)}</div>
    </div>
    <div className="settings-section"><label>{nb ? "Språk" : "Languages"}</label>
      <div className="choice-row">{languages.map((language) => {
        const locked = language.id !== original && !aiAvailable;
        return <button key={language.id} type="button" className={`choice ${selectedLanguages.includes(language.id) ? "selected" : ""}`} aria-pressed={selectedLanguages.includes(language.id)} onClick={() => setSelectedLanguages((current) => toggle(current, language.id))} disabled={busy || locked} title={locked ? (nb ? "Krever ANTHROPIC_API_KEY på serveren" : "Needs ANTHROPIC_API_KEY on the server") : undefined}>{language.label}{language.id === original ? (nb ? " (original)" : " (original)") : ""}</button>;
      })}</div>
      {!aiAvailable && <p className="field-caption">{nb ? "Oversettelse slås på når ANTHROPIC_API_KEY er lagt inn i Vercel." : "Translation turns on once ANTHROPIC_API_KEY is added in Vercel."}</p>}
    </div>
    <div className="result-actions">
      <button className="button" type="button" disabled={busy || !selectedFormats.length || !selectedLanguages.length} onClick={() => void run()}>{busy ? (nb ? "Lager…" : "Making…") : (nb ? `Lag ${selectedFormats.length * selectedLanguages.length} versjon(er)` : `Make ${selectedFormats.length * selectedLanguages.length} version(s)`)}</button>
      {busy && <button className="button button-light" type="button" onClick={() => abort.current?.abort()}>{nb ? "Avbryt" : "Cancel"}</button>}
    </div>
    {jobs.length > 0 && <ul className="version-list">{jobs.map((job) => <li key={job.key}><b>{job.label}</b><span>{job.status === "done" && job.url ? <a className="button button-small" href={job.url} download={job.file}>{nb ? "Last ned MP4" : "Download MP4"} ↓</a> : job.status === "failed" ? `${nb ? "Feilet" : "Failed"}: ${job.error ?? ""}` : job.status === "working" ? `${job.percent}%` : (nb ? "Venter" : "Waiting")}</span></li>)}</ul>}
  </section>;
}
