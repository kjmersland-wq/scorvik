import type { Metadata } from "next";
import { PreviewLoginForm } from "@/components/preview-login-form";

export const metadata: Metadata = {
  title: "Private preview",
  description: "Sign in to continue.",
};

export default function LoginPage() {
  return (
    <section className="preview-login" aria-labelledby="preview-login-title">
      <span className="eyebrow">PRIVATE PREVIEW</span>
      <h1 id="preview-login-title">Private preview</h1>
      <p>Sign in to continue.</p>
      <PreviewLoginForm />
    </section>
  );
}