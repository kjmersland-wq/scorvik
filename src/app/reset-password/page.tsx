import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/reset-password-form";

export const metadata: Metadata = {
  title: "Set a new password",
  description: "Choose a new password for your private preview.",
};

export default async function ResetPasswordPage({ searchParams }: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" && params.token.length <= 128 ? params.token : "";

  return (
    <section className="preview-login" aria-labelledby="reset-password-title">
      <span className="eyebrow">PRIVATE PREVIEW</span>
      <h1 id="reset-password-title">Set a new password</h1>
      <p>Choose a new password to keep your preview secure.</p>
      <ResetPasswordForm token={token} />
      <Link className="preview-login-back" href="/login">Back to sign in</Link>
    </section>
  );
}