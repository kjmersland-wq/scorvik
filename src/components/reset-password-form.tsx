"use client";

import { useActionState } from "react";
import Link from "next/link";
import { changePreviewPassword, type PasswordResetState } from "@/app/auth-actions";

const initialState: PasswordResetState = {};

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(changePreviewPassword, initialState);

  if (state.changed) {
    return <div className="preview-reset-success" role="status">
      <p>Your password has been updated.</p>
      <Link className="button" href="/login">Sign in →</Link>
    </div>;
  }

  return (
    <form className="preview-login-form" action={formAction}>
      <input type="hidden" name="token" value={token} />
      <label>
        <span>New password</span>
        <input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={1024} />
      </label>
      <label>
        <span>Confirm new password</span>
        <input name="confirmation" type="password" autoComplete="new-password" required minLength={12} maxLength={1024} />
      </label>
      <p className="preview-password-hint">Use at least 12 characters.</p>
      {state.error && <p className="preview-login-error" role="alert">{state.error}</p>}
      <button className="button" type="submit" disabled={pending}>
        {pending ? "Updating…" : "Change password →"}
      </button>
    </form>
  );
}