import assert from "node:assert/strict";
import test from "node:test";
import { fetchWebsiteHtml } from "../src/lib/ingestion/fetch-html.ts";
import { parseWebsiteHtml } from "../src/lib/ingestion/parse-html.ts";
import { createCreativeBrief, detectBrandProfile } from "../src/lib/creative/create-brief.ts";
import { buildStoryboard } from "../src/lib/creative/storyboard-engine.ts";

const resolver = async () => [{ address: "93.184.216.34", family: 4 as const }];
const response = (status: number, headers: Record<string, string>, body = "<html><body>Public content</body></html>") => ({ status, headers, body });

test("validates every redirect target and blocks an internal redirect", async () => {
  await assert.rejects(fetchWebsiteHtml("https://public.example", {
    resolver,
    request: async (url) => url.hostname === "public.example"
      ? response(302, { location: "http://127.0.0.1/admin" })
      : response(200, { "content-type": "text/html" }),
  }), { code: "BLOCKED_URL" });
});

test("limits redirects and rejects HTTPS downgrade", async () => {
  await assert.rejects(fetchWebsiteHtml("https://public.example", {
    resolver,
    request: async () => response(301, { location: "http://public.example/page" }),
  }), { code: "BLOCKED_URL" });
  await assert.rejects(fetchWebsiteHtml("https://public.example", {
    resolver,
    maxRedirects: 1,
    request: async () => response(302, { location: "/next" }),
  }), { code: "UNAVAILABLE" });
});

test("rejects non-HTML content, access denials and oversized pages", async () => {
  await assert.rejects(fetchWebsiteHtml("https://public.example", { resolver, request: async () => response(200, { "content-type": "application/pdf" }) }), { code: "UNSUPPORTED_CONTENT" });
  await assert.rejects(fetchWebsiteHtml("https://public.example", { resolver, request: async () => response(403, { "content-type": "text/html" }) }), { code: "ACCESS_DENIED" });
  await assert.rejects(fetchWebsiteHtml("https://public.example", { resolver, maxBytes: 20, request: async () => response(200, { "content-type": "text/html" }) }), { code: "RESPONSE_TOO_LARGE" });
});

test("extracts metadata, headings, image candidates, links, language and source confidence", () => {
  const html = `<html lang="en"><head><title>Acme | Better planning</title><meta name="description" content="Plan projects with less effort."><meta property="og:site_name" content="Acme"><meta property="og:image" content="/social.jpg"><link rel="canonical" href="/home"><link rel="icon" href="/favicon.png"><style>body{color:#123456}</style></head><body><h1>Plan work clearly</h1><h2>Built for small teams</h2><p>Trusted by 2000+ teams.</p><a href="/start">Get started</a><img src="/logo.svg" alt="Acme logo"><img src="https://cdn.example.com/product.jpg" alt="Product"></body></html>`;
  const analysis = parseWebsiteHtml(html, "https://acme.example/");
  assert.equal(analysis.title, "Acme | Better planning");
  assert.equal(analysis.description, "Plan projects with less effort.");
  assert.equal(analysis.canonicalUrl, "https://acme.example/home");
  assert.equal(analysis.faviconUrl, "https://acme.example/favicon.png");
  assert.equal(analysis.openGraphImage, "https://acme.example/social.jpg");
  assert.deepEqual(analysis.headings, ["Plan work clearly", "Built for small teams"]);
  assert.equal(analysis.language, "en");
  assert.equal(analysis.logoCandidates?.[0], "https://acme.example/logo.svg");
  assert.equal(analysis.relevantLinks?.[0]?.url, "https://acme.example/start");
  assert.ok(analysis.proofPoints?.length);
  assert.equal(analysis.fieldSources?.title?.confidence, "high");
});

test("classifies distinct website types and creates an evidence-led brief", () => {
  const restaurant = parseWebsiteHtml("<html><head><title>Harbor Table</title><meta name='description' content='Seasonal food and dinner reservations.'></head><body><h1>Book a table</h1><h2>Our menu</h2></body></html>", "https://harbor.example/");
  const profile = detectBrandProfile(restaurant);
  assert.equal(profile.category, "restaurant");
  const brief = createCreativeBrief({ ...restaurant, brandProfile: profile });
  assert.equal(brief.brand, "Harbor Table");
  assert.match(brief.coreMessage, /Seasonal food/);
});

test("generates category-adaptive scene counts, details, and target duration", () => {
  const restaurant = parseWebsiteHtml("<html><head><title>Harbor Table</title><meta name='description' content='Seasonal food and dinner reservations.'></head><body><h1>Book a table</h1><h2>Our menu</h2></body></html>", "https://harbor.example/");
  const profile = detectBrandProfile(restaurant);
  const enriched = { ...restaurant, brandProfile: profile };
  const brief = createCreativeBrief(enriched);
  const storyboard = buildStoryboard(enriched, brief, { targetDuration: 20, idFactory: (() => { let id = 0; return () => `scene-${++id}`; })() });
  assert.equal(storyboard.scenes.length, 5);
  assert.equal(storyboard.totalDuration, 20);
  assert.equal(storyboard.scenes.at(-1)?.cta, brief.callToAction);
  assert.ok(storyboard.scenes.every((scene) => scene.id && scene.order !== undefined && scene.transition && scene.musicCue !== undefined || scene.id));
  const saas = { ...enriched, brandProfile: { ...profile, category: "saas" as const } };
  const saasStory = buildStoryboard(saas, createCreativeBrief(saas), { targetDuration: 20 });
  assert.equal(saasStory.scenes.length, 4);
});
