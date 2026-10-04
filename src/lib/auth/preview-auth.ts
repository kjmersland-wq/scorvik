import "server-only";

import { getAuthStore } from "./store";
import { isPreviewSessionCurrent } from "./auth-service";
import { getPreviewSessionClaims, hasValidAuthSecret, type PreviewEnvironment } from "./session-core";
import type { AuthStore } from "./auth-store";

export async function isCurrentPreviewSessionToken(
  token: string | undefined,
  secret: string | undefined,
  environment: PreviewEnvironment = process.env,
  store?: AuthStore | null,
): Promise<boolean> {
  if (!hasValidAuthSecret(secret)) return false;
  const claims = await getPreviewSessionClaims(token, secret);
  if (!claims) return false;
  const email = environment.SCORVIK_PREVIEW_EMAIL?.trim().toLowerCase();
  if (!email) return claims.sessionVersion === 0;
  return isPreviewSessionCurrent(claims, store === undefined ? await getAuthStore() : store, email);
}