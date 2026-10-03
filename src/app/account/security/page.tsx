import type { Metadata } from "next";
import { ChangePasswordForm } from "@/components/change-password-form";

export const metadata: Metadata = {
  title: "Password security",
  description: "Update your private preview password.",
};

export default function AccountSecurityPage() {
  return (
    <div className="create-page info-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Your account</span>
          <h1>Password security</h1>
          <p>Choose a new password. We’ll sign you out everywhere when it’s changed.</p>
        </div>
      </div>
      <section className="panel panel-pad preview-password-panel">
        <ChangePasswordForm />
      </section>
    </div>
  );
}