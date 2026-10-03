import type { BrandProfile, CreativeBrief, SiteAnalysis } from "@/types/project";

const categoryRules: Array<[BrandProfile["category"], RegExp]> = [
  ["restaurant", /restaurant|cafe|café|menu|reservation|dining|food|dish|chef/],
  ["travel", /hotel|resort|travel|destination|tour|stay|flight|retreat|visit/],
  ["saas", /software|platform|dashboard|workflow|automation|api|analytics|cloud|saas|app\b/],
  ["ecommerce", /shop|store|collection|product|cart|shipping|buy now|apparel|clothing/],
  ["service", /consulting|agency|studio|services|book a call|appointment|law firm|accounting/],
  ["content", /podcast|newsletter|journal|magazine|course|creator|subscribe/],
];

function siteEvidence(analysis: SiteAnalysis): string {
  return [analysis.title, analysis.description, ...(analysis.headings ?? []), ...(analysis.subheadings ?? []), analysis.visibleText ?? ""].join(" ").toLowerCase();
}

export function detectBrandProfile(analysis: SiteAnalysis): BrandProfile {
  const evidenceText = siteEvidence(analysis);
  const match = categoryRules.find(([, pattern]) => pattern.test(evidenceText));
  const category = match?.[0] ?? "other";
  const evidence = [analysis.title, ...(analysis.headings ?? []).slice(0, 3)].filter(Boolean).slice(0, 4);
  const servicePhrase = analysis.description.split(/[.!?]/)[0]?.trim() || analysis.headings?.[0] || "";
  const tone = [
    /premium|luxury|crafted|atelier|bespoke/.test(evidenceText) ? "sophisticated" : "clear",
    /playful|joy|fun|bright/.test(evidenceText) ? "playful" : "confident",
    /sustainable|responsible|organic|natural/.test(evidenceText) ? "considered" : "modern",
  ];
  return {
    name: analysis.brand,
    category,
    productOrService: servicePhrase,
    tone: [...new Set(tone)],
    colors: analysis.colors,
    evidence,
    confidence: evidence.length >= 3 ? "medium" : evidence.length ? "low" : "low",
  };
}

export function createCreativeBrief(analysis: SiteAnalysis): CreativeBrief {
  const profile = analysis.brandProfile ?? detectBrandProfile(analysis);
  const keyBenefits = analysis.sellingPoints.slice(0, 5);
  const firstHeadline = analysis.headings?.[0] || analysis.title;
  const coreMessage = analysis.description || firstHeadline;
  const extractedAudience = [...(analysis.visibleText ?? "").matchAll(/(?:for|built for|made for|serving)\s+(small businesses|teams|families|creators|founders|travelers|businesses|restaurants|designers|developers|parents|professionals)/gi)].map((match) => match[1]).filter((value, index, all) => all.indexOf(value) === index).slice(0, 4);
  const cta = analysis.callsToAction?.[0] ?? "Explore the website";
  const suggestedMusicDirection: Record<BrandProfile["category"], string> = {
    saas: "Modern, minimal electronic; confident and clean",
    ecommerce: "Contemporary, tactile and brand-led",
    restaurant: "Warm, organic and sensory",
    travel: "Atmospheric, expansive and evocative",
    service: "Calm, assured and trustworthy",
    content: "Characterful, intimate and human",
    other: "Restrained, modern and aligned with the brand cues",
  };
  const visualStyle = profile.category === "ecommerce" ? "Editorial product film" : profile.category === "saas" ? "Clean product-led motion" : profile.category === "travel" ? "Atmospheric destination story" : profile.category === "restaurant" ? "Warm sensory close-ups" : "Editorial brand story";
  return {
    brand: profile.name,
    productOrService: profile.productOrService,
    targetAudience: extractedAudience,
    coreMessage,
    keyBenefits,
    tone: profile.tone,
    visualStyle,
    suggestedHook: firstHeadline,
    callToAction: cta,
    suggestedPacing: profile.category === "travel" ? "measured" : profile.category === "saas" ? "fast" : "balanced",
    suggestedMusicDirection: suggestedMusicDirection[profile.category],
    suggestedVoiceDirection: profile.category === "restaurant" || profile.category === "travel" ? "Warm, measured delivery" : "Clear, assured delivery",
    recommendedPlatforms: ["youtube", "instagram-reels", "facebook"],
    evidence: profile.evidence,
    confidence: profile.confidence,
  };
}
