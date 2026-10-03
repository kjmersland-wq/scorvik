"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { getServerProjects, readProjects, subscribeProjects } from "@/lib/projects";

export function ProjectDetail({ id }: { id: string }) {
  const projectList = useSyncExternalStore(subscribeProjects, readProjects, getServerProjects);
  const project = projectList.find((item) => item.id === id) ?? null;

  if (!project) return <div className="create-page"><div className="panel empty-projects"><h2>Project not found</h2><p>This project may be stored in another browser.</p><Link href="/projects" className="button button-light">Back to projects</Link></div></div>;

  return <div className="create-page">
    <div className="page-heading"><div><span className="eyebrow">Project / Version {project.version}</span><h1>{project.title}</h1><p>{project.url}</p></div><Link href="/create" className="button button-light button-small">Create another version <span aria-hidden="true">↗</span></Link></div>
    <div className="result-layout"><section className="panel result-frame"><div className="result-preview"><span className="result-play">▶</span><div><h2>{project.scenes[0]?.headline ?? project.title}</h2><small>{project.analysis.brand.toUpperCase()} · BRAND FILM</small></div></div></section><aside className="panel result-side"><span className="eyebrow">RENDER DETAILS</span><h3>{project.analysis.title}</h3><p>{project.analysis.description}</p><div className="result-details"><div><span>Created</span><b>{new Date(project.createdAt).toLocaleDateString()}</b></div><div><span>Duration</span><b>{project.settings.duration} sec</b></div><div><span>Format</span><b>{project.settings.format}</b></div><div><span>Style</span><b>{project.settings.style}</b></div><div><span>Voice</span><b>{project.settings.voice}</b></div></div></aside></div>
    <section className="panel panel-pad storyboard-detail"><div className="panel-head"><h2>Storyboard</h2><small>{project.scenes.length} scenes</small></div><div className="scene-list">{project.scenes.map((scene, index) => <article className="scene-row" key={scene.id}><div className="scene-art" style={{ backgroundImage: `url("${scene.visual}")` }}/><div className="scene-copy"><div className="scene-topline"><b>{String(index + 1).padStart(2, "0")}</b><span>{scene.purpose}</span><span>{scene.duration}s</span></div><h4>{scene.headline}</h4><p>{scene.voiceover}</p></div></article>)}</div></section>
  </div>;
}
