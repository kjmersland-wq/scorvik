import assert from "node:assert/strict";
import test from "node:test";
import { fetchWebsiteHtml } from "../src/lib/ingestion/fetch-html.ts";
import { parseWebsiteHtml } from "../src/lib/ingestion/parse-html.ts";
import { createCreativeBrief, detectBrandProfile } from "../src/lib/creative/create-brief.ts";
import { buildStoryboard, recommendInstructionDuration, validateStoryboard } from "../src/lib/creative/storyboard-engine.ts";
import { WebsiteIngestionService } from "../src/lib/ingestion/website-ingestion.ts";
import { analyzeWebsite } from "../src/lib/engine/analyze-website.ts";

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
  const html = `<html lang="en"><head><title>Acme | Better planning</title><meta name="description" content="Plan projects with less effort."><meta property="og:site_name" content="Acme"><meta property="og:image" content="/social.jpg"><link rel="canonical" href="/home"><link rel="icon" href="/favicon.png"><style>body{color:#123456}</style></head><body><h1>Plan work clearly</h1><h2>Built for small teams</h2><ol><li>Create a workspace</li><li>Invite your team</li></ol><button>Continue setup</button><p>Trusted by 2000+ teams.</p><a href="/start">Get started</a><img src="/logo.svg" alt="Acme logo"><img src="https://cdn.example.com/product.jpg" alt="Product"></body></html>`;
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
  assert.deepEqual(analysis.steps?.map((step) => step.title), ["Create a workspace", "Invite your team"]);
  assert.ok(analysis.buttons?.includes("Continue setup"));
  assert.ok(analysis.proofPoints?.length);
  assert.equal(analysis.fieldSources?.title?.confidence, "high");
});

test("classifies distinct website types and creates an evidence-led brief", () => {
  const restaurant = parseWebsiteHtml("<html><head><title>Harbor Table</title><meta name='description' content='Seasonal food and dinner reservations.'></head><body><h1>Book a table</h1><h2>Our menu</h2><a href='/reserve'>Book now</a></body></html>", "https://harbor.example/");
  const profile = detectBrandProfile(restaurant);
  assert.equal(profile.category, "restaurant");
  const brief = createCreativeBrief({ ...restaurant, brandProfile: profile });
  assert.equal(brief.brand, "Harbor Table");
  assert.match(brief.coreMessage, /Seasonal food/);
});

test("generates an evidence-conditioned advertising structure and target duration", () => {
  const restaurant = parseWebsiteHtml("<html><head><title>Harbor Table</title><meta name='description' content='Seasonal food and dinner reservations.'></head><body><h1>Book a table</h1><h2>Our menu</h2><a href='/reserve'>Book now</a></body></html>", "https://harbor.example/");
  const profile = detectBrandProfile(restaurant);
  const enriched = { ...restaurant, brandProfile: profile };
  const brief = createCreativeBrief(enriched);
  const storyboard = buildStoryboard(enriched, brief, { targetDuration: 20, idFactory: (() => { let id = 0; return () => `scene-${++id}`; })() });
  assert.equal(storyboard.scenes.length, 3);
  assert.equal(storyboard.totalDuration, 20);
  assert.equal(storyboard.scenes.at(-1)?.cta, brief.callToAction);
  assert.ok(!storyboard.scenes.some((scene) => scene.purpose === "Proof"));
  const saas = { ...enriched, brandProfile: { ...profile, category: "saas" as const } };
  const saasStory = buildStoryboard(saas, createCreativeBrief(saas), { targetDuration: 20 });
  assert.deepEqual(saasStory.scenes.map((scene) => scene.purpose), ["Hook", "Product", "CTA"]);
  assert.equal(saasStory.scenes.length, 3);
  assert.equal(buildStoryboard(saas, createCreativeBrief(saas), { targetDuration: 60 }).totalDuration, 30);
});

test("instruction stories keep one scene per ordered step and explain the recommended duration", () => {
  const site = parseWebsiteHtml("<html><head><title>Quietform</title></head><body><h1>Work calmly</h1><ol><li>Create a workspace</li><li>Invite your team</li><li>Set up a workflow</li><li>Review the result</li></ol></body></html>", "https://quietform.example/");
  const brief = createCreativeBrief(site);
  const storyboard = buildStoryboard(site, brief, { mode: "instruction", locale: "no" });
  assert.deepEqual(storyboard.scenes.map((scene) => scene.headline), site.steps?.map((step) => step.title));
  assert.ok(storyboard.scenes.every((scene) => scene.purpose === "Step"));
  assert.equal(storyboard.totalDuration, 60);
  assert.match(storyboard.rationale, /4 steg/);
  assert.deepEqual(recommendInstructionDuration(1, "no"), { seconds: 25, rationale: "Ett steg, omtrent 25 sekunder." });
  assert.equal(recommendInstructionDuration(7, "no").seconds, 90);
});

test("classifies requested business categories from explicit site language", () => {
  const cases = [
    ["Shop our collection", "ecommerce"],
    ["Cloud software platform", "saas"],
    ["Seaside hotel and resort", "hotel-travel"],
    ["Guided tours of the fjords", "tourism"],
    ["Local plumbing service", "local-service"],
    ["Independent law firm", "professional-service"],
    ["Wellness clinic and therapy", "health-wellness"],
    ["A distinctive product brand", "product-brand"],
    ["Independent podcast and newsletter", "content"],
    ["Regional media company", "media"],
    ["A page about something", "other"],
  ] as const;
  for (const [heading, expected] of cases) {
    const site = parseWebsiteHtml(`<html><head><title>${heading}</title></head><body><h1>${heading}</h1></body></html>`, "https://example.test/");
    assert.equal(detectBrandProfile(site).category, expected, heading);
  }
});

test("handles weak metadata, missing OG imagery, and multiple detected calls to action conservatively", () => {
  const site = parseWebsiteHtml("<html><head><title>Partial page", "https://shop.example/");
  assert.equal(site.openGraphImage, undefined);
  assert.equal(site.image, "");
  assert.equal(site.fieldSources?.title?.confidence, "low");
  assert.doesNotThrow(() => detectBrandProfile(site));

  const multiple = parseWebsiteHtml("<html><head><title>Harbor Table</title></head><body><a href='/book'>Book a table</a><button>See menu</button><button>Contact us</button></body></html>", "https://harbor.example/");
  assert.deepEqual(multiple.callsToAction, ["Book a table", "See menu", "Contact us"]);
  assert.equal(buildStoryboard(multiple, createCreativeBrief(multiple)).scenes.some((scene) => scene.purpose === "Proof"), false);
});

test("the full deterministic pipeline ingests a fixture and returns a sourced brief, storyboard and music", async () => {
  const html = `<html lang="en"><head><title>Harbor Table</title><meta name="description" content="Seasonal food and dinner reservations."><meta property="og:image" content="/dining.jpg"></head><body><h1>Seasonal dining by the harbor</h1><h2>Book a table</h2><a href="/reserve">Book now</a><img src="/dining.jpg" alt="Dining room"><p>Fresh seasonal dishes, prepared daily.</p><p>Trusted by 300+ guests.</p></body></html>`;
  const ingestion = new WebsiteIngestionService({ resolver, request: async () => response(200, { "content-type": "text/html; charset=utf-8" }, html) });
  const result = await analyzeWebsite("https://harbor.example", { duration: 20 }, ingestion);

  assert.equal(result.source.mode, "real");
  assert.equal(result.analysis.brandProfile?.category, "restaurant");
  assert.ok(result.brief.evidence.length > 0);
  assert.equal(result.storyboard.totalDuration, result.storyboard.scenes.reduce((sum, scene) => sum + scene.duration, 0));
  assert.deepEqual(result.storyboard.scenes.map((scene) => scene.purpose), ["Hook", "Product", "Proof", "CTA"]);
  assert.ok(result.storyboard.scenes.every((scene) => scene.duration > 0 && scene.voiceover));
  assert.ok(result.music.length > 0);
  assert.deepEqual(result.storyboard.scenes.map((scene) => scene.id), ["scene-1", "scene-2", "scene-3", "scene-4"]);
  assert.deepEqual(validateStoryboard(result.storyboard), []);
});

test("invalid and private URLs fail before any website request", async () => {
  await assert.rejects(analyzeWebsite("not a url"), { code: "INVALID_URL" });
  await assert.rejects(analyzeWebsite("http://127.0.0.1/admin"), { code: "BLOCKED_URL" });
});
