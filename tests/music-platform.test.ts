import assert from "node:assert/strict";
import test from "node:test";
import { fitMusicToVideo, musicGainWithVoiceDucking, prepareAudioTimeline } from "../src/lib/audio/mix.ts";
import { getPlatformPreset, getPlatformPresets, platformPresets, validatePlatformOutput } from "../src/lib/platforms/presets.ts";
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
  assert.ok(recommendations.every((item) => item.track.usage === "ad" && item.licenseWarning.includes("unverified")));
  const bluesOnly = recommendMusic({ analysis: site, brief, duration: 30, platform: "youtube", mode: "advert", genrePreference: "Blues" });
  assert.ok(bluesOnly.length > 0);
  assert.ok(bluesOnly.every((item) => item.track.genre === "Blues"));
  const bluesMood = bluesOnly.find((item) => item.track.mood[0] === "Blues");
  assert.ok(bluesMood);
  assert.deepEqual([bluesMood.track.id, ...bluesMood.alternatives.map((track) => track.id)].sort(), ["blues-60-ad", "blues-60-ad-2", "blues-65-ad", "blues-65-ad-2"]);
  const guideRecommendations = recommendMusic({ analysis: site, brief, duration: 30, platform: "youtube", mode: "instruction" });
  assert.ok(guideRecommendations.length > 0);
  assert.ok(guideRecommendations.every((item) => item.track.usage === "guide"));
  const modernGuide = guideRecommendations.find((item) => item.track.mood[0] === "Modern");
  assert.equal(modernGuide?.alternatives.length, 2);
  assert.ok(recommendMusic({ analysis: site, brief, duration: 30, platform: "youtube", mode: "advert" }).some((item) => item.alternatives.length > 0));
});

test("platform presets include required social sizes and safe areas", () => {
  assert.deepEqual([getPlatformPreset("youtube")?.width, getPlatformPreset("youtube")?.height], [1920, 1080]);
  assert.deepEqual([getPlatformPreset("tiktok")?.width, getPlatformPreset("tiktok")?.height], [1080, 1920]);
  assert.equal(getPlatformPreset("instagram-feed")?.format, "4:5");
  assert.ok((getPlatformPreset("instagram-reels")?.textSafeArea.bottom ?? 0) > 0.2);
  assert.equal(getPlatformPresets("Facebook").length, 3);
  assert.ok(platformPresets.every((preset) => preset.aspectRatio && preset.captionBehavior));
  assert.deepEqual(validatePlatformOutput(getPlatformPreset("instagram-reels")!, { width: 1080, height: 1920, duration: 30, captionsEnabled: true }), []);
  assert.ok(validatePlatformOutput(getPlatformPreset("instagram-reels")!, { width: 1080, height: 1350, duration: 30, captionsEnabled: false }).length >= 2);
  assert.ok(validatePlatformOutput(getPlatformPreset("youtube")!, { width: 1920, height: 1080, duration: 61 }).some((issue) => issue.includes("duration")));
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

test("audio planning preserves layer timing, fades, ducking, and does not claim to render", () => {
  const timeline = prepareAudioTimeline({
    videoDuration: 120,
    voiceover: { url: "/voice.wav", duration: 10, startSeconds: 2 },
    music: demoMusicCatalog.find((track) => track.id === "bright-82-ad")!,
    sfx: [{ url: "/click.wav", duration: 2, startSeconds: 5 }],
    jingle: { url: "/outro.wav", duration: 5, startSeconds: 118 },
  });
  assert.equal(timeline.status, "prepared-not-rendered");
  assert.deepEqual(timeline.layers.map((layer) => layer.kind), ["voice", "music", "sfx", "jingle"]);
  assert.deepEqual(timeline.layers[1].ducking, [{ startSeconds: 2, endSeconds: 12, gain: 0.38 }]);
  assert.equal(timeline.layers[1].loop, false);
  assert.match(timeline.layers[1].warning ?? "", /verified license/i);
  assert.equal(timeline.layers[2].startSeconds, 5);
  assert.equal(timeline.layers[3].endSeconds, 120);
});

test("Scorvik Original tracks preserve structured metadata and conservative licensing", () => {
  assert.equal(demoMusicCatalog.length, 19);
  assert.deepEqual(demoMusicCatalog.map((track) => track.audioUrl?.replace("/music/", "")).sort(), [...localMusicFiles].sort());
  assert.ok(demoMusicCatalog.every((track) => track.sourceType === "scorvik-original" && track.metadataStatus === "owner-supplied" && track.voiceoverSuitable && track.tempoBpm !== null && !isClearedRoyaltyFreeTrack(track, "youtube")));
  assert.equal(isClearedRoyaltyFreeTrack({ ...demoMusicCatalog[0], audioUrl: "https://audio.example/track.mp3" }, "youtube"), false);
  const verified = { ...demoMusicCatalog[0], metadataStatus: "verified" as const, commercialUse: true, licenseUrl: "https://license.example/terms", licenseCheckedAt: "2026-10-05T00:00:00.000Z", allowedPlatforms: ["youtube"] };
  assert.equal(isClearedRoyaltyFreeTrack(verified, "youtube-shorts"), true);
  assert.ok(recommendMusic({ analysis: analysis("saas"), brief: createCreativeBrief(analysis("saas")), duration: 30, platform: "instagram-reels" }).length > 0);
  assert.equal(detectBrandProfile({ ...analysis("restaurant"), description: "A restaurant serving seasonal food with dinner reservations." }).category, "restaurant");
});

test("unified match scoring prefers a close Scorvik Original but lets a stronger external match win", () => {
  const site = analysis("saas");
  const brief = createCreativeBrief(site);
  const original = {
    ...demoMusicCatalog[0],
    id: "original-match",
    title: "Original Modern",
    genre: "Electronic",
    subgenre: "Minimal Electronic",
    style: ["Modern"],
    mood: ["Modern"],
    tempoBpm: 105,
    energy: 8,
    duration: 30,
    usage: "ad" as const,
    sourceType: "scorvik-original" as const,
  };
  const external = {
    ...original,
    id: "pixabay-match",
    title: "Pixabay Modern",
    source: "pixabay",
    sourceType: "pixabay" as const,
    audioUrl: "https://cdn.pixabay.com/audio/example.mp3",
    tempoBpm: 116,
    metadataStatus: "verified" as const,
    licenseType: "Pixabay terms; track-specific commercial permission not verified",
    commercialUse: false,
    allowedPlatforms: [],
  };
  const input = { analysis: site, brief, duration: 30, platform: "youtube", mode: "advert" as const, userMoods: ["Modern"], hasVoiceover: true };
  assert.equal(recommendMusic(input, [original, external])[0]?.track.id, "original-match");
  assert.equal(recommendMusic(input, [original, external], { originalTrackBonus: 0 })[0]?.track.id, "pixabay-match");

  const weakOriginal = { ...original, id: "weak-original", mood: ["Calm"], genre: "Blues", tempoBpm: 60, energy: 2, duration: 160 };
  assert.equal(recommendMusic(input, [weakOriginal, external])[0]?.track.id, "pixabay-match");
});
