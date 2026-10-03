import type { VideoProject } from "@/types/project";

const storageKey = "siterender.projects.v1";
const emptyProjects: VideoProject[] = [];
const listeners = new Set<() => void>();
let cachedProjects: VideoProject[] | null = null;

export function readProjects(): VideoProject[] {
  if (typeof window === "undefined") return emptyProjects;
  if (cachedProjects) return cachedProjects;
  try {
    const value = window.localStorage.getItem(storageKey);
    cachedProjects = value ? (JSON.parse(value) as VideoProject[]) : emptyProjects;
  } catch {
    cachedProjects = emptyProjects;
  }
  return cachedProjects;
}

export function subscribeProjects(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getServerProjects(): VideoProject[] {
  return emptyProjects;
}

export function saveProject(project: VideoProject): void {
  const projects = readProjects().filter((item) => item.id !== project.id);
  cachedProjects = [project, ...projects];
  window.localStorage.setItem(storageKey, JSON.stringify(cachedProjects));
  listeners.forEach((listener) => listener());
}

export function getProject(id: string): VideoProject | undefined {
  return readProjects().find((project) => project.id === id);
}
