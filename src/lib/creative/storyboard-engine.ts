import type { CreativeBrief, ScenePurpose, SiteAnalysis, StoryScene, Storyboard } from "@/types/project";
import type { FilmMode } from "@/types/project";

interface ScenePlan {
  purpose: ScenePurpose;
  label: string;
}

export function recommendInstructionDuration(stepCount: number, locale: "en" | "no" = "en"): { seconds: number; rationale: string } {
  const count = Math.max(stepCount, 1);
  if (count === 1) return { seconds: 25, rationale: locale === "no" ? "Ett steg, omtrent 25 sekunder." : "One step, about 25 seconds." };
  if (count <= 2) return { seconds: 45, rationale: locale === "no" ? "En kort funksjonsguide, omtrent 45 sekunder." : "A short feature guide, about 45 seconds." };
  if (count === 3) return { seconds: 60, rationale: locale === "no" ? "3 steg, omtrent 60 sekunder." : "3 steps, about 60 seconds." };
  if (count === 4) return { seconds: 60, rationale: locale === "no" ? "4 steg, omtrent 60 sekunder." : "4 steps, about 60 seconds." };
  return { seconds: 90, rationale: locale === "no" ? "En full gjennomgang, omtrent 90 sekunder. Du kan dele den i kortere filmer." : "A full walkthrough, about 90 seconds. You can split it into shorter films." };
}

function chooseEvidence(plan: ScenePlan, index: number, analysis: SiteAnalysis, brief: CreativeBrief): string {
  if (plan.purpose === "Hook") return brief.suggestedHook;
  if (plan.purpose === "CTA") return brief.callToAction;
  if (plan.purpose === "Product") return brief.productOrService;
  if (plan.purpose === "Benefit") return brief.keyBenefits[0] ?? brief.valueProposition;
  if (plan.purpose === "Proof") return analysis.proofPoints?.[0] ?? "";
  return analysis.headings?.[index] ?? analysis.subheadings?.[index] ?? analysis.description;
}

function concise(value: string, fallback: string): string {
  const text = value.trim().replace(/\s+/g, " ");
  if (!text) return fallback;
  return text.length > 84 ? `${text.slice(0, 81).trimEnd()}…` : text;
}

function sameSourceText(first: string, second: string): boolean {
  return first.trim().replace(/[.!?]+$/, "").toLowerCase() === second.trim().replace(/[.!?]+$/, "").toLowerCase();
}

export function buildStoryboard(
  analysis: SiteAnalysis,
  brief: CreativeBrief,
  options: { mode?: FilmMode; targetDuration?: number; locale?: "en" | "no"; idFactory?: () => string } = {},
): Storyboard {
  const mode = options.mode ?? "advert";
  const extractedSteps = analysis.steps?.filter((step) => step.title.trim()) ?? [];
  const sourceHeadings = [...(analysis.headings ?? []), ...(analysis.subheadings ?? [])].filter(Boolean).slice(0, 10);
  const instructionSteps = extractedSteps.length
    ? extractedSteps
    : sourceHeadings.map((title) => ({ title, description: title }));
  const recommendation = recommendInstructionDuration(instructionSteps.length, options.locale);
  const requestedDuration = options.targetDuration;
  const totalDuration = mode === "advert"
    ? requestedDuration !== undefined && [15, 20, 30].includes(requestedDuration) ? requestedDuration : 30
    : requestedDuration !== undefined && Number.isInteger(requestedDuration) && requestedDuration > 0 ? requestedDuration : recommendation.seconds;
  const plans: ScenePlan[] = mode === "advert"
    ? [
      { purpose: "Hook", label: "" },
      ...(brief.productOrService && !sameSourceText(brief.productOrService, brief.suggestedHook) ? [{ purpose: "Product" as const, label: "" }] : []),
      ...(brief.keyBenefits.length ? [{ purpose: "Benefit" as const, label: "" }] : brief.valueProposition && !sameSourceText(brief.valueProposition, brief.productOrService) ? [{ purpose: "Benefit" as const, label: "" }] : []),
      ...(analysis.proofPoints?.length ? [{ purpose: "Proof" as const, label: "" }] : []),
      ...(brief.callToAction ? [{ purpose: "CTA" as const, label: "" }] : []),
    ]
    : instructionSteps.length
      ? instructionSteps.map((step) => ({ purpose: extractedSteps.length ? "Step" as const : "Story" as const, label: step.title }))
      : [{ purpose: "Story", label: "" }];
  const perScene = Math.floor(totalDuration / plans.length);
  let remainder = totalDuration - perScene * plans.length;
  const idFactory = options.idFactory ?? (() => crypto.randomUUID());
  const scenes: StoryScene[] = plans.map((plan, index) => {
    const step = mode === "instruction" ? instructionSteps[index] : undefined;
    const source = step?.title ?? chooseEvidence(plan, index, analysis, brief);
    const duration = perScene + (remainder-- > 0 ? 1 : 0);
    const headline = concise(source, "");
    const support = step?.description ?? (plan.purpose === "CTA"
      ? analysis.relevantLinks?.find((link) => link.label === brief.callToAction)?.url ?? ""
      : plan.purpose === "Proof"
        ? analysis.proofPoints?.[0] ?? ""
        : analysis.description);
    const voiceoverSource = step ? [step.title, step.description, "action" in step ? step.action : undefined].filter(Boolean).join(". ") : headline;
    const voiceover = voiceoverSource ? `${voiceoverSource}${/[.!?]$/.test(voiceoverSource) ? "" : "."}` : "";
    const image = analysis.images?.[index];
    const openGraphImage = analysis.openGraphImage || analysis.image;
    const visual = image || openGraphImage || "";
    return {
      id: idFactory(),
      order: index,
      purpose: plan.purpose,
      duration,
      headline,
      supportingText: concise(support, ""),
      voiceover,
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
  const storyboard = {
    scenes,
    totalDuration: scenes.reduce((sum, scene) => sum + scene.duration, 0),
    rationale: mode === "advert"
      ? options.locale === "no" ? "Scenene følger overskrifter, tilbud, fordeler, dokumentasjon og neste steg som faktisk ble funnet." : "Scenes follow the headings, offer, benefits, proof and next step actually found on the site."
      : recommendation.rationale,
  };
  const issues = validateStoryboard(storyboard);
  if (issues.length) throw new Error(`Invalid storyboard: ${issues.join(", ")}`);
  return storyboard;
}

export function validateStoryboard(storyboard: Storyboard): string[] {
  const issues: string[] = [];
  if (!storyboard.scenes.length) issues.push("no scenes");
  if (storyboard.scenes.some((scene) => !Number.isFinite(scene.duration) || scene.duration <= 0)) issues.push("invalid scene duration");
  if (storyboard.scenes.reduce((sum, scene) => sum + scene.duration, 0) !== storyboard.totalDuration) issues.push("total duration mismatch");
  if (storyboard.scenes.some((scene) => !scene.voiceover.trim())) issues.push("missing voiceover");
  if (storyboard.scenes.some((scene) => scene.purpose === "CTA" && !scene.cta?.trim())) issues.push("missing CTA");
  if (storyboard.scenes.some((scene) => scene.visual && !/^https?:\/\//i.test(scene.visual))) issues.push("invalid visual source");
  return issues;
}
