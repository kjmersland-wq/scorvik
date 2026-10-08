// Minimal fal.ai client over the public queue REST API (no SDK): submit, poll, fetch the result.
import { imageSizeFor } from "./formats.ts";
import { PermanentError, type ModelSpec } from "./router.ts";

type Fetch = typeof fetch;
export interface FalOptions { key?: string; fetchImpl?: Fetch; pollMs?: number; timeoutMs?: number }

export function falKey(env: Record<string, string | undefined> = process.env): string | undefined {
  const key = env.FAL_KEY?.trim();
  return key && !key.startsWith("ditt_") ? key : undefined;
}

export async function runFal(model: string, args: Record<string, unknown>, options: FalOptions = {}): Promise<Record<string, unknown>> {
  const key = options.key ?? falKey();
  if (!key) throw new PermanentError("FAL_KEY is missing. Add it to .env.local and restart the server.");
  if (!/^[a-z0-9][a-z0-9._/-]{2,100}$/i.test(model)) throw new PermanentError("Invalid model name.");
  const doFetch = options.fetchImpl ?? fetch;
  const headers = { authorization: `Key ${key}`, "content-type": "application/json" };
  const submit = await doFetch(`https://queue.fal.run/${model}`, { method: "POST", headers, body: JSON.stringify(args), signal: AbortSignal.timeout(30_000) });
  if (submit.status === 401 || submit.status === 403) throw new PermanentError("fal.ai rejected the key.");
  if (submit.status === 422 || submit.status === 400) throw new PermanentError(`fal.ai rejected the request (${submit.status}).`);
  if (!submit.ok) throw new Error(`fal.ai submit failed (${submit.status}).`);
  const queued = await submit.json() as { status_url?: string; response_url?: string };
  if (!queued.status_url || !queued.response_url) throw new Error("fal.ai gave no queue address.");
  const allowed = (url: string) => /^https:\/\/([a-z0-9-]+\.)*fal\.(run|ai)\//i.test(url);
  if (!allowed(queued.status_url) || !allowed(queued.response_url)) throw new Error("fal.ai gave an unexpected queue address.");
  const deadline = Date.now() + (options.timeoutMs ?? 240_000);
  const pollMs = options.pollMs ?? 1200;
  for (;;) {
    const status = await doFetch(queued.status_url, { headers, signal: AbortSignal.timeout(20_000) });
    if (!status.ok) throw new Error(`fal.ai status failed (${status.status}).`);
    const state = (await status.json() as { status?: string }).status;
    if (state === "COMPLETED") break;
    if (state === "FAILED" || state === "CANCELLED") throw new Error(`fal.ai job ${state?.toLowerCase()}.`);
    if (Date.now() > deadline) throw new Error("fal.ai took too long.");
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  const result = await doFetch(queued.response_url, { headers, signal: AbortSignal.timeout(30_000) });
  if (!result.ok) throw new Error(`fal.ai result failed (${result.status}).`);
  return await result.json() as Record<string, unknown>;
}

export interface ImageJob { prompt: string; aspect: string; seed?: number; referenceImageUrl?: string; productImageUrl?: string }

const kontextAspects = new Set(["16:9", "4:3", "1:1", "3:4", "9:16"]);

/** Builds the model-specific arguments (a plain function so it can be tested without a network). */
export function imageArguments(spec: ModelSpec, job: ImageJob): Record<string, unknown> {
  let args: Record<string, unknown>;
  if (spec.task === "image_ref") {
    args = { prompt: job.prompt, reference_image_url: job.referenceImageUrl, image_size: sizeArg(job.aspect), num_inference_steps: 20, guidance_scale: 4, id_weight: 1.0 };
  } else if (spec.task === "image_product") {
    args = { prompt: job.prompt, image_url: job.productImageUrl, aspect_ratio: kontextAspects.has(job.aspect) ? job.aspect : job.aspect === "4:5" ? "3:4" : "16:9", num_images: 1 };
  } else {
    const fast = spec.model.includes("schnell");
    args = { prompt: job.prompt, image_size: sizeArg(job.aspect), num_inference_steps: fast ? 4 : 28, num_images: 1, enable_safety_checker: true, ...(fast ? {} : { guidance_scale: 3.5 }) };
  }
  if (job.seed !== undefined) args.seed = job.seed;
  return args;
}

function sizeArg(aspect: string): string | { width: number; height: number } {
  const name = imageSizeFor(aspect);
  return name === "custom_4_5" ? { width: 832, height: 1040 } : name;
}

export async function generateImage(spec: ModelSpec, job: ImageJob, options: FalOptions = {}): Promise<string> {
  if ((spec.task === "image_ref" && !job.referenceImageUrl) || (spec.task === "image_product" && !job.productImageUrl)) throw new PermanentError("The reference picture is missing.");
  const result = await runFal(spec.model, imageArguments(spec, job), options);
  const images = result.images as Array<{ url?: string }> | undefined;
  const url = images?.[0]?.url;
  if (!url || !/^https:\/\//.test(url)) throw new Error("fal.ai returned no picture.");
  return url;
}
