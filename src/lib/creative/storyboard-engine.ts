import { closingQuestion, focusHeadline, introQuestion } from "./copy-voice.ts";
import type { CreativeBrief, ScenePurpose, SiteAnalysis, StoryScene, Storyboard } from "@/types/project";
import type { FilmMode } from "@/types/project";

interface ScenePlan {
  purpose: ScenePurpose;
  headline: string;
  supportingText: string;
  voiceover: string;
  cta?: string;
}

const sceneCountByDuration: Record<number, number> = {
  15: 3,
  20: 4,
  30: 5,
  45: 6,
  60: 7,
  90: 9,
  120: 11,
  180: 15,
};

export function recommendInstructionDuration(stepCount: number, locale: "en" | "no" = "en"): { seconds: number; rationale: string } {
  const count = Math.max(stepCount, 1);
  if (count === 1) return { seconds: 25, rationale: locale === "no" ? "Ett steg, omtrent 25 sekunder." : "One step, about 25 seconds." };
  if (count <= 2) return { seconds: 45, rationale: locale === "no" ? "En kort funksjonsguide, omtrent 45 sekunder." : "A short feature guide, about 45 seconds." };
  if (count <= 4) return { seconds: 60, rationale: locale === "no" ? `${count} steg, omtrent 60 sekunder.` : `${count} steps, about 60 seconds.` };
  if (count <= 7) return { seconds: 90, rationale: locale === "no" ? `${count} steg, omtrent 90 sekunder.` : `${count} steps, about 90 seconds.` };
  if (count <= 10) return { seconds: 120, rationale: locale === "no" ? `${count} steg, omtrent 120 sekunder.` : `${count} steps, about 120 seconds.` };
  return { seconds: 180, rationale: locale === "no" ? `${count} steg, omtrent 180 sekunder.` : `${count} steps, about 180 seconds.` };
}

function normalizeEvidence(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function makePlan(purpose: ScenePurpose, headline: string, supportingText = "", cta?: string): ScenePlan {
  if (supportingText && supportingText.toLowerCase().startsWith(headline.toLowerCase())) supportingText = supportingText.slice(headline.length).trim();
  const voiceover = [headline, supportingText].filter(Boolean).join(". ");
  return { purpose, headline, supportingText, voiceover: voiceover ? `${voiceover}${/[.!?]$/.test(voiceover) ? "" : "."}` : "", cta };
}

function uniquePlans(plans: ScenePlan[]): ScenePlan[] {
  const seen = new Set<string>();
  return plans.filter((plan) => {
    const key = normalizeEvidence(`${plan.headline} ${plan.supportingText}`);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function visibleSentences(analysis: SiteAnalysis): string[] {
  return (analysis.visibleText ?? "")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 35 && sentence.length <= 220);
}

function selectPlans(plans: ScenePlan[], count: number): ScenePlan[] {
  if (plans.length <= count) return plans;
  if (count <= 2) return [plans[0], plans[plans.length - 1]];
  const middle = plans.slice(1, -1);
  const take = count - 2;
  const selected = Array.from({ length: take }, (_, index) => {
    const position = take === 1 ? Math.floor((middle.length - 1) / 2) : Math.round(index * (middle.length - 1) / (take - 1));
    return middle[position];
  });
  return [plans[0], ...selected, plans[plans.length - 1]];
}

function concise(value: string, fallback: string, limit = 84): string {
  const text = value.trim().replace(/\s+/g, " ");
  if (!text) return fallback;
  if (text.length <= limit) return text;
  const sentence = text.match(/^.+?[.!?](?=\s|$)/)?.[0];
  if (sentence && sentence.length >= 12 && sentence.length <= limit) return sentence;
  const cut = text.slice(0, limit - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > 20 ? cut.slice(0, space) : cut).trimEnd().replace(/[,;:–-]$/, "")}…`;
}

function sameSourceText(first: string, second: string): boolean {
  return first.trim().replace(/[.!?]+$/, "").toLowerCase() === second.trim().replace(/[.!?]+$/, "").toLowerCase();
}

const nameTokens = (value: string) => (value.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
const namePattern = /^\p{Lu}[\p{L}'.-]+(?:\s+(?:\p{Lu}[\p{L}'.-]+|&|and|og)){1,3}$/u;

/** Short capitalised phrases such as "Memphis Minnie" are names: printing one over the wrong photo is a factual error. */
function looksLikeName(value: string): boolean {
  const text = value.trim();
  return text.split(/\s+/).length <= 4 && namePattern.test(text);
}

/** A picture whose alt text or file name names a person must not carry unrelated text. */
function identifiesPerson(alt: string | undefined): boolean {
  return Boolean(alt && /\p{Lu}[\p{L}'.-]+\s+\p{Lu}[\p{L}'.-]+/u.test(alt));
}

function imageMatchesText(alt: string | undefined, text: string): boolean {
  if (!alt) return false;
  const altTokens = new Set(nameTokens(alt));
  const wanted = nameTokens(text);
  if (!wanted.length) return false;
  const shared = wanted.filter((token) => altTokens.has(token)).length;
  return wanted.length === 1 ? shared === 1 : shared >= Math.min(2, wanted.length);
}

export function buildStoryboard(
  analysis: SiteAnalysis,
  brief: CreativeBrief,
  options: { mode?: FilmMode; targetDuration?: number; locale?: "en" | "no"; idFactory?: () => string } = {},
): Storyboard {
  const mode = options.mode ?? "advert";
  const extractedSteps = analysis.steps?.filter((step) => step.title.trim()) ?? [];
  const sourceHeadings = [...(analysis.headings ?? []), ...(analysis.subheadings ?? [])].filter(Boolean).slice(0, 30);
  const instructionSteps = extractedSteps.length
    ? extractedSteps
    : sourceHeadings.map((title) => ({ title, description: title }));
  const recommendation = recommendInstructionDuration(instructionSteps.length, options.locale);
  const requestedDuration = options.targetDuration
    ?? (brief.durationMode === mode ? brief.targetDuration : undefined)
    ?? (mode === "instruction" ? recommendation.seconds : 30);
  const configuredSceneCount = sceneCountByDuration[requestedDuration] ?? Math.max(3, Math.ceil(requestedDuration / 15) + 2);
  const instructionalIntroCount = mode === "instruction" && brief.suggestedHook && !instructionSteps.some((step) => sameSourceText(step.title, brief.suggestedHook)) ? 1 : 0;
  const instructionalCloseCount = mode === "instruction" && brief.callToAction ? 1 : 0;
  const completeInstructionCount = instructionSteps.length + instructionalIntroCount + instructionalCloseCount;
  const count = mode === "instruction" && requestedDuration >= recommendation.seconds
    ? Math.max(configuredSceneCount, completeInstructionCount)
    : configuredSceneCount;
  let candidates: ScenePlan[];
  if (mode === "advert") {
    const excluded = [brief.suggestedHook, brief.productOrService, brief.callToAction, ...(analysis.proofPoints ?? [])];
    const details = [...(analysis.headings ?? []), ...(analysis.subheadings ?? [])]
      .filter((value) => !excluded.some((item) => item && sameSourceText(value, item)))
      .map((value) => makePlan("Story", value));
    const benefits = brief.keyBenefits
      .filter((value) => !excluded.some((item) => item && sameSourceText(value, item)))
      .map((value) => makePlan("Benefit", value));
    const proof = (analysis.proofPoints ?? []).map((value) => makePlan("Proof", value));
    const used = [brief.suggestedHook, brief.productOrService, brief.callToAction, ...brief.keyBenefits, ...(analysis.proofPoints ?? []), ...details.map((plan) => plan.headline)];
    const copyDetails = visibleSentences(analysis)
      .filter((value) => !used.some((item) => item && (sameSourceText(value, item) || normalizeEvidence(value).includes(normalizeEvidence(item)))))
      .map((value) => makePlan("Story", value));
    candidates = uniquePlans([
      ...(brief.suggestedHook ? [makePlan("Hook", brief.suggestedHook)] : []),
      ...(brief.productOrService ? [makePlan("Product", brief.productOrService, analysis.description !== brief.productOrService ? analysis.description : "")] : []),
      ...benefits,
      ...details,
      ...copyDetails,
      ...proof,
      ...(brief.callToAction ? [makePlan("CTA", brief.callToAction, analysis.relevantLinks?.find((link) => link.label === brief.callToAction)?.url ?? "", brief.callToAction)] : []),
    ]);
  } else {
    const intro = brief.suggestedHook && !instructionSteps.some((step) => sameSourceText(step.title, brief.suggestedHook))
      ? [makePlan("Story", brief.suggestedHook, analysis.description)]
      : [];
    const steps = instructionSteps.map((step) => makePlan(extractedSteps.length ? "Step" : "Story", step.title, step.description));
    const stepTitles = instructionSteps.map((step) => step.title);
    const details = [...(analysis.headings ?? []), ...(analysis.subheadings ?? [])]
      .filter((value) => !stepTitles.some((title) => sameSourceText(value, title)))
      .map((value) => makePlan("Story", value));
    const used = [...stepTitles, ...details.map((plan) => plan.headline), brief.suggestedHook, brief.callToAction];
    const copyDetails = visibleSentences(analysis)
      .filter((value) => !used.some((item) => item && (sameSourceText(value, item) || normalizeEvidence(value).includes(normalizeEvidence(item)))))
      .map((value) => makePlan("Story", value));
    const conclusion = brief.callToAction ? [makePlan("CTA", brief.callToAction, analysis.relevantLinks?.find((link) => link.label === brief.callToAction)?.url ?? "", brief.callToAction)] : [];
    const basePlans = uniquePlans([...intro, ...steps, ...conclusion]);
    const detailCapacity = Math.max(0, count - basePlans.length);
    candidates = extractedSteps.length >= 2
      ? uniquePlans([...intro, ...steps, ...conclusion])
      : uniquePlans([...intro, ...steps, ...details.slice(0, detailCapacity), ...copyDetails.slice(0, Math.max(0, detailCapacity - details.length)), ...conclusion]);
  }
  if (!candidates.length) candidates = [makePlan("Story", analysis.title || analysis.brand, analysis.description)];
  const selected = selectPlans(candidates, count);
  // Scorvik's copy voice (see copy-voice.ts): soft questions at the open and close, one message per scene.
  const language = /^n[bo]?/i.test(analysis.language ?? "") ? "no" : (options.locale ?? "en");
  const seed = analysis.brand || analysis.title;
  const plans = selected.map((plan, index) => {
    if (mode === "instruction" && extractedSteps.length >= 2 && extractedSteps.length <= 8 && index === 0 && plan.purpose === "Story" && sameSourceText(plan.headline, brief.suggestedHook)) {
      return makePlan("Story", introQuestion(language, extractedSteps.length, seed), plan.headline);
    }
    if (plan.purpose === "CTA" && index === selected.length - 1) return makePlan("CTA", closingQuestion(language, seed), plan.headline, plan.cta);
    return plan;
  });
  const maxSceneSeconds = 18;
  const totalDuration = Math.min(requestedDuration, Math.max(15, plans.length * maxSceneSeconds));
  const perScene = Math.floor(totalDuration / plans.length);
  let remainder = totalDuration - perScene * plans.length;
  const idFactory = options.idFactory ?? (() => crypto.randomUUID());
  const scenes: StoryScene[] = plans.map((plan, index) => {
    const duration = perScene + (remainder-- > 0 ? 1 : 0);
    const alts = analysis.imageAlts ?? {};
    const matched = plan.purpose === "CTA" ? undefined : analysis.images?.find((candidate) => imageMatchesText(alts[candidate], plan.headline));
    const image = matched ?? analysis.images?.[index];
    const noOverlay = !matched && (looksLikeName(plan.headline) || identifiesPerson(image ? alts[image] : undefined));
    const openGraphImage = analysis.openGraphImage || analysis.image;
    const visual = image || openGraphImage || "";
    return {
      id: idFactory(),
      order: index,
      purpose: plan.purpose,
      duration,
      headline: concise(focusHeadline(plan.headline).headline, ""),
      supportingText: concise(plan.supportingText || focusHeadline(plan.headline).rest, "", 110),
      ...(noOverlay ? { noOverlay: true } : {}),
      voiceover: plan.voiceover,
      transition: options.locale === "no"
        ? index === 0 ? "Rolig åpning" : index === plans.length - 1 ? "Fade ut" : "Mykt klipp"
        : index === 0 ? "Slow reveal" : index === plans.length - 1 ? "Fade out" : "Soft cut",
      visual,
      visualSource: image ? "website-image" : openGraphImage ? "open-graph" : "not-detected",
      cta: plan.purpose === "CTA" ? brief.callToAction : undefined,
      musicCue: index === 0 ? "Music enters gently" : undefined,
      soundCue: plan.purpose === "CTA" && mode === "advert" ? options.locale === "no" ? "Kort merkeavslutning, hvis lisensiert lyd finnes" : "Optional short brand outro" : undefined,
    };
  });
  const durationToleranceSeconds = Math.max(3, Math.ceil(requestedDuration * 0.1));
  const storyboard: Storyboard = {
    scenes,
    totalDuration: scenes.reduce((sum, scene) => sum + scene.duration, 0),
    requestedDuration,
    durationToleranceSeconds,
    durationWithinTolerance: Math.abs(scenes.reduce((sum, scene) => sum + scene.duration, 0) - requestedDuration) <= durationToleranceSeconds,
    rationale: totalDuration < requestedDuration
      ? options.locale === "no"
        ? `Nettsiden ga bare nok unikt innhold til ${totalDuration} sekunder uten gjentakelser; dette utkastet ble kortet ned fra ${requestedDuration} sekunder.`
        : `The source only supports ${totalDuration} seconds of distinct content without repetition; this draft was shortened from ${requestedDuration} seconds.`
      : mode === "instruction"
        ? brief.durationMode === mode ? `${recommendation.rationale} ${brief.durationGuidance}` : recommendation.rationale
        : brief.durationGuidance,
  };
  const issues = validateStoryboard(storyboard).filter((issue) => issue !== "duration outside requested tolerance");
  if (issues.length) throw new Error(`Invalid storyboard: ${issues.join(", ")}`);
  return storyboard;
}

export function validateStoryboard(storyboard: Storyboard): string[] {
  const issues: string[] = [];
  if (!storyboard.scenes.length) issues.push("no scenes");
  if (storyboard.scenes.some((scene) => !Number.isFinite(scene.duration) || scene.duration <= 0)) issues.push("invalid scene duration");
  if (storyboard.scenes.reduce((sum, scene) => sum + scene.duration, 0) !== storyboard.totalDuration) issues.push("total duration mismatch");
  if (storyboard.requestedDuration !== undefined && Math.abs(storyboard.totalDuration - storyboard.requestedDuration) > (storyboard.durationToleranceSeconds ?? 0)) issues.push("duration outside requested tolerance");
  if (storyboard.requestedDuration !== undefined && Math.abs(storyboard.totalDuration - storyboard.requestedDuration) > (storyboard.durationToleranceSeconds ?? 0)) issues.push("duration outside requested tolerance");
  if (storyboard.scenes.some((scene) => !scene.voiceover.trim())) issues.push("missing voiceover");
  if (storyboard.scenes.some((scene) => scene.purpose === "CTA" && !scene.cta?.trim())) issues.push("missing CTA");
  if (storyboard.scenes.some((scene) => scene.visual && !/^https?:\/\//i.test(scene.visual))) issues.push("invalid visual source");
  return issues;
}
