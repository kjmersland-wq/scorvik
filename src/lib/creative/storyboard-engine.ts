import type { CreativeBrief, ScenePurpose, SiteAnalysis, StoryScene, Storyboard } from "@/types/project";
import type { FilmMode } from "@/types/project";

interface ScenePlan {
  purpose: ScenePurpose;
  label: string;
}

const advertPlan: ScenePlan[] = [
  { purpose: "Hook", label: "A clear opening" },
  { purpose: "Product", label: "The product" },
  { purpose: "Benefit", label: "The benefit" },
  { purpose: "Proof", label: "A reason to trust it" },
  { purpose: "CTA", label: "The next step" },
];

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
  if (plan.purpose === "Product") return brief.productOrService || analysis.headings?.[1] || analysis.description;
  if (plan.purpose === "Benefit") return analysis.sellingPoints[0] ?? analysis.description;
  if (plan.purpose === "Proof") return analysis.proofPoints?.[0] ?? analysis.headings?.[index] ?? "";
  return analysis.headings?.[index] ?? analysis.subheadings?.[index] ?? analysis.description;
}

function concise(value: string, fallback: string): string {
  const text = value.trim().replace(/\s+/g, " ");
  if (!text) return fallback;
  return text.length > 84 ? `${text.slice(0, 81).trimEnd()}…` : text;
}

export function buildStoryboard(
  analysis: SiteAnalysis,
  brief: CreativeBrief,
  options: { mode?: FilmMode; targetDuration?: number; locale?: "en" | "no"; idFactory?: () => string } = {},
): Storyboard {
  const mode = options.mode ?? "advert";
  const instructionSteps: NonNullable<SiteAnalysis["steps"]> = analysis.steps?.length
    ? analysis.steps
    : [...(analysis.headings ?? []).slice(1), ...(analysis.subheadings ?? [])].slice(0, 10).map((title) => ({ title, description: title }));
  if (mode === "instruction" && instructionSteps.length === 0) instructionSteps.push({ title: "Open the first feature", description: analysis.description || analysis.title });
  const recommendation = recommendInstructionDuration(instructionSteps.length, options.locale);
  const requestedDuration = options.targetDuration;
  const totalDuration = mode === "advert"
    ? requestedDuration !== undefined && [15, 20, 30].includes(requestedDuration) ? requestedDuration : 30
    : requestedDuration ?? recommendation.seconds;
  const plans = mode === "advert" ? advertPlan : instructionSteps.map((step) => ({ purpose: "Step" as const, label: step.title }));
  const perScene = Math.floor(totalDuration / plans.length);
  let remainder = totalDuration - perScene * plans.length;
  const idFactory = options.idFactory ?? (() => crypto.randomUUID());
  const scenes: StoryScene[] = plans.map((plan, index) => {
    const step = mode === "instruction" ? instructionSteps[index] : undefined;
    const source = step?.title ?? chooseEvidence(plan, index, analysis, brief);
    const duration = perScene + (remainder-- > 0 ? 1 : 0);
    const headline = concise(source, `${plan.label} · ${brief.brand}`);
    const support = step?.description ?? (plan.purpose === "CTA"
      ? analysis.relevantLinks?.[0]?.url ?? analysis.url
      : plan.purpose === "Proof"
        ? analysis.proofPoints?.[0] ?? analysis.headings?.[index] ?? analysis.description
        : analysis.sellingPoints[0] ?? analysis.description);
    const voiceover = step ? [step.title, step.description, step.action].filter(Boolean).join(". ") : `${headline}${headline.endsWith(".") ? "" : "."}`;
    return {
      id: idFactory(),
      order: index,
      purpose: plan.purpose,
      duration,
      headline,
      supportingText: concise(support, plan.label),
      voiceover,
      transition: options.locale === "no"
        ? index === 0 ? "Rolig åpning" : index === plans.length - 1 ? "Fade ut" : "Mykt klipp"
        : index === 0 ? "Slow reveal" : index === plans.length - 1 ? "Fade out" : "Soft cut",
      visual: analysis.images?.[index] ?? analysis.openGraphImage ?? analysis.image,
      cta: plan.purpose === "CTA" ? brief.callToAction : undefined,
      musicCue: index === 0 ? "Music enters gently" : undefined,
      soundCue: plan.purpose === "CTA" && mode === "advert" ? options.locale === "no" ? "Kort merkeavslutning, hvis lisensiert lyd finnes" : "Optional short brand outro" : undefined,
    };
  });
  return {
    scenes,
    totalDuration: scenes.reduce((sum, scene) => sum + scene.duration, 0),
    rationale: mode === "advert"
      ? options.locale === "no" ? "Fast rekkefølge: åpning, produkt, fordel, bevis og neste steg." : "Fixed order: hook, product, benefit, proof and call to action."
      : recommendation.rationale,
  };
}
