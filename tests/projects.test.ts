import assert from "node:assert/strict";
import test from "node:test";
import { deleteProject, getProject, readProjects, saveProject, selectProjectThumbnail, subscribeProjects } from "../src/lib/projects.ts";
import type { SiteAnalysis, StoryScene, VideoProject } from "../src/types/project.ts";

const scene = (id: string, visual: string, order = 0, visualSource?: StoryScene["visualSource"]): StoryScene => ({
  id,
  order,
  purpose: "Hook",
  duration: 5,
  headline: "A sourced story",
  supportingText: "",
  voiceover: "A sourced story.",
  transition: "Fade",
  visual,
  visualSource,
});

function makeProject(id: string, analysis: SiteAnalysis, scenes: StoryScene[], thumbnailUrl?: string): VideoProject {
  return {
    id,
    title: `Project ${id}`,
    url: analysis.url,
    createdAt: "2026-10-05T00:00:00.000Z",
    analysis,
    scenes,
    settings: { format: "16:9", duration: 30, language: "English", voice: "Maya", style: "Editorial", music: "Modern" },
    version: 1,
    thumbnailUrl,
  };
}

function analysis(overrides: Partial<SiteAnalysis> = {}): SiteAnalysis {
  return {
    url: "https://example.com/",
    title: "Example",
    description: "An example business website.",
    brand: "Example",
    colors: [],
    sellingPoints: [],
    image: "",
    images: [],
    ...overrides,
  };
}

test("selects the sourced primary scene image, then OG, then a non-logo extracted image", () => {
  const site = analysis({
    image: "https://cdn.example.com/general.jpg",
    openGraphImage: "https://cdn.example.com/og.jpg",
    images: ["https://cdn.example.com/logo.png", "https://cdn.example.com/product.jpg"],
    logoCandidates: ["https://cdn.example.com/logo.png"],
  });
  const first = makeProject("first", site, [
    scene("later", "https://cdn.example.com/later.jpg", 1, "website-image"),
    scene("primary", "https://cdn.example.com/story.jpg", 0, "website-image"),
  ]);
  const second = makeProject("second", site, [scene("primary-2", "https://cdn.example.com/story.jpg", 0, "website-image")]);
  assert.equal(selectProjectThumbnail(first), "https://cdn.example.com/story.jpg");
  assert.equal(selectProjectThumbnail(second), "https://cdn.example.com/story.jpg");
  assert.equal(selectProjectThumbnail(makeProject("og", site, [])), "https://cdn.example.com/og.jpg");
  assert.equal(selectProjectThumbnail(makeProject("image", analysis({ images: site.images, logoCandidates: site.logoCandidates }), [])), "https://cdn.example.com/product.jpg");
  assert.equal(selectProjectThumbnail(makeProject("empty", analysis(), [])), undefined);
});

test("backfills legacy thumbnails and deletes only the selected localStorage project", (t) => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage } });
  t.after(() => {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  });

  const site = analysis({
    openGraphImage: "https://cdn.example.com/site-og.jpg",
    images: ["https://cdn.example.com/site-photo.jpg"],
  });
  const legacyFirst = makeProject("first", site, []);
  const legacySecond = makeProject("second", analysis(), []);
  values.set("siterender.projects.v1", JSON.stringify([legacyFirst, legacySecond]));
  let notifications = 0;
  const unsubscribe = subscribeProjects(() => { notifications += 1; });
  t.after(unsubscribe);

  const migrated = readProjects();
  assert.equal(migrated[0].thumbnailUrl, "https://cdn.example.com/site-og.jpg");
  assert.equal(migrated[1].thumbnailUrl, "");
  assert.equal(JSON.parse(values.get("siterender.projects.v1") ?? "[]")[0].thumbnailUrl, "https://cdn.example.com/site-og.jpg");

  saveProject(makeProject("third", site, [scene("third-scene", "https://cdn.example.com/primary.jpg", 0, "website-image")]));
  assert.equal(getProject("third")?.thumbnailUrl, "https://cdn.example.com/primary.jpg");
  assert.equal(deleteProject("first"), true);
  assert.equal(getProject("first"), undefined);
  assert.deepEqual(readProjects().map((project) => project.id), ["third", "second"]);
  assert.deepEqual(JSON.parse(values.get("siterender.projects.v1") ?? "[]").map((project: VideoProject) => project.id), ["third", "second"]);
  assert.equal(notifications, 2);
  assert.equal(deleteProject("missing"), false);
  assert.deepEqual(readProjects().map((project) => project.id), ["third", "second"]);
  assert.equal(notifications, 2);
});