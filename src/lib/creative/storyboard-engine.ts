import type { CreativeBrief, ScenePurpose, SiteAnalysis, StoryScene, Storyboard } from "@/types/project";

interface ScenePlan {
  purpose: ScenePurpose;
  label: string;
  evidence?: string;
}

const scenePlans: Record<string, ScenePlan[]> = {
  saas: [{ purpose: "Hook", label: "The promise" }, { purpose: "Product", label: "The product" }, { purpose: "Benefit", label: "How it helps" }, { purpose: "CTA", label: "Next step" }],
  ecommerce: [{ purpose: "Hook", label: "The collection" }, { purpose: "Product", label: "The product" }, { purpose: "Benefit", label: "The details" }, { purpose: "Proof", label: "Reasons to choose" }, { purpose: "CTA", label: "Explore" }],
  restaurant: [{ purpose: "Hook", label: "The invitation" }, { purpose: "Story", label: "The experience" }, { purpose: "Product", label: "The menu" }, { purpose: "Benefit", label: "The atmosphere" }, { purpose: "CTA", label: "Visit" }],
  travel: [{ purpose: "Hook", label: "The destination" }, { purpose: "Story", label: "The experience" }, { purpose: "Benefit", label: "The highlights" }, { purpose: "Product", label: "Plan your stay" }, { purpose: "CTA", label: "Explore" }],
  service: [{ purpose: "Hook", label: "The challenge" }, { purpose: "Story", label: "The approach" }, { purpose: "Benefit", label: "The value" }, { purpose: "Proof", label: "The proof" }, { purpose: "CTA", label: "Start a conversation" }],
  content: [{ purpose: "Hook", label: "The idea" }, { purpose: "Story", label: "What you will find" }, { purpose: "Benefit", label: "Why it matters" }, { purpose: "CTA", label: "Join in" }],
  other: [{ purpose: "Hook", label: "The introduction" }, { purpose: "Story", label: "The story" }, { purpose: "Product", label: "What is offered" }, { purpose: "CTA", label: "Explore" }],
};

function chooseEvidence(plan: ScenePlan, index: number, analysis: SiteAnalysis, brief: CreativeBrief): string {
  if (plan.purpose === "Hook") return brief.suggestedHook;
  if (plan.purpose === "CTA") return brief.callToAction;
  if (plan.purpose === "Benefit") return analysis.sellingPoints[index % Math.max(analysis.sellingPoints.length, 1)] ?? analysis.description;
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
  options: { targetDuration?: number; idFactory?: () => string } = {},
): Storyboard {
  const category = analysis.brandProfile?.category ?? "other";
  const plans = scenePlans[category] ?? scenePlans.other;
  const totalDuration = options.targetDuration ?? 30;
  const perScene = Math.floor(totalDuration / plans.length);
  let remainder = totalDuration - perScene * plans.length;
  const idFactory = options.idFactory ?? (() => crypto.randomUUID());
  const scenes: StoryScene[] = plans.map((plan, index) => {
    const source = chooseEvidence(plan, index, analysis, brief);
    const duration = perScene + (remainder-- > 0 ? 1 : 0);
    const headline = concise(source, `${plan.label} · ${brief.brand}`);
    const support = plan.purpose === "CTA"
      ? analysis.relevantLinks?.[0]?.url ?? analysis.url
      : analysis.sellingPoints[index % Math.max(analysis.sellingPoints.length, 1)] ?? analysis.description;
    return {
      id: idFactory(),
      order: index,
      purpose: plan.purpose,
      duration,
      headline,
      supportingText: concise(support, plan.label),
      voiceover: `${headline}${headline.endsWith(".") ? "" : "."}`,
      transition: index === 0 ? "Slow reveal" : index === plans.length - 1 ? "Fade out" : "Soft cut",
      visual: analysis.images?.[index] ?? analysis.openGraphImage ?? analysis.image,
      cta: plan.purpose === "CTA" ? brief.callToAction : undefined,
      musicCue: index === 0 ? "Music enters gently" : undefined,
      soundCue: plan.purpose === "CTA" ? "Optional brand outro" : undefined,
    };
  });
  return {
    scenes,
    totalDuration: scenes.reduce((sum, scene) => sum + scene.duration, 0),
    rationale: `Scene structure adapted for a ${category} website using extracted headings, benefits and calls to action.`,
  };
}
