// Text wrapping and fitting for posters. The measuring function is injected, so this module needs no canvas.

export type PosterFace = "display" | "grotesque";

export interface FontSpec { face: PosterFace; weight: number; size: number }

export type Measure = (text: string, font: FontSpec) => number;

export interface FitOptions {
  maxLines: number;
  /** line height as a multiple of the font size */
  lineHeight: number;
  /** the size never goes below this (the brand name has a hard floor) */
  minSize?: number;
}

export interface FitResult {
  lines: string[];
  size: number;
  lineHeightPx: number;
  height: number;
  truncated: boolean;
}

export function wrapWords(text: string, font: FontSpec, maxWidth: number, measure: Measure): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next, font) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function fits(lines: string[], size: number, box: { w: number; h: number }, options: FitOptions, font: FontSpec, measure: Measure): boolean {
  return lines.length <= options.maxLines
    && lines.length * size * options.lineHeight <= box.h
    && lines.every((line) => measure(line, { ...font, size }) <= box.w);
}

/**
 * Shrinks once, then cuts on a word. Never overflows the box.
 * Returns the lines to draw; `truncated` is true when words had to be dropped.
 */
export function fitText(text: string, font: FontSpec, box: { w: number; h: number }, options: FitOptions, measure: Measure): FitResult {
  const clean = text.replace(/\s+/g, " ").trim();
  const result = (lines: string[], size: number, truncated: boolean): FitResult => ({
    lines,
    size,
    lineHeightPx: Math.round(size * options.lineHeight),
    height: Math.round(lines.length * size * options.lineHeight),
    truncated,
  });
  if (!clean) return result([], font.size, false);

  const first = wrapWords(clean, font, box.w, measure);
  if (fits(first, font.size, box, options, font, measure)) return result(first, font.size, false);

  const floor = options.minSize ?? Math.round(font.size * 0.5);
  const shrunk = Math.max(floor, Math.round(font.size * 0.82));
  const smaller = { ...font, size: shrunk };
  const second = wrapWords(clean, smaller, box.w, measure);
  if (fits(second, shrunk, box, options, smaller, measure)) return result(second, shrunk, false);

  // cut on a word, with an ellipsis, until it fits
  const words = clean.split(" ");
  for (let count = words.length - 1; count >= 1; count -= 1) {
    const candidate = `${words.slice(0, count).join(" ").replace(/[\s,.;:–—-]+$/, "")}…`;
    const lines = wrapWords(candidate, smaller, box.w, measure);
    if (fits(lines, shrunk, box, options, smaller, measure)) return result(lines, shrunk, true);
  }
  // a single word that is still too wide: cut characters as the last resort
  let word = words[0];
  while (word.length > 1 && measure(`${word}…`, smaller) > box.w) word = word.slice(0, -1);
  return result([`${word}…`], shrunk, true);
}
