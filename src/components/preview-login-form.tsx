"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn, type SignInState } from "@/app/auth-actions";

const initialState: SignInState = {};

export function PreviewLoginForm() {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <form className="preview-login-form" action={formAction}>
      <label>
        <span>Email</span>
        <input name="email" type="email" autoComplete="username" autoCapitalize="none" required maxLength={254} />
      </label>
      <label>
        <span>Password</span>
        <input name="password" type="password" autoComplete="current-password" required maxLength={1024} />
      </label>
      <Link className="preview-login-forgot" href="/forgot-password">Forgot your password?</Link>
      {state.error && <p className="preview-login-error" role="alert">{state.error}</p>}
      <button className="button" type="submit" disabled={pending}>
        {pending ? "Signing you in…" : "Sign in →"}
      </button>
    </form>
  );
}