// Deterministic stock-search phrases per scene (English: Pexels and Unsplash only understand English).
// Claude can overwrite these with sharper, scene-specific phrases when an API key is configured.
import type { FilmMode, ScenePurpose, SiteAnalysis } from "@/types/project";

const byCategory: Record<string, string[]> = {
  restaurant: ["restaurant kitchen", "chef cooking", "served dinner table", "cafe interior"],
  saas: ["software dashboard", "laptop screen analytics", "team working laptop", "mobile app interface"],
  ecommerce: ["online shopping", "product packaging", "boutique store", "unboxing parcel"],
  travel: ["travel landscape", "hotel room view", "tourists exploring", "mountain road trip"],
  "hotel-travel": ["hotel lobby", "hotel room view", "travel landscape", "breakfast terrace"],
  tourism: ["tourists exploring", "scenic landscape", "city sightseeing", "local culture"],
  "local-service": ["craftsman at work", "friendly service", "tools workshop", "local shop"],
  "professional-service": ["business meeting", "consultant laptop", "office team", "handshake client"],
  "health-wellness": ["wellness calm", "yoga morning", "healthy lifestyle", "spa relaxation"],
  "product-brand": ["product close up", "studio lighting product", "hands holding product", "lifestyle brand"],
  content: ["creative studio", "writing desk", "podcast microphone", "reading book"],
  media: ["camera crew", "music studio", "newsroom", "vinyl records"],
  music: ["vinyl records", "guitar close up", "concert stage", "music studio"],
};
const fallback = ["modern workspace", "people collaborating", "city lifestyle", "hands working desk"];
const instruction = ["app interface screen", "laptop typing hands", "dashboard analytics", "smartphone app close up"];

const slot: Record<ScenePurpose, number> = { Hook: 0, Story: 1, Product: 2, Benefit: 3, Proof: 1, CTA: 0, Step: 0 };

export function visualQueryFor(purpose: ScenePurpose, analysis: SiteAnalysis, mode: FilmMode): string {
  const text = `${analysis.title} ${analysis.description}`.toLowerCase();
  const category = /\bblues\b|guitar|vinyl|concert/.test(text) ? "music" : analysis.brandProfile?.category ?? "other";
  const pool = mode === "instruction" && (category === "saas" || category === "other" || category === "professional-service") ? instruction : byCategory[category] ?? fallback;
  return pool[slot[purpose] % pool.length];
}
