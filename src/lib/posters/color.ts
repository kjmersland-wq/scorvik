// Colour rules for posters. Pure functions: no DOM, no network.

export type Rgb = [number, number, number];

export const NEAR_BLACK = "#111114";
export const IVORY = "#f5f1e8";
/** WCAG AA contrast for normal text */
export const AA = 4.5;

export function parseHex(value: string | undefined): Rgb | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((value ?? "").trim());
  if (!match) return null;
  const hex = match[1].length === 3 ? [...match[1]].map((char) => char + char).join("") : match[1];
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

export function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((channel) => Math.round(Math.max(0, Math.min(255, channel))).toString(16).padStart(2, "0")).join("")}`;
}

export function relativeLuminance([r, g, b]: Rgb): number {
  const linear = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

export function contrastRatio(first: string, second: string): number {
  const a = parseHex(first);
  const b = parseHex(second);
  if (!a || !b) return 1;
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

function hsv([r, g, b]: Rgb): { s: number; v: number } {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  return { s: max === 0 ? 0 : (max - min) / max, v: max };
}

export function saturationOf(hex: string): number {
  const rgb = parseHex(hex);
  return rgb ? hsv(rgb).s : 0;
}

/** Dull, greyish mid-tones make poor backgrounds. Black, white and clearly coloured fields are fine. */
export function isMuddy(hex: string): boolean {
  const rgb = parseHex(hex);
  if (!rgb) return true;
  const { s, v } = hsv(rgb);
  return s < 0.25 && v > 0.25 && v < 0.82;
}

function isMidGrey(hex: string): boolean {
  const rgb = parseHex(hex);
  if (!rgb) return true;
  const { s, v } = hsv(rgb);
  return s < 0.25 && v > 0.3 && v < 0.75;
}

export function passesAA(field: string, ink: string): boolean {
  return contrastRatio(field, ink) >= AA;
}

/** Ink for a field: the site's own ink if it passes AA (and is not mid-grey), else near-black or ivory, whichever passes better. */
export function inkFor(field: string, preferred?: string): string | null {
  if (preferred && parseHex(preferred) && !isMidGrey(preferred) && passesAA(field, preferred)) return preferred;
  const best = [NEAR_BLACK, IVORY].sort((a, b) => contrastRatio(field, b) - contrastRatio(field, a))[0];
  return passesAA(field, best) ? best : null;
}

export interface FieldAndInk { field: string; ink: string }

/**
 * Field colour: the page background (palette slot 0) when it is not muddy, or, when asked for an accent field,
 * the most saturated brand colour that still gives AA contrast. Falls back to near-black on ivory.
 * The ink always passes AA against the field; text is never mid-grey.
 */
export function chooseFieldAndInk(palette: string[], options: { prefer?: "background" | "accent"; ink?: string } = {}): FieldAndInk {
  const colours = [...new Set(palette.map((value) => parseHex(value)).filter((rgb): rgb is Rgb => Boolean(rgb)).map(toHex))];
  const background = colours[0];
  const accents = colours.filter((hex) => !isMuddy(hex) && saturationOf(hex) >= 0.35).sort((a, b) => saturationOf(b) - saturationOf(a));
  const order = options.prefer === "accent" ? [...accents, background] : [background, ...accents];
  for (const field of order) {
    if (!field || isMuddy(field)) continue;
    const ink = inkFor(field, options.ink);
    if (ink) return { field, ink };
  }
  return { field: IVORY, ink: NEAR_BLACK };
}
