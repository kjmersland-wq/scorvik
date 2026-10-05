import https from "node:https";
import http from "node:http";
import type { IncomingHttpHeaders, RequestOptions } from "node:http";
import type { AddressResolver, ResolvedAddress } from "./security.ts";
import { normalizeWebsiteUrl, resolvePublicAddresses, WebsiteIngestionError } from "./security.ts";

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

export function createPinnedLookup(address: ResolvedAddress): NonNullable<RequestOptions["lookup"]> {
  return (_hostname, options, callback) => {
    if (options.all) {
      callback(null, [address]);
      return;
    }
    callback(null, address.address, address.family);
  };
}

function timeoutError(): WebsiteIngestionError {
  return new WebsiteIngestionError("TIMEOUT", "That page is taking a little while to respond. Try again in a moment.");
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(timeoutError()), timeoutMs);
  });
  return Promise.race([operation, timeout]).finally(() => clearTimeout(timer));
}

function requestPinned(url: URL, address: ResolvedAddress, timeoutMs: number, maxBytes: number) {
  return new Promise<{ status: number; headers: IncomingHttpHeaders; body: string }>((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const options: RequestOptions = {
      protocol: url.protocol,
      hostname: url.hostname.replace(/^\[|\]$/g, ""),
      port: url.port || undefined,
      family: address.family,
      path: `${url.pathname}${url.search}`,
      method: "GET",
      headers: {
        accept: "text/html,application/xhtml+xml;q=0.9",
        "user-agent": "ScorvikBot/1.0",
        "accept-encoding": "identity",
        connection: "close",
      },
      lookup: createPinnedLookup(address),
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
        incoming.destroy(new WebsiteIngestionError("RESPONSE_TOO_LARGE", "This page has a lot to take in. Try a simpler page, like your homepage."));
        return;
      }
      const chunks: Buffer[] = [];
      let received = 0;
      incoming.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        received += buffer.length;
        if (received > maxBytes) {
          incoming.destroy(new WebsiteIngestionError("RESPONSE_TOO_LARGE", "This page has a lot to take in. Try a simpler page, like your homepage."));
          return;
        }
        chunks.push(buffer);
      });
      incoming.on("end", () => resolve({ status, headers, body: Buffer.concat(chunks).toString("utf8") }));
      incoming.on("error", reject);
    });
    const connectionDeadline = setTimeout(() => outgoing.destroy(new WebsiteIngestionError("UNAVAILABLE", "We couldn't reach that page just now. Check the link and try again.")), Math.min(timeoutMs, 2500));
    const deadline = setTimeout(() => outgoing.destroy(timeoutError()), timeoutMs);
    outgoing.once("socket", (socket) => {
      socket.once(url.protocol === "https:" ? "secureConnect" : "connect", () => clearTimeout(connectionDeadline));
    });
    outgoing.once("close", () => {
      clearTimeout(connectionDeadline);
      clearTimeout(deadline);
    });
    outgoing.setTimeout(timeoutMs, () => outgoing.destroy(timeoutError()));
    outgoing.on("error", (error) => {
      if (error instanceof WebsiteIngestionError) reject(error);
      else reject(new WebsiteIngestionError("UNAVAILABLE", "We couldn't reach that page just now. Check the link and try again."));
    });
    outgoing.end();
  });
}

export async function fetchWebsiteHtml(input: string, options: FetchHtmlOptions = {}): Promise<HtmlPageResponse> {
  const timeoutMs = Math.max(1, options.timeoutMs ?? 8000);
  const maxBytes = options.maxBytes ?? 1_500_000;
  const maxRedirects = options.maxRedirects ?? 4;
  const resolver = options.resolver;
  const request = options.request ?? requestPinned;
  const deadline = Date.now() + timeoutMs;
  let url = normalizeWebsiteUrl(input);

  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw timeoutError();
    let addresses: ResolvedAddress[];
    try {
      addresses = await withTimeout(resolvePublicAddresses(url.hostname, resolver), remainingMs);
    } catch (error) {
      if (error instanceof WebsiteIngestionError) throw error;
      throw new WebsiteIngestionError("UNAVAILABLE", "We couldn't reach that page just now. Check the link and try again.");
    }
    let response: Awaited<ReturnType<typeof request>> | undefined;
    let lastRequestError: WebsiteIngestionError | undefined;
    let lastServerError: Awaited<ReturnType<typeof request>> | undefined;
    for (const [index, address] of addresses.entries()) {
      const addressTimeRemaining = deadline - Date.now();
      if (addressTimeRemaining <= 0) {
        lastRequestError = timeoutError();
        break;
      }
      try {
        const candidate = await withTimeout(request(url, address, addressTimeRemaining, maxBytes), addressTimeRemaining);
        if (candidate.status >= 500 && index < addresses.length - 1) {
          lastServerError = candidate;
          continue;
        }
        response = candidate;
        break;
      } catch (error) {
        if (error instanceof WebsiteIngestionError) {
          if (error.code !== "UNAVAILABLE" && error.code !== "TIMEOUT") throw error;
          lastRequestError = error;
        } else {
          lastRequestError = new WebsiteIngestionError("UNAVAILABLE", "We couldn't reach that page just now. Check the link and try again.");
        }
      }
    }
    response ??= lastServerError;
    if (!response) throw lastRequestError ?? new WebsiteIngestionError("UNAVAILABLE", "We couldn't reach that page just now. Check the link and try again.");
    if (Buffer.byteLength(response.body, "utf8") > maxBytes) {
      throw new WebsiteIngestionError("RESPONSE_TOO_LARGE", "This page has a lot to take in. Try a simpler page, like your homepage.");
    }
    if (response.status >= 300 && response.status < 400 && response.headers.location) {
      if (redirects === maxRedirects) throw new WebsiteIngestionError("UNAVAILABLE", "This page took a few too many turns. Try the website's homepage instead.");
      let next: URL;
      try {
        const location = Array.isArray(response.headers.location) ? response.headers.location[0] : response.headers.location;
        next = normalizeWebsiteUrl(new URL(location, url).href);
      } catch (error) {
        if (error instanceof WebsiteIngestionError) throw error;
        throw new WebsiteIngestionError("UNAVAILABLE", "We couldn't follow that link. Try the website's homepage instead.");
      }
      if (url.protocol === "https:" && next.protocol !== "https:") {
        throw new WebsiteIngestionError("BLOCKED_URL", "That link didn't feel safe to follow. Try the website's homepage instead.");
      }
      url = next;
      continue;
    }
    if (response.status === 401 || response.status === 403) throw new WebsiteIngestionError("ACCESS_DENIED", "This site isn't open to visitors right now. Try another public page.");
    if (response.status < 200 || response.status >= 300) throw new WebsiteIngestionError("UNAVAILABLE", "We couldn't reach that page just now. Check the link and try again.");
    const contentType = String(response.headers["content-type"] ?? "").toLowerCase();
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      throw new WebsiteIngestionError("UNSUPPORTED_CONTENT", "That link doesn't lead to a page we can read. Try another one.");
    }
    if (!response.body.trim()) throw new WebsiteIngestionError("EMPTY_PAGE", "We couldn't find enough to work with on this page. Try another one.");
    return { ...response, url: url.href };
  }
  throw new WebsiteIngestionError("UNAVAILABLE", "We couldn't reach that page just now. Check the link and try again.");
}
