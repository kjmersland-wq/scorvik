"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { getServerProjects, readProjects, subscribeProjects } from "@/lib/projects";
import { getCopy, localizedPath, type Locale } from "@/lib/i18n/copy";

const styleLabels: Record<string, string> = { Editorial: "Thoughtful", Cinematic: "Film-like", Clean: "Clear", Energetic: "Lively", Minimal: "Quiet" };

export function ProjectDetail({ id, locale = "en" }: { id: string; locale?: Locale }) {
  const projectList = useSyncExternalStore(subscribeProjects, readProjects, getServerProjects);
  const project = projectList.find((item) => item.id === id) ?? null;
  const text = getCopy(locale).projectDetail;
  const href = (path: string) => localizedPath(locale, path);
  const styleLabels: Record<string, string> = locale === "no"
    ? { Editorial: "Ettertenksom", Cinematic: "Filmatisk", Clean: "Klar", Energetic: "Livlig", Minimal: "Rolig" }
    : { Editorial: "Thoughtful", Cinematic: "Film-like", Clean: "Clear", Energetic: "Lively", Minimal: "Quiet" };

  if (!project) return <div className="create-page" lang={locale === "no" ? "nb" : "en"}><div className="panel empty-projects"><h2>{text.missingTitle}</h2><p>{text.missingDescription}</p><Link href={href("/projects")} className="button button-light">{text.back}</Link></div></div>;

  return <div className="create-page" lang={locale === "no" ? "nb" : "en"}>
    <div className="page-heading"><div><span className="eyebrow">{text.eyebrow} / {locale === "no" ? "Versjon" : "Version"} {project.version}</span><h1>{project.title}</h1><p>{project.url}</p></div><Link href={href("/create")} className="button button-light button-small">{text.tryDirection} <span aria-hidden="true">↗</span></Link></div>
    <div className="result-layout"><section className="panel result-frame"><div className="result-preview"><span className="result-play">▶</span><div><h2>{project.scenes[0]?.headline ?? project.title}</h2><small>{project.analysis.brand.toUpperCase()} · {text.eyebrow.toUpperCase()}</small></div></div></section><aside className="panel result-side"><span className="eyebrow">{text.choices}</span><h3>{project.analysis.title}</h3><p>{project.analysis.description}</p><p>{text.savedDraft}</p><div className="result-details"><div><span>{text.started}</span><b>{new Date(project.createdAt).toLocaleDateString(locale === "no" ? "nb-NO" : "en-US")}</b></div><div><span>{text.length}</span><b>{project.settings.duration} {locale === "no" ? "sek" : "sec"}</b></div><div><span>{text.format}</span><b>{project.settings.format}</b></div><div><span>{text.feeling}</span><b>{styleLabels[project.settings.style] ?? project.settings.style}</b></div><div><span>{text.voice}</span><b>{project.settings.voice}</b></div></div></aside></div>
    <section className="panel panel-pad storyboard-detail"><div className="panel-head"><h2>{text.storyTitle}</h2><small>{project.scenes.length} {text.sceneCount}</small></div><div className="scene-list">{project.scenes.map((scene, index) => <article className="scene-row" key={scene.id}><div className="scene-art" style={{ backgroundImage: `url("${scene.visual}")` }}/><div className="scene-copy"><div className="scene-topline"><b>{String(index + 1).padStart(2, "0")}</b><span>{getCopy(locale).create.sceneLabels[scene.purpose]}</span><span>{scene.duration} {locale === "no" ? "sek" : "s"}</span></div><h4>{scene.headline}</h4><p>{scene.voiceover}</p></div></article>)}</div></section>
  </div>;
}
