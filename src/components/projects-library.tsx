"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { getServerProjects, readProjects, subscribeProjects } from "@/lib/projects";

export function ProjectsLibrary() {
  const projects = useSyncExternalStore(subscribeProjects, readProjects, getServerProjects);

  return <div className="create-page">
    <div className="page-heading"><div><span className="eyebrow">Your creative library</span><h1>Projects</h1><p>Every story you’ve set in motion, in one place.</p></div><Link href="/create" className="button">New video <span aria-hidden="true">+</span></Link></div>
    {projects.length ? <div className="project-grid">{projects.map((project) => <Link className="project-card" href={`/projects/${project.id}`} key={project.id}><div className="project-thumb"><h2>{project.scenes[0]?.headline ?? project.title}</h2></div><div className="project-info"><h3>{project.title}</h3><p>{project.url}</p><div className="project-meta"><span>{new Date(project.createdAt).toLocaleDateString()}</span><span>{project.settings.duration}s · {project.settings.format} · V{project.version}</span></div></div></Link>)}</div> : <div className="panel empty-projects"><span className="eyebrow">NOTHING RENDERED YET</span><h2>Your library starts with a link.</h2><p>Once your first mock video is generated, it will appear here.</p><Link href="/create" className="button">Create your first video <span aria-hidden="true">→</span></Link></div>}
  </div>;
}
