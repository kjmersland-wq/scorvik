"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { deleteProject, getServerProjects, readProjects, subscribeProjects } from "@/lib/projects";
import { getCopy, localizedPath, type Locale } from "@/lib/i18n/copy";

export function ProjectsLibrary({ locale = "en" }: { locale?: Locale }) {
  const projects = useSyncExternalStore(subscribeProjects, readProjects, getServerProjects);
  const text = getCopy(locale).projects;
  const href = (path: string) => localizedPath(locale, path);
  const removeProject = (id: string) => {
    if (window.confirm(text.confirmDelete)) deleteProject(id);
  };

  return <div className="create-page">
    <div className="page-heading"><div><span className="eyebrow">{text.eyebrow}</span><h1>{text.title}</h1><p>{text.description}</p></div><Link href={href("/create")} className="button">{text.startAnother} <span aria-hidden="true">+</span></Link></div>
    {projects.length ? <div className="project-grid">{projects.map((project) => <article className="project-card" key={project.id}>
      <div className="project-thumb" style={project.thumbnailUrl ? { backgroundImage: `linear-gradient(0deg,#102019c9,transparent 70%),url("${project.thumbnailUrl}")` } : undefined}><Link href={href(`/projects/${project.id}`)}><h2>{project.scenes[0]?.headline ?? project.title}</h2></Link></div>
      <div className="project-info"><Link href={href(`/projects/${project.id}`)}><h3>{project.title}</h3><p>{project.url}</p></Link><div className="project-meta"><span>{new Date(project.createdAt).toLocaleDateString(locale === "no" ? "nb-NO" : "en-US")}</span><span>{project.settings.duration}{text.secondsUnit} · {project.settings.format} · {locale === "no" ? "Versjon" : "Version"} {project.version}</span><button type="button" className="text-link" aria-label={`${text.deleteProject} ${project.title}`} onClick={() => removeProject(project.id)}>{text.deleteProject}</button></div></div>
    </article>)}</div> : <div className="panel empty-projects"><span className="eyebrow">{text.emptyEyebrow}</span><h2>{text.emptyTitle}</h2><p>{text.emptyDescription}</p><Link href={href("/create")} className="button">{text.start} <span aria-hidden="true">→</span></Link></div>}
  </div>;
}
