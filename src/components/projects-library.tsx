"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { getServerProjects, readProjects, subscribeProjects } from "@/lib/projects";
import { getCopy, localizedPath, type Locale } from "@/lib/i18n/copy";

export function ProjectsLibrary({ locale = "en" }: { locale?: Locale }) {
  const projects = useSyncExternalStore(subscribeProjects, readProjects, getServerProjects);
  const text = getCopy(locale).projects;
  const href = (path: string) => localizedPath(locale, path);

  return <div className="create-page">
    <div className="page-heading"><div><span className="eyebrow">{text.eyebrow}</span><h1>{text.title}</h1><p>{text.description}</p></div><Link href={href("/create")} className="button">{text.startAnother} <span aria-hidden="true">+</span></Link></div>
    {projects.length ? <div className="project-grid">{projects.map((project) => <Link className="project-card" href={href(`/projects/${project.id}`)} key={project.id}><div className="project-thumb"><h2>{project.scenes[0]?.headline ?? project.title}</h2></div><div className="project-info"><h3>{project.title}</h3><p>{project.url}</p><div className="project-meta"><span>{new Date(project.createdAt).toLocaleDateString(locale === "no" ? "nb-NO" : "en-US")}</span><span>{project.settings.duration}{text.secondsUnit} · {project.settings.format} · {locale === "no" ? "Versjon" : "Version"} {project.version}</span></div></div></Link>)}</div> : <div className="panel empty-projects"><span className="eyebrow">{text.emptyEyebrow}</span><h2>{text.emptyTitle}</h2><p>{text.emptyDescription}</p><Link href={href("/create")} className="button">{text.start} <span aria-hidden="true">→</span></Link></div>}
  </div>;
}
