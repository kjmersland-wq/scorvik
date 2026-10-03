import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

export const metadata: Metadata = {
  title: "Forgot your password?",
  description: "Get back into your private preview.",
};

export default function ForgotPasswordPage() {
  return (
    <section className="preview-login" aria-labelledby="forgot-password-title">
      <span className="eyebrow">PRIVATE PREVIEW</span>
      <h1 id="forgot-password-title">Forgot your password?</h1>
      <p>No problem. We’ll help you get back in.</p>
      <ForgotPasswordForm />
      <Link className="preview-login-back" href="/login">Back to sign in</Link>
    </section>
  );
}