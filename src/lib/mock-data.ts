import type { SiteAnalysis, StoryScene, VideoSettings } from "@/types/project";

const sceneImages = [
  "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=700&q=85",
  "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=700&q=85",
  "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=700&q=85",
  "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=700&q=85",
];

export const demoScenes: StoryScene[] = [
  { id: "scene-1", purpose: "Hook", duration: 4, headline: "A better kind of everyday", supportingText: "Thoughtful pieces. Made to move with you.", voiceover: "Meet the pieces that make every day feel a little more considered.", transition: "Slow reveal", visual: sceneImages[0] },
  { id: "scene-2", purpose: "Story", duration: 5, headline: "Made for real life", supportingText: "Comfort, without compromising on form.", voiceover: "Designed for the way your days actually unfold.", transition: "Soft cut", visual: sceneImages[1] },
  { id: "scene-3", purpose: "Product", duration: 5, headline: "Details worth noticing", supportingText: "Natural textures. Lasting construction.", voiceover: "Every detail earns its place, from the first stitch to the final finish.", transition: "Match cut", visual: sceneImages[2] },
  { id: "scene-4", purpose: "Benefit", duration: 5, headline: "A wardrobe that works harder", supportingText: "Less searching. More reaching for it.", voiceover: "Pieces that go further, and feel like you from day one.", transition: "Gentle pan", visual: sceneImages[3] },
  { id: "scene-5", purpose: "Proof", duration: 5, headline: "Chosen again and again", supportingText: "A considered edit customers come back to.", voiceover: "The kind of quality you notice every time you wear it.", transition: "Dissolve", visual: sceneImages[1] },
  { id: "scene-6", purpose: "CTA", duration: 6, headline: "Find your next favourite", supportingText: "Explore the collection at northline.studio", voiceover: "Discover your next favourite. Explore Northline Studio today.", transition: "Fade out", visual: sceneImages[0] },
];

export const defaultSettings: VideoSettings = { format: "16:9", duration: 30, language: "English", voice: "Maya · warm", style: "Editorial", music: "Modern" };

export function buildMockAnalysis(value: string): SiteAnalysis {
  const url = new URL(value.includes("://") ? value : `https://${value}`);
  const brand = url.hostname.replace(/^www\./, "").split(".")[0];
  const title = brand.charAt(0).toUpperCase() + brand.slice(1);
  return {
    url: url.href,
    title: `${title} Studio | Considered essentials`,
    description: "A considered collection of modern essentials, made with care and designed to last beyond the season.",
    brand: title,
    colors: ["#193F32", "#DCE6CF", "#F4F2EA"],
    sellingPoints: ["Made to last", "Thoughtful materials", "Everyday versatility"],
    image: sceneImages[0],
  };
}

export function createScene(): StoryScene {
  return { id: `scene-${crypto.randomUUID()}`, purpose: "Story", duration: 4, headline: "A moment worth keeping", supportingText: "Add a line that brings this scene to life.", voiceover: "", transition: "Soft cut", visual: sceneImages[2] };
}
