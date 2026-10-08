// Products and characters that must look the same in every scene. Each entry holds words (what to keep) and one reference
// picture. Pure functions only: no browser or Node modules, so both the studio and the server can use them.

export type AssetKind = "product" | "character";

export interface LibraryAsset {
  id: string;
  kind: AssetKind;
  name: string;
  description: string;
  appearance: string;
  colors: string[];
  /** things that must never change ("keep the red cap", "no extra logos") */
  prohibitedChanges: string[];
  /** reference picture as a data URL (small JPEG/PNG/WebP) or an https address */
  image?: string;
  createdAt: string;
}

export const limits = { name: 60, description: 300, appearance: 300, listItem: 80, listItems: 8, image: 3_000_000 };

const dataImage = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;

/** A reference picture the server may pass on: a small data URL or an https address. */
export function validReferenceImage(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (value.length <= 2000 && /^https:\/\/[^\s]+$/.test(value)) return value;
  if (value.length <= limits.image && dataImage.test(value)) return value;
  return undefined;
}

const clean = (value: unknown, max: number) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
const list = (value: unknown) => (Array.isArray(value) ? value : typeof value === "string" ? value.split(/[;,\n]/) : [])
  .map((item) => clean(item, limits.listItem)).filter(Boolean).slice(0, limits.listItems);

/** Accepts only well-formed entries; anything else (old or hand-edited storage) is dropped. */
export function sanitizeAsset(raw: unknown): LibraryAsset | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const kind = item.kind === "character" ? "character" : item.kind === "product" ? "product" : null;
  const id = clean(item.id, 80);
  const name = clean(item.name, limits.name);
  if (!kind || !id || !name) return null;
  return {
    id, kind, name,
    description: clean(item.description, limits.description),
    appearance: clean(item.appearance, limits.appearance),
    colors: list(item.colors),
    prohibitedChanges: list(item.prohibitedChanges),
    image: validReferenceImage(item.image),
    createdAt: clean(item.createdAt, 40) || new Date(0).toISOString(),
  };
}

/** The key people write after @ to bring an asset into a scene: the name without spaces or punctuation. */
export const mentionKey = (name: string) => name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/** Assets mentioned as @Name in the text (spaces in the name do not matter). */
export function findMentioned(text: string, assets: LibraryAsset[]): LibraryAsset[] {
  const mentions = new Set([...text.matchAll(/@([\p{L}\p{N}_-]+)/gu)].map((match) => mentionKey(match[1])));
  return mentions.size ? assets.filter((asset) => mentions.has(mentionKey(asset.name))) : [];
}

/** Words that keep the thing the same from scene to scene. The reference picture does the rest. */
export function assetPrompt(asset: LibraryAsset): string {
  const parts = [asset.kind === "product" ? `Featured product: ${asset.name}` : `Recurring character: ${asset.name}`];
  if (asset.description) parts.push(asset.description);
  if (asset.appearance) parts.push(`Appearance: ${asset.appearance}`);
  if (asset.colors.length) parts.push(`${asset.kind === "product" ? "Product" : "Character"} colors: ${asset.colors.join(", ")}`);
  if (asset.prohibitedChanges.length) parts.push(`Never change: ${asset.prohibitedChanges.join("; ")}`);
  return `${parts.join(". ")}.`;
}

/**
 * What to send with a picture request. A character reference wins over a product reference (the router never mixes the two);
 * the product is then only described in words.
 */
export function referencesFor(assets: LibraryAsset[]): { referenceImageUrl?: string; productImageUrl?: string; words: string } {
  const character = assets.find((asset) => asset.kind === "character" && asset.image);
  const product = assets.find((asset) => asset.kind === "product" && asset.image);
  return {
    ...(character ? { referenceImageUrl: character.image } : product ? { productImageUrl: product.image } : {}),
    words: assets.map(assetPrompt).join(" "),
  };
}

export function newAssetId(): string {
  return `asset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
