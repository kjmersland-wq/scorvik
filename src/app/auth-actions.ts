"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  createPreviewSessionToken,
  previewCredentialsMatch,
  PREVIEW_SESSION_COOKIE,
  previewSessionCookieOptions,
} from "@/lib/auth/session-core";

export interface SignInState {
  error?: string;
}

const loginError = "That login didn’t work. Please check your details and try again.";

export async function signIn(_previousState: SignInState, formData: FormData): Promise<SignInState> {
  const email = formData.get("email");
  const password = formData.get("password");
  if (typeof email !== "string" || typeof password !== "string" || email.length > 254 || password.length > 1024) {
    return { error: loginError };
  }

  if (!await previewCredentialsMatch(email, password)) return { error: loginError };
  const secret = process.env.SCORVIK_AUTH_SECRET;
  if (!secret) return { error: loginError };

  const token = await createPreviewSessionToken(secret);
  const cookieStore = await cookies();
  cookieStore.set(PREVIEW_SESSION_COOKIE, token, previewSessionCookieOptions());
  redirect("/");
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