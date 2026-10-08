import assert from "node:assert/strict";
import { test } from "node:test";
import { applyEdits, planEdit, sanitizeEdits, type EditableScene } from "../src/lib/director/edit.ts";
import { generateImage, imageArguments, runFal } from "../src/lib/director/fal.ts";
import { adaptForAspect, compositionHint, imageSizeFor } from "../src/lib/director/formats.ts";
import { PermanentError, decide, estimateCost, requestHash, runWithFallback, seedFor } from "../src/lib/director/router.ts";
import { buildReview, failedPrecheck, imageDimensions, precheck } from "../src/lib/director/review.ts";

const env = {};
const noSleep = async () => {};

test("the router picks models by quality tier, and never swaps a reference model", () => {
  const final = decide({ task: "image", tier: "final" }, env);
  assert.equal(final.spec.model, "fal-ai/flux/dev");
  assert.deepEqual(final.fallbacks.map((spec) => spec.model), ["fal-ai/flux/schnell"]);
  const draft = decide({ task: "image", tier: "draft" }, env);
  assert.equal(draft.spec.model, "fal-ai/flux/schnell");
  assert.equal(decide({ task: "image", hasReference: true }, env).fallbacks.length, 0);
  assert.equal(decide({ task: "image", hasProductReference: true }, env).spec.task, "image_product");
  assert.equal(decide({ task: "image", hasReference: true, hasProductReference: true }, env).spec.task, "image_ref");
  assert.equal(decide({ task: "image", tier: "final" }, { FAL_IMAGE_MODEL: "my/own-model" }).spec.model, "my/own-model");
});

test("a draft video is the free local zoom, a final one the video model", () => {
  const draft = decide({ task: "video", tier: "draft" }, env);
  assert.equal(draft.spec.provider, "local");
  assert.equal(estimateCost(draft.spec), 0);
  assert.equal(decide({ task: "video", tier: "final" }, env).spec.task, "video");
});

test("retry then fallback: degraded only when a fallback model succeeded", async () => {
  const decision = decide({ task: "image", tier: "final" }, env);
  const calls: string[] = [];
  const ok = await runWithFallback(decision, async (spec) => { calls.push(spec.model); if (calls.length === 1) throw new Error("busy"); return "picture"; }, { sleep: noSleep });
  assert.equal(ok.value, "picture");
  assert.equal(ok.degraded, false);
  assert.equal(ok.attempts, 2);
  const viaFallback = await runWithFallback(decision, async (spec) => { if (spec.model === "fal-ai/flux/dev") throw new Error("down"); return "fast picture"; }, { sleep: noSleep });
  assert.equal(viaFallback.degraded, true);
  assert.equal(viaFallback.spec.model, "fal-ai/flux/schnell");
  assert.equal(viaFallback.attempts, 3);
});

test("a permanent error stops at once, and all-failed reports the last errors", async () => {
  const decision = decide({ task: "image", tier: "final" }, env);
  let calls = 0;
  await assert.rejects(runWithFallback(decision, async () => { calls += 1; throw new PermanentError("no key"); }, { sleep: noSleep }), PermanentError);
  assert.equal(calls, 1);
  await assert.rejects(runWithFallback(decision, async () => { throw new Error("nope"); }, { sleep: noSleep }), /All attempts failed.*nope/);
});

test("cost estimates follow the model price and are null when unknown", () => {
  const specs = decide({ task: "image", tier: "draft" }, env);
  assert.equal(estimateCost(specs.spec, { imageSize: "landscape_16_9" }), 0.00177);
  assert.equal(estimateCost(decide({ task: "image", tier: "final" }, env).spec, { imageSize: "square_hd" }), 0.02621);
  assert.equal(estimateCost(decide({ task: "image", hasProductReference: true }, env).spec), 0.04);
  assert.equal(estimateCost(decide({ task: "video", tier: "final" }, env).spec, { seconds: 5 }), null);
});

test("hashes are order-independent and seeds repeat per request but differ per variation", () => {
  assert.equal(requestHash({ a: 1, b: [1, 2] }, "x"), requestHash({ b: [1, 2], a: 1 }, "x"));
  assert.notEqual(requestHash("a"), requestHash("b"));
  const base = requestHash("scene", "prompt");
  assert.equal(seedFor(base, 0), seedFor(base, 0));
  assert.notEqual(seedFor(base, 0), seedFor(base, 1));
  assert.ok(seedFor(base, 3) >= 0 && seedFor(base, 3) < 2_147_483_647);
});

test("format rules give each ratio its own composition and swap extreme wides in tall frames", () => {
  assert.match(compositionHint("9:16"), /captions/);
  assert.equal(compositionHint("21:9"), "");
  assert.deepEqual(adaptForAspect("Extreme Wide Shot", "18mm Ultra-Wide", "9:16"), { shotType: "Wide Shot", lens: "24mm Wide" });
  assert.deepEqual(adaptForAspect("Extreme Wide Shot", "18mm Ultra-Wide", "1:1"), { shotType: "Wide Shot", lens: "24mm Wide" });
  assert.deepEqual(adaptForAspect("Extreme Wide Shot", "18mm Ultra-Wide", "16:9"), {});
  assert.equal(imageSizeFor("4:5"), "custom_4_5");
  assert.equal(imageSizeFor("5:7"), "landscape_16_9");
});

function png(width: number, height: number, size = 2000): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

test("the deterministic precheck catches empty files and the wrong aspect ratio", () => {
  assert.deepEqual(imageDimensions(png(1024, 576)), [1024, 576]);
  assert.deepEqual(precheck(png(1024, 576), "16:9"), []);
  assert.match(precheck(png(1024, 1024), "16:9")[0], /Wrong aspect ratio/);
  assert.match(precheck(new Uint8Array(10), "16:9")[0], /empty/);
  assert.deepEqual(precheck(new Uint8Array(5000).fill(1), "16:9"), []); // unknown format: not judged
  assert.equal(failedPrecheck(["x"]).passed, false);
});

test("a review passes from the score, never from the model's own verdict", () => {
  assert.equal(buildReview({ score: 4, issues: [], advice: "" }, "claude", false).passed, true);
  assert.equal(buildReview({ score: 3, issues: ["soft"], advice: "sharper" }, "claude", false).passed, false);
  assert.equal(buildReview({ score: 5, product_recognizable: false }, "claude", true).passed, false);
  assert.equal(buildReview({ score: 5, product_recognizable: false }, "claude", false).passed, true);
  assert.equal(buildReview({ score: 99 }, "claude", false).score, 5);
  assert.equal(buildReview({ score: "x" }, "claude", false).score, 1);
});

test("image arguments are built per model and reference pictures are required", async () => {
  const [draft, final, ref, product] = [decide({ task: "image", tier: "draft" }, env).spec, decide({ task: "image", tier: "final" }, env).spec, decide({ task: "image", hasReference: true }, env).spec, decide({ task: "image", hasProductReference: true }, env).spec];
  assert.equal(imageArguments(draft, { prompt: "p", aspect: "16:9", seed: 7 }).num_inference_steps, 4);
  assert.equal(imageArguments(draft, { prompt: "p", aspect: "16:9" }).guidance_scale, undefined);
  assert.equal(imageArguments(final, { prompt: "p", aspect: "16:9" }).guidance_scale, 3.5);
  assert.deepEqual(imageArguments(final, { prompt: "p", aspect: "4:5" }).image_size, { width: 832, height: 1040 });
  assert.equal(imageArguments(ref, { prompt: "p", aspect: "1:1", referenceImageUrl: "https://x/y.png" }).reference_image_url, "https://x/y.png");
  assert.equal(imageArguments(product, { prompt: "p", aspect: "4:5", productImageUrl: "https://x/p.png" }).aspect_ratio, "3:4");
  await assert.rejects(generateImage(ref, { prompt: "p", aspect: "1:1" }, { key: "k" }), PermanentError);
});

test("the fal client submits, polls and returns the result, and refuses without a key", async () => {
  const seen: string[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const address = String(url);
    seen.push(`${init?.method ?? "GET"} ${address}`);
    if (address.startsWith("https://queue.fal.run/fal-ai/flux/dev")) return Response.json({ status_url: "https://queue.fal.run/status/1", response_url: "https://queue.fal.run/result/1" });
    if (address.endsWith("/status/1")) return Response.json({ status: seen.filter((line) => line.endsWith("/status/1")).length < 2 ? "IN_PROGRESS" : "COMPLETED" });
    return Response.json({ images: [{ url: "https://v3.fal.media/files/a.png" }] });
  }) as typeof fetch;
  const url = await generateImage(decide({ task: "image", tier: "final" }, env).spec, { prompt: "p", aspect: "16:9" }, { key: "k", fetchImpl, pollMs: 1 });
  assert.equal(url, "https://v3.fal.media/files/a.png");
  assert.equal(seen.filter((line) => line.endsWith("/status/1")).length, 2);
  await assert.rejects(runFal("fal-ai/flux/dev", {}, { key: "", fetchImpl }), PermanentError);
  const rejecting = (async () => new Response("no", { status: 401 })) as unknown as typeof fetch;
  await assert.rejects(runFal("fal-ai/flux/dev", {}, { key: "k", fetchImpl: rejecting }), PermanentError);
  const evil = (async (url: string | URL | Request) => String(url).includes("queue.fal.run") ? Response.json({ status_url: "https://evil.example/s", response_url: "https://evil.example/r" }) : Response.json({})) as typeof fetch;
  await assert.rejects(runFal("fal-ai/flux/dev", {}, { key: "k", fetchImpl: evil }), /unexpected queue address/);
});

const scenes: EditableScene[] = [
  { id: "a", headline: "Plan trips with exact tolls", supportingText: "30+ countries", voiceover: "Plan your trip.", duration: 6, visualQuery: "highway toll road" },
  { id: "b", headline: "Is this for you?", supportingText: "", voiceover: "Maybe it is.", duration: 5 },
];

test("edit plans only touch known scenes, keep limits and refuse invented numbers", () => {
  const plan = sanitizeEdits({
    summary: "Shorter and calmer.",
    edits: [
      { scene_id: "a", reason: "shorter", headline: "Know the true toll", duration: 4, visualQuery: "calm mountain road" },
      { scene_id: "zzz", headline: "ghost" },
      { scene_id: "b", headline: "Ready in 10 minutes" },
      { scene_id: "b", supportingText: "x".repeat(300) },
      { scene_id: "b", duration: 99 },
      { scene_id: "a", voiceover: "Plan your trip." },
    ],
  }, scenes, "make scene one calmer");
  assert.deepEqual(plan.edits, [{ sceneId: "a", reason: "shorter", changes: { headline: "Know the true toll", visualQuery: "calm mountain road", duration: 4 } }]);
  assert.equal(plan.summary, "Shorter and calmer.");
  const allowed = sanitizeEdits({ summary: "", edits: [{ scene_id: "b", headline: "Ready in 30 seconds" }] }, scenes, "mention 30 seconds");
  assert.equal(allowed.edits.length, 1);
});

test("applied edits change only the named fields of the named scenes", () => {
  const plan = { summary: "", edits: [{ sceneId: "a", reason: "", changes: { headline: "New", duration: 4 } }] };
  const next = applyEdits(scenes, plan);
  assert.equal(next[0].headline, "New");
  assert.equal(next[0].duration, 4);
  assert.equal(next[0].supportingText, "30+ countries");
  assert.equal(next[1], scenes[1]);
  assert.equal(scenes[0].headline, "Plan trips with exact tolls");
});

test("planEdit sends the film and the instruction and returns a sanitized plan", async () => {
  let seen = "";
  const plan = await planEdit({ instruction: "make the first scene calmer", scenes, focusSceneId: "a" }, async (options) => {
    seen = typeof options.content === "string" ? options.content : "";
    return { summary: "Calmer.", edits: [{ scene_id: "a", headline: "A calmer line" }] };
  });
  assert.match(seen, /Focus scene id: a/);
  assert.match(seen, /make the first scene calmer/);
  assert.equal(plan.edits[0].changes.headline, "A calmer line");
});
