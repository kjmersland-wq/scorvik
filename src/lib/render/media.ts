import https from "node:https";
import http from "node:http";
import type { IncomingHttpHeaders, RequestOptions } from "node:http";
import { createPinnedLookup } from "../ingestion/fetch-html.ts";
import { normalizeWebsiteUrl, resolvePublicAddresses, WebsiteIngestionError, type ResolvedAddress } from "../ingestion/security.ts";
import { RenderError } from "./validation.ts";

const maxImageBytes = 8_000_000;
const supportedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

interface ImageFetchResult {
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

function requestPinnedImage(url: URL, address: ResolvedAddress, timeoutMs: number): Promise<ImageFetchResult> {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const options: RequestOptions = {
      protocol: url.protocol,
      hostname: url.hostname.replace(/^\[|\]$/g, ""),
      family: address.family,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: "GET",
      headers: { accept: "image/jpeg,image/png,image/webp", "accept-encoding": "identity", "user-agent": "ScorvikRenderer/1.0", connection: "close" },
      lookup: createPinnedLookup(address),
      agent: false,
    };
    const request = transport.request(url, options, (response) => {
      const status = response.statusCode ?? 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        resolve({ status, headers: response.headers, body: Buffer.alloc(0) });
        return;
      }
      const declaredLength = Number(response.headers["content-length"]);
      if (Number.isFinite(declaredLength) && declaredLength > maxImageBytes) {
        response.destroy(new RenderError("INVALID_MEDIA", "A project image exceeds the render media size limit."));
        return;
      }
      const chunks: Buffer[] = [];
      let received = 0;
      response.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        received += buffer.length;
        if (received > maxImageBytes) {
          response.destroy(new RenderError("INVALID_MEDIA", "A project image exceeds the render media size limit."));
          return;
        }
        chunks.push(buffer);
      });
      response.on("end", () => resolve({ status, headers: response.headers, body: Buffer.concat(chunks) }));
      response.on("error", reject);
    });
    request.setTimeout(timeoutMs, () => request.destroy(new RenderError("RENDER_TIMEOUT", "Timed out while downloading a project image.")));
    request.on("error", reject);
    request.end();
  });
}

export async function fetchProjectImage(input: string, baseUrl: string): Promise<{ body: Buffer; contentType: string }> {
  let url: URL;
  try {
    url = normalizeWebsiteUrl(new URL(input, baseUrl).href);
  } catch (error) {
    if (error instanceof WebsiteIngestionError) throw new RenderError("INVALID_MEDIA", "A project image URL is invalid or not publicly accessible.");
    throw new RenderError("INVALID_MEDIA", "A project image URL is invalid.");
  }

  for (let redirect = 0; redirect <= 3; redirect += 1) {
    const addresses = await resolvePublicAddresses(url.hostname);
    let response: ImageFetchResult | undefined;
    let lastError: unknown;
    for (const address of addresses) {
      try {
        response = await requestPinnedImage(url, address, 5000);
        if (response.status >= 500 && address !== addresses.at(-1)) continue;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!response) throw new RenderError("INVALID_MEDIA", lastError instanceof RenderError ? lastError.message : "Could not retrieve a public project image.");
    if (response.status >= 300 && response.status < 400 && response.headers.location) {
      if (redirect === 3) throw new RenderError("INVALID_MEDIA", "A project image redirected too many times.");
      let next: URL;
      try {
        next = normalizeWebsiteUrl(new URL(response.headers.location, url).href);
      } catch {
        throw new RenderError("INVALID_MEDIA", "A project image redirect target is invalid.");
      }
      if (url.protocol === "https:" && next.protocol !== "https:") throw new RenderError("INVALID_MEDIA", "A project image redirect attempted to downgrade HTTPS.");
      url = next;
      continue;
    }
    if (response.status !== 200) throw new RenderError("INVALID_MEDIA", `Project image returned HTTP ${response.status}.`);
    const contentType = String(response.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    if (!supportedImageTypes.has(contentType)) throw new RenderError("INVALID_MEDIA", "Project images must be JPEG, PNG, or WebP.");
    if (!response.body.length) throw new RenderError("INVALID_MEDIA", "A project image was empty.");
    return { body: response.body, contentType };
  }
  throw new RenderError("INVALID_MEDIA", "Could not follow the project image URL.");
}
