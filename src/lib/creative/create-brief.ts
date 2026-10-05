import type { BrandProfile, CreativeBrief, SiteAnalysis } from "@/types/project";

const categoryRules: Array<[BrandProfile["category"], RegExp]> = [
  ["restaurant", /restaurant|cafe|café|menu|reservation|dining|food|dish|chef|eatery|bar\b/],
  ["hotel-travel", /hotel|resort|accommodation|lodging|guesthouse|vacation rental|booking a stay/],
  ["tourism", /tourism|guided tour|destination|attraction|visitor centre|national park|things to do/],
  ["health-wellness", /healthcare|wellness|clinic|therapy|therapist|physio|dentist|fitness|yoga|meditation|nutrition/],
  ["saas", /software|platform|dashboard|workflow|automation|api|analytics|cloud|saas|app\b/],
  ["ecommerce", /online shop|shop now|shopping cart|e-commerce|ecommerce|collection|cart|shipping|buy now|apparel|clothing/],
  ["local-service", /plumber|plumbing|electrician|roofing|cleaning service|landscaping|repair service|home service|local service/],
  ["professional-service", /consulting|agency|studio|professional services|book a call|appointment|law firm|accounting|architect|marketing firm/],
  ["product-brand", /product brand|designed product|product line|our products|crafted products/],
  ["media", /publisher|publishing|streaming|media company|video production|film production/],
  ["content", /podcast|newsletter|journal|magazine|course|creator|subscribe|blog/],
  ["travel", /travel|tour|stay|flight|retreat|visit/],
  ["service", /services|service business/],
];

function siteEvidence(analysis: SiteAnalysis): string {
  return [analysis.title, analysis.description, ...(analysis.headings ?? []), ...(analysis.subheadings ?? []), analysis.visibleText ?? ""].join(" ").toLowerCase();
}

export function detectBrandProfile(analysis: SiteAnalysis): BrandProfile {
  const evidenceText = siteEvidence(analysis);
  const match = categoryRules.find(([, pattern]) => pattern.test(evidenceText));
  const category = match?.[0] ?? "other";
  const evidence = [analysis.title, analysis.description, ...(analysis.headings ?? []).slice(0, 3)].filter(Boolean).slice(0, 4);
  const servicePhrase = analysis.description.split(/[.!?]/)[0]?.trim() || analysis.headings?.[0] || "";
  const brandSourceConfidence = analysis.fieldSources?.brand?.confidence;
  const confidence = brandSourceConfidence === "high" && evidence.length >= 2 ? "high" : evidence.length >= 2 ? "medium" : "low";
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
    confidence,
    targetAudience: extractAudience(analysis.visibleText ?? ""),
    valueProposition: analysis.description || analysis.headings?.[0] || "",
    callToAction: analysis.callsToAction?.[0] ?? "",
  };
}

function extractAudience(text: string): string[] {
  const matches = [...text.matchAll(/\b(?:for|built for|made for|serving)\s+([^.!?;,]{2,64})/gi)];
  return [...new Set(matches.map((match) => match[1].trim()).filter(Boolean))].slice(0, 4);
}

export function createCreativeBrief(analysis: SiteAnalysis): CreativeBrief {
  const profile = analysis.brandProfile ?? detectBrandProfile(analysis);
  const keyBenefits = analysis.sellingPoints.slice(0, 5);
  const firstHeadline = analysis.headings?.[0] || analysis.title;
  const coreMessage = analysis.description || firstHeadline;
  const extractedAudience = profile.targetAudience ?? [];
  const cta = analysis.callsToAction?.[0] ?? "";
  const suggestedMusicDirection: Record<BrandProfile["category"], string> = {
    saas: "Modern, minimal electronic; confident and clean",
    ecommerce: "Contemporary, tactile and brand-led",
    restaurant: "Warm, organic and sensory",
    travel: "Atmospheric, expansive and evocative",
    "hotel-travel": "Atmospheric, welcoming and place-led",
    tourism: "Expansive, place-led and evocative",
    "local-service": "Grounded, clear and dependable",
    "professional-service": "Calm, assured and precise",
    "health-wellness": "Warm, steady and reassuring",
    "product-brand": "Tactile, distinctive and product-led",
    service: "Calm, assured and trustworthy",
    content: "Characterful, intimate and human",
    media: "Distinctive, contemporary and story-led",
    other: "Restrained, modern and aligned with the brand cues",
  };
  const visualStyle = profile.category === "ecommerce" || profile.category === "product-brand" ? "Editorial product film" : profile.category === "saas" ? "Clean product-led motion" : profile.category === "travel" || profile.category === "hotel-travel" || profile.category === "tourism" ? "Atmospheric destination story" : profile.category === "restaurant" ? "Warm sensory close-ups" : profile.category === "health-wellness" ? "Calm, human-centred scenes" : "Editorial brand story";
  const objectives: Record<BrandProfile["category"], string> = {
    saas: "Show the software's documented purpose and invite viewers to explore it.",
    ecommerce: "Present the products and guide viewers to the detected shop action.",
    restaurant: "Introduce the dining offer and guide viewers to the detected booking or menu action.",
    travel: "Introduce the travel offer using source imagery and guide viewers to the detected next step.",
    "hotel-travel": "Present the stay and guide viewers to the detected booking information.",
    tourism: "Introduce the destination or experience using information found on the site.",
    "local-service": "Explain the detected local service and guide viewers to the detected contact action.",
    "professional-service": "Present the documented professional offer and its detected contact action.",
    "health-wellness": "Present the documented health or wellness offer without adding outcome claims.",
    "product-brand": "Show the documented product and its source-supported value.",
    service: "Explain the detected service and guide viewers to the next available action.",
    content: "Introduce the content and guide viewers to the detected subscription or discovery action.",
    media: "Introduce the media offer using source-supported details.",
    other: "Present the clearest information found on the website.",
  };
  return {
    objective: objectives[profile.category],
    brand: profile.name,
    productOrService: profile.productOrService,
    valueProposition: profile.valueProposition ?? coreMessage,
    targetAudience: extractedAudience,
    coreMessage,
    keyBenefits,
    tone: profile.tone,
    visualStyle,
    suggestedHook: firstHeadline || "",
    callToAction: cta,
    suggestedPacing: ["travel", "hotel-travel", "tourism", "health-wellness"].includes(profile.category) ? "measured" : profile.category === "saas" ? "fast" : "balanced",
    suggestedMusicDirection: suggestedMusicDirection[profile.category],
    suggestedVoiceDirection: ["restaurant", "travel", "hotel-travel", "tourism", "health-wellness"].includes(profile.category) ? "Warm, measured delivery" : "Clear, assured delivery",
    recommendedPlatforms: ["youtube", "instagram-reels", "facebook"],
    evidence: profile.evidence,
    confidence: profile.confidence,
  };
}
