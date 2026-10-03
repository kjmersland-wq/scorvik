"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { getServerProjects, readProjects, subscribeProjects } from "@/lib/projects";

const styleLabels: Record<string, string> = { Editorial: "Thoughtful", Cinematic: "Film-like", Clean: "Clear", Energetic: "Lively", Minimal: "Quiet" };

export function ProjectDetail({ id }: { id: string }) {
  const projectList = useSyncExternalStore(subscribeProjects, readProjects, getServerProjects);
  const project = projectList.find((item) => item.id === id) ?? null;

  if (!project) return <div className="create-page"><div className="panel empty-projects"><h2>We can’t find that story here.</h2><p>It may be saved in another browser. Your other projects are still here.</p><Link href="/projects" className="button button-light">Back to my films</Link></div></div>;

  return <div className="create-page">
    <div className="page-heading"><div><span className="eyebrow">Your story / Version {project.version}</span><h1>{project.title}</h1><p>{project.url}</p></div><Link href="/create" className="button button-light button-small">Try another direction <span aria-hidden="true">↗</span></Link></div>
    <div className="result-layout"><section className="panel result-frame"><div className="result-preview"><span className="result-play">▶</span><div><h2>{project.scenes[0]?.headline ?? project.title}</h2><small>{project.analysis.brand.toUpperCase()} · FIRST LOOK</small></div></div></section><aside className="panel result-side"><span className="eyebrow">YOUR CHOICES</span><h3>{project.analysis.title}</h3><p>{project.analysis.description}</p><p>This is your saved story preview, not a finished video file yet.</p><div className="result-details"><div><span>Started</span><b>{new Date(project.createdAt).toLocaleDateString()}</b></div><div><span>Length</span><b>{project.settings.duration} sec</b></div><div><span>Format</span><b>{project.settings.format}</b></div><div><span>Feeling</span><b>{styleLabels[project.settings.style] ?? project.settings.style}</b></div><div><span>Voice</span><b>{project.settings.voice}</b></div></div></aside></div>
    <section className="panel panel-pad storyboard-detail"><div className="panel-head"><h2>Here’s your story</h2><small>{project.scenes.length} scenes</small></div><div className="scene-list">{project.scenes.map((scene, index) => <article className="scene-row" key={scene.id}><div className="scene-art" style={{ backgroundImage: `url("${scene.visual}")` }}/><div className="scene-copy"><div className="scene-topline"><b>{String(index + 1).padStart(2, "0")}</b><span>{scene.purpose}</span><span>{scene.duration}s</span></div><h4>{scene.headline}</h4><p>{scene.voiceover}</p></div></article>)}</div></section>
  </div>;
}
