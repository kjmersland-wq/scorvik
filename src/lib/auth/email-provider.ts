import "server-only";

export interface PasswordResetEmail {
  email: string;
  resetUrl: string;
  expiresAt: number;
}

export interface PasswordResetEmailProvider {
  sendPasswordResetEmail(message: PasswordResetEmail): Promise<void>;
}

export async function dispatchPasswordResetEmail(
  provider: PasswordResetEmailProvider,
  message: PasswordResetEmail | null,
): Promise<void> {
  if (message) await provider.sendPasswordResetEmail(message);
}

export function getPasswordResetEmailProvider(): PasswordResetEmailProvider | null {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.SCORVIK_EMAIL_FROM;
  if (!apiKey || !from) return null;

  return {
    async sendPasswordResetEmail({ email, resetUrl, expiresAt }) {
      const expiryLabel = new Date(expiresAt).toUTCString();
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [email],
          subject: "Your Scorvik password reset link",
          text: `Use this secure link to reset your Scorvik preview password: ${resetUrl}\n\nThe link expires at ${expiryLabel} and can only be used once. If you didn’t request this, you can ignore this email.`,
        }),
      });
      if (!response.ok) throw new Error("Password reset email delivery failed.");
    },
  };
}