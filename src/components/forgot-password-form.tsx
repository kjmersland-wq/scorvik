"use client";

import { useActionState } from "react";
import { requestPasswordReset, type PasswordResetRequestState } from "@/app/auth-actions";

const initialState: PasswordResetRequestState = {};

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState);

  return (
    <form className="preview-login-form" action={formAction}>
      <label>
        <span>Email</span>
        <input name="email" type="email" autoComplete="username" autoCapitalize="none" required maxLength={254} />
      </label>
      {state.message && <p className="preview-login-notice" role="status">{state.message}</p>}
      {state.developmentResetUrl && <div className="preview-dev-reset"><a href={state.developmentResetUrl}>Open your reset link →</a><small>For local development only.</small></div>}
      <button className="button" type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send reset link →"}
      </button>
    </form>
  );
}