// Licensed music never sits in public/: it lives in private/music and is only streamed to signed-in users.
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

export const musicDirectory = path.join(process.cwd(), "private", "music");

/** Plain file names only: no folders, no dots at the start, .mp3 at the end. Spaces and brackets are refused on purpose. */
export function safeMusicFile(name: string): string | null {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,150}\.mp3$/.test(name) && !name.includes("..") ? name : null;
}

/** Parses a single-range "bytes=start-end" header; null for none or an unusable one. */
export function parseRange(header: string | null, size: number): { start: number; end: number } | "invalid" | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) return "invalid";
  let start: number;
  let end: number;
  if (match[1] === "") { const tail = Number(match[2]); start = Math.max(0, size - tail); end = size - 1; }
  else { start = Number(match[1]); end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1); }
  return start > end || start >= size ? "invalid" : { start, end };
}

export async function streamMusic(name: string, rangeHeader: string | null): Promise<Response> {
  const file = safeMusicFile(name);
  if (!file) return new Response("Not found", { status: 404 });
  const full = path.join(musicDirectory, file);
  let size: number;
  try { size = (await stat(full)).size; } catch { return streamFromStorage(file, rangeHeader); }
  const headers: Record<string, string> = {
    "content-type": "audio/mpeg",
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=3600",
    "content-disposition": "inline",
    "x-content-type-options": "nosniff",
  };
  const range = parseRange(rangeHeader, size);
  if (range === "invalid") return new Response(null, { status: 416, headers: { ...headers, "content-range": `bytes */${size}` } });
  const { start, end } = range ?? { start: 0, end: size - 1 };
  const body = Readable.toWeb(createReadStream(full, { start, end })) as unknown as ReadableStream;
  return new Response(body, {
    status: range ? 206 : 200,
    headers: { ...headers, "content-length": String(end - start + 1), ...(range ? { "content-range": `bytes ${start}-${end}/${size}` } : {}) },
  });
}

/**
 * On a deployed copy the files are not in the repository. When MUSIC_SOURCE_URL points at private storage (optionally with
 * MUSIC_SOURCE_TOKEN as a bearer token), the same route fetches the file from there and passes it on, so the storage itself
 * never has to be public.
 */
async function streamFromStorage(file: string, rangeHeader: string | null): Promise<Response> {
  const base = process.env.MUSIC_SOURCE_URL?.replace(/\/+$/, "");
  if (!base || !/^https:\/\//.test(base)) return new Response("Not found", { status: 404 });
  const token = process.env.MUSIC_SOURCE_TOKEN;
  const upstream = await fetch(`${base}/${encodeURIComponent(file)}`, {
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(rangeHeader ? { range: rangeHeader } : {}) },
    signal: AbortSignal.timeout(20_000),
  }).catch(() => undefined);
  if (!upstream || !(upstream.ok || upstream.status === 206) || !upstream.body) return new Response("Not found", { status: 404 });
  const headers = new Headers({ "content-type": "audio/mpeg", "accept-ranges": "bytes", "cache-control": "private, max-age=3600", "content-disposition": "inline", "x-content-type-options": "nosniff" });
  for (const name of ["content-length", "content-range"]) { const value = upstream.headers.get(name); if (value) headers.set(name, value); }
  return new Response(upstream.body, { status: upstream.status, headers });
}
