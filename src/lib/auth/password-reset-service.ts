import type { PasswordResetEmailProvider } from "./email-provider.ts";
import type { AuthStore } from "./auth-store.ts";
import { hashPassword } from "./password-hash.ts";
import { previewEmailMatches, type PreviewEnvironment } from "./session-core.ts";
import { createResetToken, hashRateLimitBucket, hashResetToken } from "./reset-token.ts";

export const PASSWORD_RESET_TOKEN_TTL_MS = 20 * 60 * 1000;
export const PASSWORD_RESET_REQUEST_MESSAGE = "If this email belongs to the preview account, we’ll send a secure reset link when email delivery is available.";
export const PASSWORD_RESET_INVALID_MESSAGE = "That reset link has expired or has already been used. Request a new one and we’ll help you get back in.";

export interface PasswordResetRequestResult {
  message: string;
  developmentResetUrl?: string;
}

export interface PasswordResetRequestOptions {
  email: string;
  clientAddress: string;
  origin: string;
  store: AuthStore | null;
  emailProvider: PasswordResetEmailProvider | null;
  dispatchEmail?: (provider: PasswordResetEmailProvider, message: { email: string; resetUrl: string; expiresAt: number } | null) => Promise<void>;
  environment?: PreviewEnvironment;
  now?: number;
}

export async function requestPreviewPasswordReset(options: PasswordResetRequestOptions): Promise<PasswordResetRequestResult> {
  const environment = options.environment ?? process.env;
  const now = options.now ?? Date.now();
  const secret = environment.SCORVIK_AUTH_SECRET;
  if (!secret || !environment.SCORVIK_PREVIEW_EMAIL || !options.store) return { message: PASSWORD_RESET_REQUEST_MESSAGE };

  const email = options.email.trim().toLowerCase();
  const bucket = await hashRateLimitBucket(secret, "password-reset", `${email}:${options.clientAddress}`);
  const allowed = await options.store.consumeRateLimit(bucket, now, 60 * 60 * 1000, 5);
  if (!allowed) return { message: PASSWORD_RESET_REQUEST_MESSAGE };

  const localDevelopment = environment.NODE_ENV === "development";
  const emailMatches = await previewEmailMatches(email, environment);
  if (!options.emailProvider && !localDevelopment) return { message: PASSWORD_RESET_REQUEST_MESSAGE };
  if (!emailMatches && !(options.emailProvider && options.dispatchEmail && !localDevelopment)) return { message: PASSWORD_RESET_REQUEST_MESSAGE };

  if (!emailMatches) {
    await options.dispatchEmail!(options.emailProvider!, null);
    return { message: PASSWORD_RESET_REQUEST_MESSAGE };
  }

  const { token, tokenHash } = await createResetToken();
  const expiresAt = now + PASSWORD_RESET_TOKEN_TTL_MS;
  const currentCredential = await options.store.getCredential(email);
  await options.store.createResetToken(crypto.randomUUID(), email, tokenHash, currentCredential?.session_version ?? 0, now, expiresAt);
  const resetUrl = new URL(`/reset-password?token=${encodeURIComponent(token)}`, options.origin).toString();

  if (options.emailProvider) {
    try {
      const message = { email, resetUrl, expiresAt };
      if (options.dispatchEmail) await options.dispatchEmail(options.emailProvider, message);
      else await options.emailProvider.sendPasswordResetEmail(message);
    } catch {
      return { message: PASSWORD_RESET_REQUEST_MESSAGE };
    }
  }

  return {
    message: PASSWORD_RESET_REQUEST_MESSAGE,
    ...(localDevelopment ? { developmentResetUrl: resetUrl } : {}),
  };
}

export interface ApplyPasswordResetOptions {
  token: string;
  password: string;
  confirmation: string;
  clientAddress: string;
  store: AuthStore | null;
  email: string;
  environment?: PreviewEnvironment;
  now?: number;
}

export async function applyPreviewPasswordReset(options: ApplyPasswordResetOptions): Promise<boolean> {
  const environment = options.environment ?? process.env;
  const now = options.now ?? Date.now();
  const secret = environment.SCORVIK_AUTH_SECRET;
  if (!secret || !options.email || !options.store || options.password !== options.confirmation) return false;
  if (options.password.length < 12 || new TextEncoder().encode(options.password).byteLength > 1024) return false;
  if (!/^[A-Za-z0-9_-]{43}$/.test(options.token)) return false;

  const tokenHash = await hashResetToken(options.token);
  const bucket = await hashRateLimitBucket(secret, "password-reset-apply", `${tokenHash}:${options.clientAddress}`);
  if (!await options.store.consumeRateLimit(bucket, now, 15 * 60 * 1000, 10)) return false;
  if (!await options.store.isResetTokenUsable(options.email, tokenHash, now)) return false;
  const passwordHash = await hashPassword(options.password);
  return options.store.consumeResetToken(options.email, tokenHash, passwordHash, now);
}