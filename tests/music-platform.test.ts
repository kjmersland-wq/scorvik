import assert from "node:assert/strict";
import test from "node:test";
import { fitMusicToVideo, musicGainWithVoiceDucking } from "../src/lib/audio/mix.ts";
import { getPlatformPreset, getPlatformPresets, platformPresets } from "../src/lib/platforms/presets.ts";
import { demoMusicCatalog, isClearedRoyaltyFreeTrack, localMusicFiles, recommendMusic } from "../src/lib/music/recommend.ts";
import { findTaxonomyEntry, moodChoices, musicTaxonomy } from "../src/lib/music/taxonomy.ts";
import { createCreativeBrief, detectBrandProfile } from "../src/lib/creative/create-brief.ts";
import type { SiteAnalysis } from "../src/types/project.ts";

const analysis = (category: "saas" | "restaurant" | "other"): SiteAnalysis => ({
  url: "https://sample.example/",
  title: "Sample brand",
  description: "A polished modern service made for thoughtful customers.",
  brand: "Sample",
  colors: [],
  sellingPoints: ["A thoughtful solution"],
  image: "",
  headings: ["A thoughtful way to work"],
  brandProfile: { name: "Sample", category, productOrService: "A thoughtful modern service", tone: ["warm", "modern"], colors: [], evidence: ["A thoughtful way to work"], confidence: "medium" },
});

test("taxonomy covers required genre breadth, subgenres and mood discovery", () => {
  for (const genre of ["Blues", "Jazz", "Rock", "Electronic", "Acoustic / Folk", "Cinematic", "Soul / R&B", "World"]) assert.ok(musicTaxonomy.some((entry) => entry.genre === genre));
  assert.ok(findTaxonomyEntry("Blues")?.subgenres.includes("Chicago Blues"));
  assert.ok(findTaxonomyEntry("Blues")?.instrumentation.includes("Harmonica"));
  assert.deepEqual(moodChoices, ["Warm", "Bold", "Calm", "Energetic", "Cinematic", "Playful", "Elegant", "Emotional", "Modern", "Nostalgic", "Adventurous", "Authentic"]);
});

test("music ranking is deterministic, brand-sensitive and respects explicit genre", () => {
  const site = analysis("saas");
  const brief = createCreativeBrief(site);
  const recommendations = recommendMusic({ analysis: site, brief, duration: 30, platform: "youtube", mode: "advert", userMoods: ["Modern", "Confident"] });
  assert.equal(recommendations[0]?.track.id, "modern-92-ad");
  assert.deepEqual(recommendations.map((item) => item.track.id), recommendMusic({ analysis: site, brief, duration: 30, platform: "youtube", mode: "advert", userMoods: ["Modern", "Confident"] }).map((item) => item.track.id));
  assert.ok(recommendations.every((item) => item.track.usage === "ad" && item.licenseWarning.includes("royalty-free")));
  const bluesOnly = recommendMusic({ analysis: site, brief, duration: 30, platform: "youtube", mode: "advert", genrePreference: "Blues" });
  assert.ok(bluesOnly.length > 0);
  assert.ok(bluesOnly.every((item) => item.track.genre === "Blues"));
  const bluesMood = bluesOnly.find((item) => item.track.mood[0] === "Blues");
  assert.ok(bluesMood);
  assert.deepEqual([bluesMood.track.id, ...bluesMood.alternatives.map((track) => track.id)].sort(), ["blues-60-ad", "blues-60-ad-2", "blues-65-ad", "blues-65-ad-2"]);
  assert.deepEqual(recommendMusic({ analysis: site, brief, duration: 30, platform: "youtube", mode: "instruction" }).map((item) => item.track.usage), ["guide"]);
  assert.ok(recommendMusic({ analysis: site, brief, duration: 30, platform: "youtube", mode: "advert" }).some((item) => item.alternatives.length > 0));
});

test("platform presets include required social sizes and safe areas", () => {
  assert.deepEqual([getPlatformPreset("youtube")?.width, getPlatformPreset("youtube")?.height], [1920, 1080]);
  assert.deepEqual([getPlatformPreset("tiktok")?.width, getPlatformPreset("tiktok")?.height], [1080, 1920]);
  assert.equal(getPlatformPreset("instagram-feed")?.format, "4:5");
  assert.ok((getPlatformPreset("instagram-reels")?.textSafeArea.bottom ?? 0) > 0.2);
  assert.equal(getPlatformPresets("Facebook").length, 3);
  assert.ok(platformPresets.every((preset) => preset.aspectRatio && preset.captionBehavior));
});

test("music fitting creates gentle endings and warns before unlicensed looping", () => {
  const fit = fitMusicToVideo(42, 30, 4);
  assert.equal(fit.startSeconds, 4);
  assert.equal(fit.endSeconds, 34);
  assert.ok(fit.fadeOutSeconds > 0);
  const short = fitMusicToVideo(15, 60);
  assert.equal(short.shouldLoop, true);
  assert.match(short.warning ?? "", /license/);
  assert.equal(musicGainWithVoiceDucking(0.55, true, true), 0.55 * 0.38);
  assert.equal(musicGainWithVoiceDucking(0.55, false, true), 0.55);
});

test("only the 15 local owned royalty-free files are commercially selectable", () => {
  assert.equal(demoMusicCatalog.length, 15);
  assert.deepEqual(demoMusicCatalog.map((track) => track.audioUrl?.replace("/music/", "")).sort(), [...localMusicFiles].sort());
  assert.ok(demoMusicCatalog.every((track) => track.commercialUse && isClearedRoyaltyFreeTrack(track, "youtube")));
  assert.equal(isClearedRoyaltyFreeTrack({ ...demoMusicCatalog[0], audioUrl: "https://audio.example/track.mp3" }, "youtube"), false);
  assert.equal(detectBrandProfile({ ...analysis("restaurant"), description: "A restaurant serving seasonal food with dinner reservations." }).category, "restaurant");
});
