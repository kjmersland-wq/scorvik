import assert from "node:assert/strict";
import test from "node:test";
import { fetchWebsiteHtml } from "../src/lib/ingestion/fetch-html.ts";
import { WebsiteIngestionError } from "../src/lib/ingestion/security.ts";
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

test("retries another validated address when the first address cannot connect", async () => {
  const attempted: string[] = [];
  const result = await fetchWebsiteHtml("https://slow-blues.com/", {
    resolver: async () => [
      { address: "2606:4700:3031::6815:4b08", family: 6 },
      { address: "104.21.75.8", family: 4 },
    ],
    request: async (_url, address) => {
      attempted.push(address.address);
      if (address.family === 6) throw new WebsiteIngestionError("UNAVAILABLE", "network unavailable");
      return response(200, { "content-type": "text/html" }, "<html><body>Reachable public content with enough text</body></html>");
    },
  });
  assert.deepEqual(attempted, ["2606:4700:3031::6815:4b08", "104.21.75.8"]);
  assert.equal(result.url, "https://slow-blues.com/");
});

test("does not attempt a public address if the same DNS answer contains a private address", async () => {
  let attempted = false;
  await assert.rejects(fetchWebsiteHtml("https://mixed.example/", {
    resolver: async () => [
      { address: "104.21.75.8", family: 4 },
      { address: "10.0.0.8", family: 4 },
    ],
    request: async () => {
      attempted = true;
      return response(200, { "content-type": "text/html" });
    },
  }), { code: "BLOCKED_URL" });
  assert.equal(attempted, false);
});

test("retries another pinned edge after a transient CDN 5xx response", async () => {
  const attempted: string[] = [];
  const result = await fetchWebsiteHtml("https://cdn.example/", {
    resolver: async () => [
      { address: "104.21.75.8", family: 4 },
      { address: "172.67.166.61", family: 4 },
    ],
    request: async (_url, address) => {
      attempted.push(address.address);
      return address.address === "104.21.75.8"
        ? response(522, { "content-type": "text/html" }, "edge connection timed out")
        : response(200, { "content-type": "text/html" }, "<html><body>Reachable public content with enough text</body></html>");
    },
  });
  assert.deepEqual(attempted, ["104.21.75.8", "172.67.166.61"]);
  assert.equal(result.status, 200);
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
  assert.equal(storyboard.scenes.length, 4);
  assert.equal(storyboard.totalDuration, 20);
  assert.equal(storyboard.scenes.at(-1)?.cta, brief.callToAction);
  assert.ok(!storyboard.scenes.some((scene) => scene.purpose === "Proof"));
  const saas = { ...enriched, brandProfile: { ...profile, category: "saas" as const } };
  const saasStory = buildStoryboard(saas, createCreativeBrief(saas), { targetDuration: 20 });
  assert.equal(saasStory.scenes[0]?.purpose, "Hook");
  assert.equal(saasStory.scenes.at(-1)?.purpose, "CTA");
  assert.equal(saasStory.scenes.length, 4);
  assert.equal(saasStory.totalDuration, 20);
  assert.equal(buildStoryboard(saas, createCreativeBrief(saas), { targetDuration: 60 }).totalDuration, 60);
});

test("instruction stories keep one scene per ordered step and explain the recommended duration", () => {
  const site = parseWebsiteHtml("<html><head><title>Quietform</title></head><body><h1>Work calmly</h1><ol><li>Create a workspace</li><li>Invite your team</li><li>Set up a workflow</li><li>Review the result</li></ol></body></html>", "https://quietform.example/");
  const brief = createCreativeBrief(site, { mode: "instruction", targetDuration: recommendInstructionDuration(site.steps?.length ?? 0).seconds });
  const storyboard = buildStoryboard(site, brief, { mode: "instruction", locale: "no" });
  assert.match(storyboard.scenes[0]?.headline ?? "", /4 (enkle )?steg/);
  assert.equal(storyboard.scenes[0]?.supportingText, "Work calmly");
  assert.deepEqual(storyboard.scenes.filter((scene) => scene.purpose === "Step").map((scene) => scene.headline), site.steps?.map((step) => step.title));
  assert.equal(storyboard.totalDuration, 60);
  assert.match(storyboard.rationale, /4 steg/);
  assert.deepEqual(recommendInstructionDuration(1, "no"), { seconds: 25, rationale: "Ett steg, omtrent 25 sekunder." });
  assert.equal(recommendInstructionDuration(7, "no").seconds, 90);
});

test("brief and storyboard honor every supported promotional duration with distinct evidence-led scenes", () => {
  const headings = Array.from({ length: 16 }, (_, index) => `<h2>Stage ${index + 1}: ${["Plan work clearly", "Keep records together", "Review changes quickly", "Coordinate a reliable handoff"][index % 4]} ${index + 1}</h2><p>Distinct source detail ${index + 1} explains how this part of the service works for the customer in everyday use.</p>`).join("");
  const steps = Array.from({ length: 10 }, (_, index) => `<li>Step ${index + 1}: complete a distinct task and verify the result before continuing.</li>`).join("");
  const html = `<html><head><title>Northstar Operations</title><meta name="description" content="A documented operations platform for teams that need clear, reliable workflows."></head><body><h1>Make team operations clearer</h1>${headings}<ol>${steps}</ol><p>Trusted by 2500+ teams.</p><a href="/start">Get started</a></body></html>`;
  const site = parseWebsiteHtml(html, "https://northstar.example/");
  const durations = [15, 20, 30, 45, 60, 90, 120, 180];
  let previousSceneCount = 0;
  for (const duration of durations) {
    const brief = createCreativeBrief(site, { mode: "advert", targetDuration: duration });
    const storyboard = buildStoryboard(site, brief, { mode: "advert", targetDuration: duration, idFactory: (() => { let id = 0; return () => `promo-${duration}-${++id}`; })() });
    assert.equal(brief.targetDuration, duration);
    assert.equal(brief.durationMode, "advert");
    assert.ok(brief.durationGuidance.length > 0);
    assert.equal(storyboard.totalDuration, duration);
    assert.equal(storyboard.durationWithinTolerance, true);
    assert.deepEqual(validateStoryboard(storyboard), []);
    assert.ok(storyboard.scenes.length > previousSceneCount);
    assert.equal(new Set(storyboard.scenes.map((scene) => scene.headline.toLowerCase())).size, storyboard.scenes.length);
    assert.equal(storyboard.scenes[0]?.purpose, "Hook");
    assert.equal(storyboard.scenes.at(-1)?.purpose, "CTA");
    previousSceneCount = storyboard.scenes.length;
  }
});

test("instructional duration recommendation follows extracted steps and preserves ordered steps", () => {
  const headings = Array.from({ length: 16 }, (_, index) => `<h2>Reference detail ${index + 1}</h2><p>Additional verified detail ${index + 1} explains a separate part of the workflow and its intended outcome.</p>`).join("");
  const steps = Array.from({ length: 10 }, (_, index) => `<li>Step ${index + 1}: perform a unique action and check its completion state.</li>`).join("");
  const site = parseWebsiteHtml(`<html><head><title>Workflow Guide</title><meta name="description" content="A guided process for completing a multi-stage workflow."></head><body><h1>Complete the workflow from start to finish</h1>${headings}<ol>${steps}</ol><a href="/start">Get started</a></body></html>`, "https://guide.example/");
  const brief = createCreativeBrief(site, { mode: "instruction", targetDuration: recommendInstructionDuration(site.steps?.length ?? 0).seconds });
  const storyboard = buildStoryboard(site, brief, { mode: "instruction" });
  const stepScenes = storyboard.scenes.filter((scene) => scene.purpose === "Step");
  assert.equal(brief.durationMode, "instruction");
  assert.equal(brief.targetDuration, 120);
  assert.equal(storyboard.requestedDuration, 120);
  assert.equal(storyboard.totalDuration, 120);
  assert.equal(storyboard.durationWithinTolerance, true);
  // captions are condensed to 8 words, but stay in order and start with the step's own words
  assert.equal(stepScenes.length, site.steps?.length);
  stepScenes.forEach((scene, index) => assert.ok(site.steps?.[index].title.startsWith(scene.headline.replace(/…$/, "").trim()), scene.headline));
  assert.equal(storyboard.scenes.at(-1)?.purpose, "CTA");
});

test("sparse source content is shortened with an explicit duration warning instead of padded scenes", () => {
  const site = parseWebsiteHtml("<html><head><title>Quiet Place</title></head><body><h1>A quiet place to work</h1></body></html>", "https://quiet.example/");
  const brief = createCreativeBrief(site, { mode: "advert", targetDuration: 180 });
  const storyboard = buildStoryboard(site, brief, { mode: "advert", targetDuration: 180 });
  assert.ok(storyboard.totalDuration < 180);
  assert.equal(storyboard.durationWithinTolerance, false);
  assert.match(storyboard.rationale, /shortened from 180 seconds/);
  assert.ok(validateStoryboard(storyboard).includes("duration outside requested tolerance"));
  assert.equal(new Set(storyboard.scenes.map((scene) => scene.headline)).size, storyboard.scenes.length);
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
  assert.equal(result.brief.targetDuration, 20);
  assert.equal(result.storyboard.requestedDuration, 20);
  assert.equal(result.storyboard.durationWithinTolerance, true);
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
