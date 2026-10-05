import { NextResponse } from "next/server";
import { analyzeWebsite } from "@/lib/engine/analyze-website";
import { WebsiteIngestionError } from "@/lib/ingestion/security";
import { getPlatformPreset } from "@/lib/platforms/presets";
import type { FilmMode } from "@/types/project";

export const runtime = "nodejs";

const publicErrors: Record<string, string> = {
  INVALID_URL: "That link doesn't seem to work yet. Check it and we'll try again.",
  BLOCKED_URL: "We can only take a look at public websites. Try a public link instead.",
  PRIVATE_HOST: "We can only take a look at public websites. Try a public link instead.",
  DNS_FAILED: "We couldn't find that website. Check the address and try again.",
  TIMEOUT: "That page is taking a little while to respond. Try again in a moment.",
  ACCESS_DENIED: "This site isn't open to visitors right now. Try another public page.",
  UNSUPPORTED_CONTENT: "That link doesn't lead to a page we can read. Try another one.",
  RESPONSE_TOO_LARGE: "This page has a lot to take in. Try a simpler page, like your homepage.",
  EMPTY_PAGE: "We couldn't find enough to work with on this page. Try another one.",
  PARSE_ERROR: "We couldn't read that page. Try another public page instead.",
  ANALYSIS_ERROR: "We couldn't analyze that page just now. Try again in a moment.",
  STORYBOARD_ERROR: "We couldn't create a story from that page. Try another public page.",
  MUSIC_ERROR: "We couldn't prepare a music recommendation just now.",
  UNAVAILABLE: "We couldn't reach that page just now. Check the link and try again.",
};

const requestLimitBytes = 10_000;

async function readLimitedBody(request: Request): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > requestLimitBytes) {
      await reader.cancel();
      throw new Error("REQUEST_TOO_LARGE");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

function errorResponse(code: string, status: number) {
  return NextResponse.json({ error: { code, message: publicErrors[code] ?? publicErrors.ANALYSIS_ERROR } }, { status });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = JSON.parse(await readLimitedBody(request));
  } catch {
    return errorResponse("INVALID_URL", 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) return errorResponse("INVALID_URL", 400);
  const payload = body as Record<string, unknown>;
  if (typeof payload.url !== "string" || payload.url.length > 2048) return errorResponse("INVALID_URL", 400);
  if (payload.mode !== undefined && payload.mode !== "advert" && payload.mode !== "instruction") return errorResponse("INVALID_URL", 400);
  if (payload.duration !== undefined && (!Number.isInteger(payload.duration) || ![15, 20, 30, 45, 60, 90, 120, 180].includes(payload.duration as number))) return errorResponse("INVALID_URL", 400);
  if (payload.language !== undefined && (typeof payload.language !== "string" || payload.language.length > 40)) return errorResponse("INVALID_URL", 400);
  const platform = typeof payload.platform === "string" ? payload.platform : "youtube";
  if (!getPlatformPreset(platform)) return errorResponse("INVALID_URL", 400);

  try {
    const result = await analyzeWebsite(payload.url, {
      mode: payload.mode as FilmMode | undefined,
      duration: payload.duration as number | undefined,
      platform,
      language: payload.language as string | undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof WebsiteIngestionError) {
      const status = error.code === "TIMEOUT" ? 504 : error.code === "ACCESS_DENIED" ? 403 : error.code === "UNAVAILABLE" || error.code === "DNS_FAILED" ? 502 : 422;
      return errorResponse(error.code, status);
    }
    return errorResponse("ANALYSIS_ERROR", 500);
  }
}
