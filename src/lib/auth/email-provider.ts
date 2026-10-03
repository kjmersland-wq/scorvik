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
  if (process.env.NODE_ENV !== "production") {
    if (message) await provider.sendPasswordResetEmail(message);
    return;
  }

  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const { ctx } = await getCloudflareContext({ async: true });
  const delivery = message ? provider.sendPasswordResetEmail(message) : Promise.resolve();
  ctx.waitUntil(delivery.catch(() => undefined));
}

export function getPasswordResetEmailProvider(): PasswordResetEmailProvider | null {
  return null;
}