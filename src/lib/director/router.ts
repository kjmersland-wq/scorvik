// Model router: picks the model for a job, runs it with retry and fallback, estimates cost and makes requests repeatable.
// All plain code: nothing here calls an AI for something code does better, cheaper and safer.
import { createHash } from "node:crypto";

/** A failure retrying cannot fix (missing key, invalid request). */
export class PermanentError extends Error {}

export type Task = "image" | "image_ref" | "image_product" | "video";
export type Tier = "draft" | "final";
export interface ModelSpec { provider: "fal" | "local"; model: string; task: Task; tier: Tier; note: string }

type Env = Record<string, string | undefined>;

export function modelNames(env: Env = process.env) {
  return {
    draft: env.FAL_DRAFT_MODEL || "fal-ai/flux/schnell",
    image: env.FAL_IMAGE_MODEL || "fal-ai/flux/dev",
    character: env.FAL_CHARACTER_MODEL || "fal-ai/flux-pulid",
    product: env.FAL_PRODUCT_MODEL || "fal-ai/flux-pro/kontext",
    video: env.FAL_VIDEO_MODEL || "fal-ai/kling-video/v1/standard/image-to-video",
  };
}

export function catalog(env: Env = process.env): ModelSpec[] {
  const names = modelNames(env);
  return [
    { provider: "fal", model: names.draft, task: "image", tier: "draft", note: "Fast and cheap, for drafts" },
    { provider: "fal", model: names.image, task: "image", tier: "final", note: "Best picture quality" },
    { provider: "fal", model: names.character, task: "image_ref", tier: "final", note: "Keeps the face from the reference picture" },
    { provider: "fal", model: names.product, task: "image_product", tier: "final", note: "Keeps the product from the reference picture" },
    { provider: "fal", model: names.video, task: "video", tier: "final", note: "Picture to video" },
  ];
}

/** Approximate USD prices from third-party comparisons (not from the provider). Unknown models give null and totals are marked incomplete. */
const prices: Record<string, ["mp" | "image" | "sec", number]> = {
  "fal-ai/flux/schnell": ["mp", 0.003],
  "fal-ai/flux/dev": ["mp", 0.025],
  "fal-ai/flux-pro/kontext": ["image", 0.04],
};

export const imageDimensions: Record<string, [number, number]> = {
  landscape_16_9: [1024, 576],
  landscape_4_3: [1024, 768],
  square_hd: [1024, 1024],
  portrait_4_3: [768, 1024],
  portrait_16_9: [576, 1024],
  custom_4_5: [832, 1040],
};

export interface Requirement { task: "image" | "video"; tier?: Tier; hasReference?: boolean; hasProductReference?: boolean }
export interface ModelDecision { spec: ModelSpec; fallbacks: ModelSpec[]; reason: string }

export function decide(requirement: Requirement, env: Env = process.env): ModelDecision {
  const specs = catalog(env);
  const pick = (task: Task, tier: Tier) => specs.find((spec) => spec.task === task && spec.tier === tier)!;
  const tier = requirement.tier ?? "final";
  if (requirement.task === "video") {
    if (tier === "draft") {
      return { spec: { provider: "local", model: "kenburns", task: "video", tier: "draft", note: "A calm zoom on the still, drawn on your own device" }, fallbacks: [], reason: "Draft: the still is animated locally with a calm zoom. No AI video and no cost." };
    }
    return { spec: pick("video", "final"), fallbacks: [], reason: "The picture-to-video model." };
  }
  if (requirement.hasReference) {
    return { spec: pick("image_ref", "final"), fallbacks: [], reason: "A character with a face reference uses the reference model. No fallback, so the identity is never swapped silently." };
  }
  if (requirement.hasProductReference) {
    return { spec: pick("image_product", "final"), fallbacks: [], reason: "A scene with a product reference uses the product model. No fallback, so the product is never changed silently." };
  }
  const draft = tier === "draft";
  const primary = pick("image", draft ? "draft" : "final");
  const fallback = pick("image", draft ? "final" : "draft");
  const reason = draft ? "Draft: the cheapest image model, the better one as fallback." : "Final quality: the best image model, the fast one as fallback.";
  return { spec: primary, fallbacks: fallback.model !== primary.model ? [fallback] : [], reason };
}

export interface RunResult<T> { value: T; spec: ModelSpec; attempts: number; degraded: boolean; errors: string[] }

/** Tries the primary model (with `retries` more attempts), then each fallback. A PermanentError stops at once: a fallback cannot fix a missing key. */
export async function runWithFallback<T>(
  decision: ModelDecision,
  call: (spec: ModelSpec) => Promise<T>,
  options: { retries?: number; delayMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<RunResult<T>> {
  const retries = options.retries ?? 1;
  const delayMs = options.delayMs ?? 1500;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const errors: string[] = [];
  let attempts = 0;
  const specs = [decision.spec, ...decision.fallbacks];
  for (const [index, spec] of specs.entries()) {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      attempts += 1;
      try {
        return { value: await call(spec), spec, attempts, degraded: index > 0, errors };
      } catch (error) {
        if (error instanceof PermanentError) throw error;
        errors.push(`${spec.model}: ${error instanceof Error ? error.message : String(error)}`);
        if (attempt < retries) await sleep(delayMs * (attempt + 1));
      }
    }
  }
  throw new Error(`All attempts failed. ${errors.slice(-3).join(" | ")}`);
}

/** Estimated cost in USD, or null when the model's price is unknown. Local and free work costs 0. */
export function estimateCost(spec: ModelSpec, options: { imageSize?: string; seconds?: number } = {}): number | null {
  if (spec.provider === "local") return 0;
  const price = prices[spec.model];
  if (!price) return null;
  const [unit, usd] = price;
  if (unit === "image") return usd;
  if (unit === "mp" && options.imageSize) {
    const [w, h] = imageDimensions[options.imageSize] ?? imageDimensions.landscape_16_9;
    return Math.round(usd * w * h / 1_000_000 * 1e5) / 1e5;
  }
  if (unit === "sec" && options.seconds) return Math.round(usd * options.seconds * 1e5) / 1e5;
  return null;
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, item]) => [key, stable(item)]));
  return value;
}

export function requestHash(...parts: unknown[]): string {
  return createHash("sha1").update(JSON.stringify(stable(parts))).digest("hex");
}

/** Deterministic seed: the same request gives the same picture, and every new variation gets a new seed. */
export function seedFor(baseHash: string, variation: number): number {
  return parseInt(createHash("sha1").update(`${baseHash}:${variation}`).digest("hex").slice(0, 8), 16) % 2_147_483_647;
}
