export const PREVIEW_SESSION_COOKIE = "scorvik-preview-session";
export const PREVIEW_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
const PREVIEW_SESSION_MAX_AGE_MS = PREVIEW_SESSION_MAX_AGE_SECONDS * 1000;
const SESSION_CONTEXT_V1 = "scorvik-private-preview:v1:";
const SESSION_CONTEXT_V2 = "scorvik-private-preview:v2:";

export type PreviewEnvironment = Record<string, string | undefined>;
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

export async function previewPasswordMatches(password: string, environment: PreviewEnvironment = process.env): Promise<boolean> {
  const expectedPassword = environment.SCORVIK_PREVIEW_PASSWORD ?? "";
  return Boolean(expectedPassword && hasValidAuthSecret(environment.SCORVIK_AUTH_SECRET) && await fixedTimeEqual(password, expectedPassword));
}

export function hasValidAuthSecret(secret: string | undefined): secret is string {
  return Boolean(secret && textEncoder.encode(secret).byteLength >= 32);
}

export async function previewEmailMatches(email: string, environment: PreviewEnvironment = process.env): Promise<boolean> {
  const expectedEmail = environment.SCORVIK_PREVIEW_EMAIL ?? "";
  return Boolean(expectedEmail && await fixedTimeEqual(email.trim().toLowerCase(), expectedEmail.trim().toLowerCase()));
}

export async function previewCredentialsMatch(
  email: string,
  password: string,
  environment: PreviewEnvironment = process.env,
): Promise<boolean> {
  const expectedEmail = environment.SCORVIK_PREVIEW_EMAIL ?? "";
  const expectedPassword = environment.SCORVIK_PREVIEW_PASSWORD ?? "";
  const [emailMatches, passwordMatches] = await Promise.all([
    previewEmailMatches(email, environment),
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

export interface PreviewSessionClaims {
  expiresAt: number;
  sessionVersion: number;
}

export async function createPreviewSessionToken(secret: string, sessionVersion = 0, now = Date.now()): Promise<string> {
  if (!hasValidAuthSecret(secret)) throw new Error("A preview auth secret of at least 32 bytes is required.");
  if (!Number.isSafeInteger(sessionVersion) || sessionVersion < 0) throw new Error("Session version must be a non-negative integer.");
  const expiresAt = now + PREVIEW_SESSION_MAX_AGE_MS;
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), textEncoder.encode(`${SESSION_CONTEXT_V2}${expiresAt}:${sessionVersion}`));
  return `${expiresAt}.${sessionVersion}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function getPreviewSessionClaims(token: string | undefined, secret: string | undefined, now = Date.now()): Promise<PreviewSessionClaims | null> {
  if (!token || !hasValidAuthSecret(secret)) return null;
  const parts = token.split(".");
  const isLegacy = parts.length === 2;
  if (!isLegacy && parts.length !== 3) return null;
  const expiresAt = Number(parts[0]);
  const sessionVersion = isLegacy ? 0 : Number(parts[1]);
  const encodedSignature = parts[isLegacy ? 1 : 2];
  if (!/^\d{13}$/.test(parts[0]) || !Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + PREVIEW_SESSION_MAX_AGE_MS) return null;
  if (!Number.isSafeInteger(sessionVersion) || sessionVersion < 0 || !/^[A-Za-z0-9_-]{43}$/.test(encodedSignature)) return null;
  const signature = fromBase64Url(encodedSignature);
  if (!signature || signature.length !== 32 || toBase64Url(signature) !== encodedSignature) return null;
  const signatureBuffer = new ArrayBuffer(signature.length);
  new Uint8Array(signatureBuffer).set(signature);
  const payload = isLegacy ? `${SESSION_CONTEXT_V1}${expiresAt}` : `${SESSION_CONTEXT_V2}${expiresAt}:${sessionVersion}`;
  const valid = await crypto.subtle.verify("HMAC", await hmacKey(secret), signatureBuffer, textEncoder.encode(payload));
  return valid ? { expiresAt, sessionVersion } : null;
}

export async function isPreviewSessionTokenValid(token: string | undefined, secret: string | undefined, now = Date.now()): Promise<boolean> {
  return (await getPreviewSessionClaims(token, secret, now)) !== null;
}

export function requiresPreviewAuthentication(_pathname: string): boolean {
  return false;
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