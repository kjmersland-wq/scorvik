export const PREVIEW_SESSION_COOKIE = "scorvik-preview-session";
export const PREVIEW_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
const PREVIEW_SESSION_MAX_AGE_MS = PREVIEW_SESSION_MAX_AGE_SECONDS * 1000;
const SESSION_CONTEXT = "scorvik-private-preview:v1:";

type PreviewEnvironment = Record<string, string | undefined>;
const textEncoder = new TextEncoder();

async function fixedTimeEqual(left: string, right: string): Promise<boolean> {
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", textEncoder.encode(left)),
    crypto.subtle.digest("SHA-256", textEncoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftDigest);
  const rightBytes = new Uint8Array(rightDigest);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) difference |= leftBytes[index] ^ rightBytes[index];
  return difference === 0;
}

export function hasPreviewCredentials(environment: PreviewEnvironment = process.env): boolean {
  return Boolean(environment.SCORVIK_PREVIEW_EMAIL && environment.SCORVIK_PREVIEW_PASSWORD && hasValidAuthSecret(environment.SCORVIK_AUTH_SECRET));
}

export function hasValidAuthSecret(secret: string | undefined): secret is string {
  return Boolean(secret && textEncoder.encode(secret).byteLength >= 32);
}

export async function previewCredentialsMatch(
  email: string,
  password: string,
  environment: PreviewEnvironment = process.env,
): Promise<boolean> {
  const expectedEmail = environment.SCORVIK_PREVIEW_EMAIL ?? "";
  const expectedPassword = environment.SCORVIK_PREVIEW_PASSWORD ?? "";
  const [emailMatches, passwordMatches] = await Promise.all([
    fixedTimeEqual(email.trim().toLowerCase(), expectedEmail.trim().toLowerCase()),
    fixedTimeEqual(password, expectedPassword),
  ]);
  return Boolean(expectedEmail && expectedPassword && hasValidAuthSecret(environment.SCORVIK_AUTH_SECRET) && emailMatches && passwordMatches);
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", textEncoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array | null {
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64 + "=".repeat((4 - base64.length % 4) % 4));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

export async function createPreviewSessionToken(secret: string, now = Date.now()): Promise<string> {
  if (!hasValidAuthSecret(secret)) throw new Error("A preview auth secret of at least 32 bytes is required.");
  const expiresAt = now + PREVIEW_SESSION_MAX_AGE_MS;
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), textEncoder.encode(`${SESSION_CONTEXT}${expiresAt}`));
  return `${expiresAt}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function isPreviewSessionTokenValid(token: string | undefined, secret: string | undefined, now = Date.now()): Promise<boolean> {
  if (!token || !hasValidAuthSecret(secret)) return false;
  const match = /^(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return false;
  const expiresAt = Number(match[1]);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + PREVIEW_SESSION_MAX_AGE_MS) return false;
  const signature = fromBase64Url(match[2]);
  if (!signature || signature.length !== 32 || toBase64Url(signature) !== match[2]) return false;
  const signatureBuffer = new ArrayBuffer(signature.length);
  new Uint8Array(signatureBuffer).set(signature);
  return crypto.subtle.verify("HMAC", await hmacKey(secret), signatureBuffer, textEncoder.encode(`${SESSION_CONTEXT}${expiresAt}`));
}

export function requiresPreviewAuthentication(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (path === "/login") return false;
  if (path.startsWith("/_next/")) return false;
  if (path === "/api" || path.startsWith("/api/")) return true;
  if (path === "/favicon.ico") return false;
  if (/\.(?:svg|png|jpe?g|gif|webp|ico|woff2?|ttf|otf)$/i.test(path)) return false;
  return true;
}

export function previewSessionCookieOptions(production = process.env.NODE_ENV === "production") {
  return {
    httpOnly: true,
    secure: production,
    sameSite: "lax" as const,
    path: "/",
    maxAge: PREVIEW_SESSION_MAX_AGE_SECONDS,
    priority: "high" as const,
  };
}