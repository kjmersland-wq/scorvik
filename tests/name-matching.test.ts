import assert from "node:assert/strict";
import test from "node:test";
import { createCreativeBrief } from "../src/lib/creative/create-brief.ts";
import { buildStoryboard } from "../src/lib/creative/storyboard-engine.ts";
import type { SiteAnalysis } from "../src/types/project.ts";

function site(alts: Record<string, string>): SiteAnalysis {
  return {
    url: "https://blues.example/", title: "Blues Encyclopedia", description: "A reference site about blues artists.", brand: "Blues", colors: [], sellingPoints: [],
    image: "https://blues.example/og.jpg", headings: ["Memphis Minnie", "Robert Johnson", "Where the blues began"],
    images: Object.keys(alts), imageAlts: alts,
  };
}

test("a name is printed over the picture only when the image is tied to that name", () => {
  const wrong = site({ "https://blues.example/a.jpg": "Robert Johnson portrait", "https://blues.example/b.jpg": "Robert Johnson portrait", "https://blues.example/c.jpg": "crowd" });
  const wrongBoard = buildStoryboard(wrong, createCreativeBrief(wrong), { targetDuration: 30 });
  const minnie = wrongBoard.scenes.find((scene) => scene.headline === "Memphis Minnie");
  if (minnie) assert.equal(minnie.noOverlay, true);

  const right = site({ "https://blues.example/memphis-minnie.jpg": "memphis minnie", "https://blues.example/b.jpg": "Robert Johnson portrait" });
  const rightBoard = buildStoryboard(right, createCreativeBrief(right), { targetDuration: 30 });
  const matched = rightBoard.scenes.find((scene) => scene.headline === "Memphis Minnie");
  if (matched) { assert.notEqual(matched.noOverlay, true); assert.equal(matched.visual, "https://blues.example/memphis-minnie.jpg"); }
});

import { closingQuestion, focusHeadline, introQuestion } from "../src/lib/creative/copy-voice.ts";

test("copy voice keeps one message per scene and stays stable per brand", () => {
  assert.deepEqual(focusHeadline("Short and clear"), { headline: "Short and clear", rest: "" });
  const split = focusHeadline("Sosiale medier for restauranter, uten byrå – dere lager innholdet og vi skriver teksten til gjestene");
  assert.equal(split.headline, "Sosiale medier for restauranter, uten byrå");
  assert.match(split.rest, /^dere lager innholdet/);
  assert.equal(introQuestion("no", 3, "Acme"), introQuestion("no", 3, "Acme"));
  assert.match(introQuestion("en", 3, "Acme"), /3/);
  assert.ok(closingQuestion("no", "Acme").endsWith("?"));
});

import { passesFactGuard, validateScenes } from "../src/lib/ai/copy-llm.ts";

test("AI copy may rephrase but never add numbers or names", () => {
  const source = "Acme sender 100 tekster i måneden til Instagram og Facebook.";
  assert.equal(passesFactGuard("100 tekster hver måned på Instagram", source), true);
  assert.equal(passesFactGuard("200 tekster hver måned", source), false);
  assert.equal(passesFactGuard("Brukt av Coca-Cola og Nike", source), false);
  const scenes = [{ id: "a", purpose: "Step", headline: "Del det som skjer", supportingText: "Dagens rett" }, { id: "b", purpose: "CTA", headline: "Passer dette?", supportingText: "", locked: true }];
  const out = validateScenes([{ id: "a", headline: "Del dagens rett", supportingText: "" }, { id: "b", headline: "Kjøp nå!", supportingText: "" }], scenes, "dagens rett", false);
  assert.equal(out?.[0].headline, "Del dagens rett");
  assert.equal(out?.[1].headline, "Passer dette?");
  const bad = validateScenes([{ id: "a", headline: "Spar 50 prosent", supportingText: "" }, { id: "b", headline: "x", supportingText: "" }], scenes, "dagens rett", false);
  assert.equal(bad?.[0].headline, "Del det som skjer");
  const translated = validateScenes([{ id: "a", headline: "Share what happens", supportingText: "Dish of the day" }, { id: "b", headline: "Does this fit?", supportingText: "" }], scenes, "", true);
  assert.equal(translated?.[0].headline, "Share what happens");
  assert.equal(translated?.[1].headline, "Does this fit?");
});
