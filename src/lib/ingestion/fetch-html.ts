import https from "node:https";
import http from "node:http";
import type { IncomingHttpHeaders, RequestOptions } from "node:http";
import type { AddressResolver, ResolvedAddress } from "./security.ts";
import { normalizeWebsiteUrl, resolvePublicAddress, WebsiteIngestionError } from "./security.ts";

export interface HtmlPageResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
  url: string;
}

export interface FetchHtmlOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  resolver?: AddressResolver;
  request?: (url: URL, address: ResolvedAddress, timeoutMs: number, maxBytes: number) => Promise<{ status: number; headers: IncomingHttpHeaders; body: string }>;
}

function requestPinned(url: URL, address: ResolvedAddress, timeoutMs: number, maxBytes: number) {
  return new Promise<{ status: number; headers: IncomingHttpHeaders; body: string }>((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const options: RequestOptions = {
      protocol: url.protocol,
      hostname: url.hostname.replace(/^\[|\]$/g, ""),
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: "GET",
      headers: {
        accept: "text/html,application/xhtml+xml;q=0.9",
        "user-agent": "ScorvikBot/1.0",
        "accept-encoding": "identity",
        connection: "close",
      },
      lookup: (_hostname, _lookupOptions, callback) => callback(null, address.address, address.family),
      agent: false,
    };
    const outgoing = transport.request(url, options, (incoming) => {
      const status = incoming.statusCode ?? 0;
      const headers = incoming.headers;
      if (status >= 300 && status < 400 && headers.location) {
        incoming.resume();
        resolve({ status, headers, body: "" });
        return;
      }
      const declaredLength = Number(headers["content-length"]);
      if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        incoming.destroy(new WebsiteIngestionError("RESPONSE_TOO_LARGE", "The page is too large to analyze."));
        return;
      }
      const chunks: Buffer[] = [];
      let received = 0;
      incoming.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        received += buffer.length;
        if (received > maxBytes) {
          incoming.destroy(new WebsiteIngestionError("RESPONSE_TOO_LARGE", "The page is too large to analyze."));
          return;
        }
        chunks.push(buffer);
      });
      incoming.on("end", () => resolve({ status, headers, body: Buffer.concat(chunks).toString("utf8") }));
      incoming.on("error", reject);
    });
    outgoing.setTimeout(timeoutMs, () => outgoing.destroy(new WebsiteIngestionError("TIMEOUT", "The website took too long to respond.")));
    outgoing.on("error", (error) => {
      if (error instanceof WebsiteIngestionError) reject(error);
      else reject(new WebsiteIngestionError("UNAVAILABLE", "We couldn't access this website."));
    });
    outgoing.end();
  });
}

export async function fetchWebsiteHtml(input: string, options: FetchHtmlOptions = {}): Promise<HtmlPageResponse> {
  const timeoutMs = options.timeoutMs ?? 8000;
  const maxBytes = options.maxBytes ?? 1_500_000;
  const maxRedirects = options.maxRedirects ?? 4;
  const resolver = options.resolver;
  const request = options.request ?? requestPinned;
  let url = normalizeWebsiteUrl(input);

  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    const address = await resolvePublicAddress(url.hostname, resolver);
    const response = await request(url, address, timeoutMs, maxBytes);
    if (Buffer.byteLength(response.body, "utf8") > maxBytes) {
      throw new WebsiteIngestionError("RESPONSE_TOO_LARGE", "The page is too large to analyze.");
    }
    if (response.status >= 300 && response.status < 400 && response.headers.location) {
      if (redirects === maxRedirects) throw new WebsiteIngestionError("UNAVAILABLE", "This website redirected too many times.");
      let next: URL;
      try {
        const location = Array.isArray(response.headers.location) ? response.headers.location[0] : response.headers.location;
        next = normalizeWebsiteUrl(new URL(location, url).href);
      } catch (error) {
        if (error instanceof WebsiteIngestionError) throw error;
        throw new WebsiteIngestionError("UNAVAILABLE", "This website redirected to an invalid address.");
      }
      if (url.protocol === "https:" && next.protocol !== "https:") {
        throw new WebsiteIngestionError("BLOCKED_URL", "This website redirected to an insecure address.");
      }
      url = next;
      continue;
    }
    if (response.status === 401 || response.status === 403) throw new WebsiteIngestionError("ACCESS_DENIED", "This website doesn't allow public access.");
    if (response.status < 200 || response.status >= 300) throw new WebsiteIngestionError("UNAVAILABLE", "We couldn't access this website.");
    const contentType = String(response.headers["content-type"] ?? "").toLowerCase();
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      throw new WebsiteIngestionError("UNSUPPORTED_CONTENT", "This address doesn't point to a supported webpage.");
    }
    if (!response.body.trim()) throw new WebsiteIngestionError("EMPTY_PAGE", "This webpage doesn't contain readable content.");
    return { ...response, url: url.href };
  }
  throw new WebsiteIngestionError("UNAVAILABLE", "We couldn't access this website.");
}
