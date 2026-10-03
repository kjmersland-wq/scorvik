import type { CreativeBrief, ScenePurpose, SiteAnalysis, StoryScene, Storyboard } from "@/types/project";

interface ScenePlan {
  purpose: ScenePurpose;
  label: string;
  evidence?: string;
}

const scenePlans: Record<string, ScenePlan[]> = {
  saas: [{ purpose: "Hook", label: "What becomes easier" }, { purpose: "Product", label: "A closer look" }, { purpose: "Benefit", label: "How it helps" }, { purpose: "CTA", label: "Your next step" }],
  ecommerce: [{ purpose: "Hook", label: "Find something you love" }, { purpose: "Product", label: "Made with care" }, { purpose: "Benefit", label: "Little things that matter" }, { purpose: "Proof", label: "Why people come back" }, { purpose: "CTA", label: "Take a look" }],
  restaurant: [{ purpose: "Hook", label: "Come on in" }, { purpose: "Story", label: "The feeling of being here" }, { purpose: "Product", label: "Made for the table" }, { purpose: "Benefit", label: "A place to settle in" }, { purpose: "CTA", label: "Plan a visit" }],
  travel: [{ purpose: "Hook", label: "Somewhere to go" }, { purpose: "Story", label: "What it feels like" }, { purpose: "Benefit", label: "Little moments to remember" }, { purpose: "Product", label: "Make it your stay" }, { purpose: "CTA", label: "Start exploring" }],
  service: [{ purpose: "Hook", label: "A familiar challenge" }, { purpose: "Story", label: "A thoughtful way through" }, { purpose: "Benefit", label: "What gets easier" }, { purpose: "Proof", label: "Stories from people like you" }, { purpose: "CTA", label: "Let's talk" }],
  content: [{ purpose: "Hook", label: "An idea worth sharing" }, { purpose: "Story", label: "What you'll find" }, { purpose: "Benefit", label: "Why it matters to you" }, { purpose: "CTA", label: "Come along" }],
  other: [{ purpose: "Hook", label: "A good place to start" }, { purpose: "Story", label: "What makes it yours" }, { purpose: "Product", label: "A closer look" }, { purpose: "CTA", label: "Take a look" }],
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
