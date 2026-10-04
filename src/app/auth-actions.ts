"use server";

import { cookies } from "next/headers";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  createPreviewSessionToken,
  hasValidAuthSecret,
  previewCredentialsMatch,
  PREVIEW_SESSION_COOKIE,
  previewSessionCookieOptions,
} from "@/lib/auth/session-core";
import { authenticatePreviewUser } from "@/lib/auth/auth-service";
import { hashPassword } from "@/lib/auth/password-hash";
import { consumeAuthRateLimit } from "@/lib/auth/rate-limit";
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

export interface ChangePasswordState {
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
    const address = getClientAddress(requestHeaders);
    const bucket = await hashRateLimitBucket(secret, "login", `${email.trim().toLowerCase()}:${address}`);
    if (!await consumeAuthRateLimit(store, bucket, Date.now(), 15 * 60 * 1000, 10)) return { error: loginError };
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

export async function signInWithPreviewPassword(_previousState: SignInState, formData: FormData): Promise<SignInState> {
  const password = formData.get("password");
  const locale = formData.get("locale") === "no" ? "no" : "en";
  const fallbackPath = locale === "no" ? "/no/create" : "/create";
  const returnPath = safeAuthReturnPath(formData.get("next"), fallbackPath);
  const error = locale === "no" ? "Det passordet gikk ikke. Prøv igjen." : "That didn’t work. Please try again.";
  if (typeof password !== "string" || !password || password.length > 1024) return { error };

  try {
    const secret = process.env.SCORVIK_AUTH_SECRET;
    const email = process.env.SCORVIK_PREVIEW_EMAIL?.trim().toLowerCase();
    if (!email || !hasValidAuthSecret(secret) || !await previewCredentialsMatch(email, password)) return { error };

    const store = await getAuthStore();
    const requestHeaders = await headers();
    const address = getClientAddress(requestHeaders);
    const bucket = await hashRateLimitBucket(secret, "anonymous-preview-login", `${email}:${address}`);
    if (!await consumeAuthRateLimit(store, bucket, Date.now(), 15 * 60 * 1000, 10)) return { error };

    const credential = store && email ? await store.getCredential(email) : null;
    const token = await createPreviewSessionToken(secret, credential?.session_version ?? 0);
    const cookieStore = await cookies();
    cookieStore.set(PREVIEW_SESSION_COOKIE, token, previewSessionCookieOptions());
  } catch {
    return { error };
  }

  redirect(returnPath);
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
    const emailProvider = getPasswordResetEmailProvider();
    if (!store) return { message: "Password reset isn’t set up on this deployment yet. Please contact the preview owner." };
    if (process.env.NODE_ENV === "production" && !emailProvider) {
      return { message: "Password reset email isn’t configured yet. Please contact the preview owner." };
    }
    const requestHeaders = await headers();
    const address = getClientAddress(requestHeaders);
    const origin = getApplicationOrigin(requestHeaders.get("origin"));
    return await requestPreviewPasswordReset({
      email,
      clientAddress: address,
      origin,
      store,
      emailProvider,
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
    const address = getClientAddress(requestHeaders);
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

export async function changeAuthenticatedPreviewPassword(
  _previousState: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const currentPassword = formData.get("currentPassword");
  const password = formData.get("password");
  const confirmation = formData.get("confirmation");
  if (typeof currentPassword !== "string" || typeof password !== "string" || typeof confirmation !== "string") {
    return { error: "Please check the password fields and try again." };
  }
  if (password !== confirmation) return { error: "Those passwords don’t match. Please try again." };
  if (password.length < 12 || password.length > 1024) return { error: "Use at least 12 characters for your new password." };

  let changed = false;
  try {
    const email = process.env.SCORVIK_PREVIEW_EMAIL?.trim().toLowerCase();
    const store = await getAuthStore();
    if (!email || !store) return { error: "Password changes aren’t available on this deployment yet." };
    const requestHeaders = await headers();
    const address = getClientAddress(requestHeaders);
    const secret = process.env.SCORVIK_AUTH_SECRET;
    if (!hasValidAuthSecret(secret)) return { error: "Password changes aren’t available on this deployment yet." };
    const bucket = await hashRateLimitBucket(secret, "change-password", `${email}:${address}`);
    if (!await consumeAuthRateLimit(store, bucket, Date.now(), 15 * 60 * 1000, 5)) {
      return { error: "Please wait a little before trying again." };
    }
    if (!await authenticatePreviewUser(email, currentPassword, store)) {
      return { error: "Your current password didn’t match. Please try again." };
    }
    const updatedVersion = await store.updatePassword(email, await hashPassword(password), Date.now());
    if (updatedVersion === null) return { error: "We couldn’t update your password just now. Please try again." };
    changed = true;
  } catch {
    return { error: "We couldn’t update your password just now. Please try again." };
  }

  if (changed) {
    const cookieStore = await cookies();
    cookieStore.set(PREVIEW_SESSION_COOKIE, "", { ...previewSessionCookieOptions(), maxAge: 0, expires: new Date(0) });
    redirect("/login?password=changed");
  }
  return { error: "We couldn’t update your password just now. Please try again." };
}

function getClientAddress(requestHeaders: Headers): string {
  return requestHeaders.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
    ?? requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "local";
}

function getApplicationOrigin(origin: string | null): string {
  const configured = process.env.SCORVIK_APP_URL
    ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined)
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);
  if (configured) {
    try {
      const parsed = new URL(configured);
      if (parsed.protocol === "https:" || (process.env.NODE_ENV !== "production" && parsed.protocol === "http:")) return parsed.origin;
    } catch {
      return "http://localhost:3000";
    }
  }
  return safeLocalOrigin(origin);
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

function safeAuthReturnPath(value: FormDataEntryValue | null, fallback: string): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return fallback;
  try {
    const target = new URL(value, "https://scorvik.invalid");
    if (target.origin !== "https://scorvik.invalid" || target.pathname === "/login") return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}