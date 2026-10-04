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

export const defaultSettings: VideoSettings = { mode: "advert", showTextOnScreen: true, format: "16:9", duration: 30, language: "English", voice: "Maya · warm", style: "Editorial", music: "Modern" };

const sampleInstructions = {
  northline: {
    en: [
      { title: "Find the collection", description: "Open the collection you want to browse." },
      { title: "Choose a piece", description: "Open a product to see its details and images." },
      { title: "Pick a size", description: "Choose the size that works for you." },
      { title: "Add it to your bag", description: "Review your choice before checkout." },
    ],
    no: [
      { title: "Finn kolleksjonen", description: "Åpne kolleksjonen du vil se nærmere på." },
      { title: "Velg et plagg", description: "Åpne produktet for å se detaljer og bilder." },
      { title: "Finn riktig størrelse", description: "Velg størrelsen som passer for deg." },
      { title: "Legg det i handlekurven", description: "Se over valget før du går til kassen." },
    ],
  },
  quietform: {
    en: [
      { title: "Create a workspace", description: "Give the new workspace a name and open it." },
      { title: "Invite your team", description: "Add the people who need to work with you." },
      { title: "Set up a workflow", description: "Choose the steps that fit the way your team works." },
      { title: "Review the result", description: "Check progress and make changes as work moves on." },
    ],
    no: [
      { title: "Opprett et arbeidsrom", description: "Gi arbeidsrommet et navn og åpne det." },
      { title: "Inviter teamet", description: "Legg til dem som skal jobbe sammen med deg." },
      { title: "Sett opp en arbeidsflyt", description: "Velg stegene som passer måten teamet jobber på." },
      { title: "Gå gjennom resultatet", description: "Følg fremdriften og gjør endringer underveis." },
    ],
  },
  goodfield: {
    en: [
      { title: "Choose a market", description: "Browse the local producers and seasonal selection." },
      { title: "Build your basket", description: "Add the items you want from each producer." },
      { title: "Choose a pickup time", description: "Select a collection point and a time that suits you." },
      { title: "Confirm your order", description: "Review the basket and place your order." },
    ],
    no: [
      { title: "Velg marked", description: "Se gjennom lokale produsenter og varer i sesong." },
      { title: "Fyll handlekurven", description: "Legg til varene du vil ha fra hver produsent." },
      { title: "Velg hentetid", description: "Finn et hentested og et tidspunkt som passer." },
      { title: "Bekreft bestillingen", description: "Gå gjennom handlekurven og send bestillingen." },
    ],
  },
} as const;

export function buildMockAnalysis(value: string, locale: "en" | "no" = "en"): SiteAnalysis {
  const url = new URL(value.includes("://") ? value : `https://${value}`);
  const brand = url.hostname.replace(/^www\./, "").split(".")[0];
  const key = brand.toLowerCase().includes("quietform") ? "quietform" : brand.toLowerCase().includes("goodfield") ? "goodfield" : "northline";
  const title = key === "northline" ? "Northline" : key === "quietform" ? "Quietform" : "Goodfield";
  const norwegian = locale === "no";
  const steps = sampleInstructions[key][locale];
  return {
    url: url.href,
    title: key === "quietform" ? norwegian ? "Quietform | Enklere arbeidsflyt" : "Quietform | A calmer workflow" : key === "goodfield" ? norwegian ? "Goodfield | Lokale varer, samlet" : "Goodfield | Local food, together" : norwegian ? "Northline | Klær til hverdagen" : "Northline Studio | Considered essentials",
    description: key === "quietform" ? norwegian ? "Samle oppgaver, team og arbeidsflyt på ett sted." : "Bring projects, teams and workflows together in one place." : key === "goodfield" ? norwegian ? "Handle sesongvarer fra lokale produsenter på ett marked." : "Shop seasonal food from local producers in one market." : norwegian ? "Klær med gjennomtenkte materialer, laget for å vare." : "A considered collection of modern essentials, made with care and designed to last beyond the season.",
    brand: title,
    colors: ["#193F32", "#DCE6CF", "#F4F2EA"],
    sellingPoints: key === "quietform" ? norwegian ? ["Samlet arbeidsflyt", "Enkelt samarbeid", "Bedre oversikt"] : ["Connected workflows", "Simple collaboration", "A clearer overview"] : key === "goodfield" ? norwegian ? ["Lokale produsenter", "Varer i sesong", "Enkel henting"] : ["Local producers", "Seasonal goods", "Easy collection"] : norwegian ? ["Laget for å vare", "Gjennomtenkte materialer", "Klær til hverdagen"] : ["Made to last", "Thoughtful materials", "Everyday versatility"],
    image: sceneImages[0],
    headings: steps.map((step) => step.title),
    steps: [...steps],
    callsToAction: [norwegian ? "Se utvalget" : "Explore the selection"],
  };
}

export function createScene(locale: "en" | "no" = "en"): StoryScene {
  return locale === "no"
    ? { id: `scene-${crypto.randomUUID()}`, purpose: "Step", duration: 15, headline: "Et steg verdt å vise", supportingText: "Legg til en kort forklaring.", voiceover: "", transition: "Mykt klipp", visual: sceneImages[2] }
    : { id: `scene-${crypto.randomUUID()}`, purpose: "Step", duration: 15, headline: "A step worth showing", supportingText: "Add a short explanation.", voiceover: "", transition: "Soft cut", visual: sceneImages[2] };
}
