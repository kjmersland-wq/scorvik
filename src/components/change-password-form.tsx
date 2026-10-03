"use client";

import { useActionState } from "react";
import { changeAuthenticatedPreviewPassword, type ChangePasswordState } from "@/app/auth-actions";

const initialState: ChangePasswordState = {};

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changeAuthenticatedPreviewPassword, initialState);

  return (
    <form className="preview-login-form" action={formAction}>
      <label>
        <span>Current password</span>
        <input name="currentPassword" type="password" autoComplete="current-password" required maxLength={1024} />
      </label>
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