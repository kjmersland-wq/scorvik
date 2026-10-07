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
