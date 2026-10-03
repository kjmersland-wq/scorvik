const textEncoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function createResetToken(): Promise<{ token: string; tokenHash: string }> {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = toBase64Url(tokenBytes);
  const tokenHash = new Uint8Array(await crypto.subtle.digest("SHA-256", textEncoder.encode(token)));
  return { token, tokenHash: toBase64Url(tokenHash) };
}

export async function hashResetToken(token: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", textEncoder.encode(token)));
  return toBase64Url(digest);
}

export async function hashRateLimitBucket(secret: string, scope: string, clientAddress: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", textEncoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, textEncoder.encode(`${scope}:${clientAddress}`)));
  return toBase64Url(digest);
}