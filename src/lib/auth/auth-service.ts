import type { AuthStore } from "./auth-store.ts";
import { verifyPassword } from "./password-hash.ts";
import { hasValidAuthSecret, previewCredentialsMatch, previewEmailMatches, type PreviewEnvironment, type PreviewSessionClaims } from "./session-core.ts";

export interface AuthenticatedPreviewUser {
  email: string;
  sessionVersion: number;
}

export async function authenticatePreviewUser(
  email: string,
  password: string,
  store: AuthStore | null,
  environment: PreviewEnvironment = process.env,
): Promise<AuthenticatedPreviewUser | null> {
  if (!hasValidAuthSecret(environment.SCORVIK_AUTH_SECRET) || !await previewEmailMatches(email, environment)) return null;
  const configuredEmail = environment.SCORVIK_PREVIEW_EMAIL!.trim().toLowerCase();
  const credential = store ? await store.getCredential(configuredEmail) : null;

  if (credential) {
    return await verifyPassword(password, credential.password_hash)
      ? { email: configuredEmail, sessionVersion: credential.session_version }
      : null;
  }

  return await previewCredentialsMatch(email, password, environment)
    ? { email: configuredEmail, sessionVersion: 0 }
    : null;
}

export async function isPreviewSessionCurrent(
  claims: PreviewSessionClaims,
  store: AuthStore | null,
  email: string,
): Promise<boolean> {
  if (!store) return claims.sessionVersion === 0;
  const credential = await store.getCredential(email.trim().toLowerCase());
  return claims.sessionVersion === (credential?.session_version ?? 0);
}