"use server";

import { cookies } from "next/headers";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  createPreviewSessionToken,
  hasValidAuthSecret,
  PREVIEW_SESSION_COOKIE,
  previewSessionCookieOptions,
} from "@/lib/auth/session-core";
import { authenticatePreviewUser } from "@/lib/auth/auth-service";
import { getAuthStore } from "@/lib/auth/store";
import { dispatchPasswordResetEmail, getPasswordResetEmailProvider } from "@/lib/auth/email-provider";
import { applyPreviewPasswordReset, PASSWORD_RESET_INVALID_MESSAGE, requestPreviewPasswordReset } from "@/lib/auth/password-reset-service";
import { hashRateLimitBucket } from "@/lib/auth/reset-token";

export interface SignInState {
  error?: string;
}

export interface PasswordResetRequestState {
  message?: string;
  developmentResetUrl?: string;
}

export interface PasswordResetState {
  error?: string;
  changed?: boolean;
}

const loginError = "That login didn’t work. Please check your details and try again.";

export async function signIn(_previousState: SignInState, formData: FormData): Promise<SignInState> {
  const email = formData.get("email");
  const password = formData.get("password");
  if (typeof email !== "string" || typeof password !== "string" || email.length > 254 || password.length > 1024) {
    return { error: loginError };
  }

  let signedIn = false;
  try {
    const secret = process.env.SCORVIK_AUTH_SECRET;
    if (!hasValidAuthSecret(secret)) return { error: loginError };
    const store = await getAuthStore();
    const requestHeaders = await headers();
    const address = requestHeaders.get("cf-connecting-ip") ?? "local";
    const bucket = await hashRateLimitBucket(secret, "login", `${email.trim().toLowerCase()}:${address}`);
    if (!await store.consumeRateLimit(bucket, Date.now(), 15 * 60 * 1000, 10)) return { error: loginError };
    const user = await authenticatePreviewUser(email, password, store);
    if (!user) return { error: loginError };

    const token = await createPreviewSessionToken(secret, user.sessionVersion);
    const cookieStore = await cookies();
    cookieStore.set(PREVIEW_SESSION_COOKIE, token, previewSessionCookieOptions());
    signedIn = true;
  } catch {
    return { error: loginError };
  }
  if (signedIn) redirect("/");
  return { error: loginError };
}

export async function signOut(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(PREVIEW_SESSION_COOKIE, "", {
    ...previewSessionCookieOptions(),
    maxAge: 0,
    expires: new Date(0),
  });
  redirect("/login");
}

export async function requestPasswordReset(
  _previousState: PasswordResetRequestState,
  formData: FormData,
): Promise<PasswordResetRequestState> {
  const message = "If this email belongs to the preview account, we’ll send a secure reset link when email delivery is available.";
  const email = formData.get("email");
  if (typeof email !== "string" || email.length > 254) return { message };

  try {
    const store = await getAuthStore();
    const requestHeaders = await headers();
    const address = requestHeaders.get("cf-connecting-ip") ?? "local";
    const origin = process.env.NODE_ENV === "production"
      ? "https://www.scorvik.com"
      : safeLocalOrigin(requestHeaders.get("origin"));
    return await requestPreviewPasswordReset({
      email,
      clientAddress: address,
      origin,
      store,
      emailProvider: getPasswordResetEmailProvider(),
      dispatchEmail: dispatchPasswordResetEmail,
    });
  } catch {
    return { message };
  }
}

export async function changePreviewPassword(
  _previousState: PasswordResetState,
  formData: FormData,
): Promise<PasswordResetState> {
  const token = formData.get("token");
  const password = formData.get("password");
  const confirmation = formData.get("confirmation");
  if (typeof token !== "string" || token.length > 128 || typeof password !== "string" || typeof confirmation !== "string") {
    return { error: PASSWORD_RESET_INVALID_MESSAGE };
  }
  if (password !== confirmation) return { error: "Those passwords don’t match. Please try again." };
  if (password.length < 12 || password.length > 1024) return { error: "Use at least 12 characters for your new password." };

  try {
    const store = await getAuthStore();
    const requestHeaders = await headers();
    const address = requestHeaders.get("cf-connecting-ip") ?? "local";
    const changed = await applyPreviewPasswordReset({
      token,
      password,
      confirmation,
      clientAddress: address,
      store,
      email: process.env.SCORVIK_PREVIEW_EMAIL?.trim().toLowerCase() ?? "",
    });
    return changed ? { changed: true } : { error: PASSWORD_RESET_INVALID_MESSAGE };
  } catch {
    return { error: PASSWORD_RESET_INVALID_MESSAGE };
  }
}

function safeLocalOrigin(origin: string | null): string {
  if (!origin) return "http://localhost:3000";
  try {
    const parsed = new URL(origin);
    if (parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")) return parsed.origin;
  } catch {
    return "http://localhost:3000";
  }
  return "http://localhost:3000";
}