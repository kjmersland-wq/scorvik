import "server-only";

import { getAuthStore } from "./store";
import { isPreviewSessionCurrent } from "./auth-service";
import { getPreviewSessionClaims, hasValidAuthSecret, type PreviewEnvironment } from "./session-core";
import type { AuthStore } from "./d1-store";

export async function isCurrentPreviewSessionToken(
  token: string | undefined,
  secret: string | undefined,
  environment: PreviewEnvironment = process.env,
  store?: AuthStore,
): Promise<boolean> {
  if (!hasValidAuthSecret(secret)) return false;
  const claims = await getPreviewSessionClaims(token, secret);
  const email = environment.SCORVIK_PREVIEW_EMAIL?.trim().toLowerCase();
  if (!claims || !email) return false;
  return isPreviewSessionCurrent(claims, store ?? await getAuthStore(), email);
}