import type { VideoProject } from "@/types/project";

const storageKey = "siterender.projects.v1";
const emptyProjects: VideoProject[] = [];
const listeners = new Set<() => void>();
let cachedProjects: VideoProject[] | null = null;

function safeImageUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function selectProjectThumbnail(project: Pick<VideoProject, "analysis" | "scenes">): string | undefined {
  const { analysis, scenes } = project;
  const primaryScene = [...scenes].sort((left, right) => (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER))[0];
  const analysisImages = new Set([analysis.openGraphImage, analysis.image, ...(analysis.images ?? [])].filter((image): image is string => Boolean(image)));
  const logoCandidates = new Set(analysis.logoCandidates ?? []);
  const sceneVisual = safeImageUrl(primaryScene?.visual);
  const sceneIsSourced = primaryScene?.visualSource === "website-image"
    || primaryScene?.visualSource === "open-graph"
    || analysis.source?.mode === "mock"
    || Boolean(primaryScene?.visual && analysisImages.has(primaryScene.visual));
  if (sceneIsSourced && sceneVisual) return sceneVisual;

  const openGraphImage = safeImageUrl(analysis.openGraphImage);
  if (openGraphImage) return openGraphImage;

  const relevantImage = [...(analysis.images ?? []), analysis.image]
    .find((image) => image && !logoCandidates.has(image) && safeImageUrl(image));
  return safeImageUrl(relevantImage);
}

export function getProjectThumbnail(project: Pick<VideoProject, "thumbnailUrl" | "analysis" | "scenes">): string | undefined {
  return safeImageUrl(project.thumbnailUrl) ?? selectProjectThumbnail(project);
}

export function getProjectVideoUrl(project: Pick<VideoProject, "renderJob">): string | undefined {
  const job = project.renderJob;
  if (job?.mode !== "real" || job.status !== "complete" || !job.outputUrl) return undefined;
  if (job.engine === "ffmpeg" && job.outputUrl === `/api/render/jobs/${job.renderId}/video`) return job.outputUrl;
  if (job.engine === "external" && job.outputUrl === `/api/render/jobs/${job.renderId}/video`) return job.outputUrl;
  try {
    const url = new URL(job.outputUrl);
    return (url.protocol === "https:" || url.protocol === "http:") && url.pathname.toLowerCase().endsWith(".mp4")
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

function persistProjects(projects: VideoProject[]): boolean {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(projects));
    return true;
  } catch {
    return false;
  }
}

function notifyProjectsChanged(): void {
  listeners.forEach((listener) => listener());
}

export function readProjects(): VideoProject[] {
  if (typeof window === "undefined") return emptyProjects;
  if (cachedProjects) return cachedProjects;
  let storedProjects: VideoProject[] = [];
  try {
    const value = window.localStorage.getItem(storageKey);
    storedProjects = value ? (JSON.parse(value) as VideoProject[]) : emptyProjects;
  } catch {
    storedProjects = emptyProjects;
  }
  let migrated = false;
  cachedProjects = storedProjects.map((project) => {
    const thumbnailUrl = safeImageUrl(project.thumbnailUrl) ?? selectProjectThumbnail(project) ?? "";
    if (project.thumbnailUrl === thumbnailUrl) return project;
    migrated = true;
    return { ...project, thumbnailUrl };
  });
  if (migrated) persistProjects(cachedProjects);
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
  const savedProject = project.thumbnailUrl === undefined
    ? { ...project, thumbnailUrl: selectProjectThumbnail(project) ?? "" }
    : project;
  const nextProjects = [savedProject, ...projects];
  if (!persistProjects(nextProjects)) throw new Error("Could not save the project to local storage.");
  cachedProjects = nextProjects;
  notifyProjectsChanged();
}

export function getProject(id: string): VideoProject | undefined {
  return readProjects().find((project) => project.id === id);
}

export function deleteProject(id: string): boolean {
  const projects = readProjects();
  const nextProjects = projects.filter((project) => project.id !== id);
  if (nextProjects.length === projects.length) return false;
  if (!persistProjects(nextProjects)) return false;
  cachedProjects = nextProjects;
  notifyProjectsChanged();
  return true;
}
