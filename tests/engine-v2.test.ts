import assert from "node:assert/strict";
import test from "node:test";
import { estimateBeatGrid, snapToBeats } from "../src/lib/audio/beats.ts";
import { condenseCaption, highlightKeywords, pickAccent } from "../src/lib/creative/captions.ts";
import { countWords, fitDurations, readingSeconds } from "../src/lib/creative/timing.ts";

test("reading time is words / 2.5 plus a second of padding", () => {
  assert.equal(countWords("From the Delta porch to Chicago electric"), 7);
  assert.equal(readingSeconds("one two three four five"), 3); // 5 / 2.5 + 1
  assert.equal(readingSeconds(""), 0);
});

test("durations respect reading minimums and add up exactly", () => {
  const fit = fitDurations([3, 6, 3, 4], 20);
  assert.equal(fit.durations.reduce((a, b) => a + b, 0), 20);
  assert.ok(fit.fits);
  assert.ok(fit.durations.every((value, index) => value >= [3, 6, 3, 4][index]));
  const tight = fitDurations([8, 8, 8], 15);
  assert.equal(tight.fits, false);
  assert.equal(tight.durations.reduce((a, b) => a + b, 0), 15);
});

test("captions are cut at natural boundaries, with no dangling words", () => {
  assert.equal(condenseCaption("Short and clear", 8), "Short and clear");
  const long = condenseCaption("Dagens rett, kjøkkenet, et fullt lokale. Det du ser, holder. Og mer enn det til og med.", 9);
  assert.ok(countWords(long) <= 9, long);
  assert.ok(!/\b(og|til|at)$/i.test(long.replace(/…$/, "")));
});

test("keywords favour numbers, names and long meaningful words", () => {
  assert.deepEqual(highlightKeywords("From the Delta porch to Chicago electric", "en", 2), ["Delta", "Chicago"]);
  assert.deepEqual(highlightKeywords("Fyll uka med 100 tekster", "no", 1), ["100"]);
  assert.equal(pickAccent(["#111111", "#e8a33d"]), "#e8a33d");
  assert.equal(pickAccent(["#222"]), "#f3c767");
});

test("beat grid is found in a click track and cuts snap onto it", () => {
  const rate = 22050;
  const seconds = 20;
  const samples = new Float32Array(rate * seconds);
  const period = 60 / 100; // 100 BPM
  for (let beat = 0; beat * period + 0.25 < seconds; beat += 1) {
    const at = Math.round((0.25 + beat * period) * rate);
    for (let i = 0; i < 400; i += 1) samples[at + i] = Math.sin(i / 3) * Math.exp(-i / 90);
  }
  const grid = estimateBeatGrid(samples, rate);
  assert.ok(grid, "grid found");
  assert.ok(Math.abs(grid.bpm - 100) < 3, `bpm ${grid.bpm}`);
  const phase = ((grid.offset - 0.25) % period + period) % period;
  assert.ok(Math.min(phase, period - phase) < 0.06, `offset ${grid.offset}`);
  const snapped = snapToBeats([0, 6.1, 12.2, 18.1], grid, 24);
  for (const cut of snapped.slice(1)) {
    const fromBeat = ((cut - grid.offset) % grid.period + grid.period) % grid.period;
    assert.ok(Math.min(fromBeat, grid.period - fromBeat) < 0.08 || Math.abs(cut - [6.1, 12.2, 18.1][snapped.indexOf(cut) - 1]) < 0.01);
  }
});

import { assignRoles, hypeWords, validateScenes } from "../src/lib/ai/copy-llm.ts";
import { classifyIntent } from "../src/lib/creative/intent.ts";
import type { SiteAnalysis } from "../src/types/project.ts";

const base: SiteAnalysis = { url: "https://x.example/", title: "X", description: "", brand: "X", colors: [], sellingPoints: [], image: "" };

test("pages that teach are told apart from pages that sell", () => {
  const guide = classifyIntent({ ...base, title: "Getting started: a step-by-step guide", steps: [{ title: "Install", description: "Install it" }, { title: "Configure", description: "Set it up" }, { title: "Run", description: "Run it" }] });
  assert.equal(guide.intent, "instruction");
  const shop = classifyIntent({ ...base, title: "Buy now", callsToAction: ["Start free trial", "Book a demo"], description: "Pricing from $29 per month" });
  assert.equal(shop.intent, "advert");
});

test("story roles follow a hook, problem, offer, proof, close shape; guides get goal and numbered steps", () => {
  const scene = (purpose: string) => ({ id: purpose, purpose, headline: "h", supportingText: "" });
  assert.deepEqual(assignRoles([scene("Hook"), scene("Story"), scene("Product"), scene("Proof"), scene("CTA")], "advert"), ["hook", "problem", "offer", "proof", "close"]);
  assert.deepEqual(assignRoles([scene("Story"), scene("Step"), scene("Step"), scene("CTA")], "instruction"), ["goal", "step 1", "step 2", "close"]);
});

test("hype words never reach the screen", () => {
  assert.ok(hypeWords.test("The ultimate toolkit"));
  assert.ok(hypeWords.test("Verdens beste kaffe"));
  const scenes = [{ id: "a", purpose: "Story", headline: "Ship calmly", supportingText: "" }];
  const out = validateScenes([{ id: "a", headline: "The ultimate way to ship", supportingText: "" }], scenes, "ship", false);
  assert.equal(out?.[0].headline, "Ship calmly");
});

import { chooseTextPlacement, edgeFraction } from "../src/lib/render/busyness.ts";

function frame(width: number, height: number, paint: (x: number, y: number) => number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) { const v = paint(x, y); const i = (y * width + x) * 4; data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255; }
  return data;
}

test("printed lettering in a picture is detected, calm areas are not", () => {
  const calm = frame(128, 24, (x) => 80 + x * 0.3);
  const lettering = frame(128, 24, (x, y) => ((Math.floor(x / 6) + Math.floor(y / 6)) % 2 === 0 ? 240 : 20));
  assert.ok(edgeFraction(calm, 128, 24) < 0.01);
  assert.ok(edgeFraction(lettering, 128, 24) > 0.2);
});

test("text moves away from lettering, or sits on a panel when nowhere is calm", () => {
  assert.deepEqual(chooseTextPlacement({ top: 0.01, bottom: 0.02 }, false), { position: "bottom", panel: 0 });
  assert.equal(chooseTextPlacement({ top: 0.01, bottom: 0.3 }, false).position, "top");
  const boxed = chooseTextPlacement({ top: 0.3, bottom: 0.3 }, false);
  assert.equal(boxed.position, "bottom");
  assert.ok(boxed.panel >= 0.55);
  assert.equal(chooseTextPlacement({ top: 0.01, bottom: 0.3 }, true).position, "bottom"); // vertical films keep the top free for platform UI
});

import { visualQueryFor } from "../src/lib/creative/visual-queries.ts";

test("pictures follow what the scene says", () => {
  const site: SiteAnalysis = { ...base, title: "AutoVere: tolls and fuel in Europe", description: "Plan road trips" };
  assert.equal(visualQueryFor("Story", site, "advert", "Ferries across the fjord"), "ferry sailing sea");
  assert.equal(visualQueryFor("Story", site, "advert", "Bompenger i 90 land"), "highway toll road");
  assert.equal(visualQueryFor("Hook", site, "advert", "Familien på tur med bobil"), "motorhome camper van road");
  assert.equal(visualQueryFor("Hook", site, "advert", "Something unrelated"), "family road trip car"); // falls back to the site's own theme
});
