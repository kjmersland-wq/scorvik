import type { FontSpec, PosterFace } from "./text.ts";

// Fonts ship with the app (public/fonts, SIL Open Font License). Nothing is fetched from a font service at render time.

const families: Record<PosterFace, string> = {
  display: '"Poster Display", "Instrument Serif", Georgia, "Times New Roman", serif',
  grotesque: '"Poster Grotesque", Inter, "Helvetica Neue", Arial, sans-serif',
};

export function fontCss(font: FontSpec): string {
  return `${font.weight} ${font.size}px ${families[font.face]}`;
}

let loading: Promise<void> | null = null;

/** Loads the bundled faces once. If loading fails the system fallbacks in the stacks above are used. */
export function ensurePosterFonts(): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return Promise.resolve();
  loading ??= (async () => {
    const faces = [
      new FontFace("Poster Display", "url(/fonts/instrument-serif-latin-400.woff2) format('woff2')", { weight: "400" }),
      new FontFace("Poster Grotesque", "url(/fonts/inter-latin-500.woff2) format('woff2')", { weight: "500" }),
      new FontFace("Poster Grotesque", "url(/fonts/inter-latin-700.woff2) format('woff2')", { weight: "700" }),
    ];
    await Promise.all(faces.map(async (face) => { document.fonts.add(await face.load()); }));
  })().catch(() => { loading = null; });
  return loading;
}
