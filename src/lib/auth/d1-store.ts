import "server-only";

import type { AuthD1Database } from "./cloudflare-d1";

export interface AuthCredential {
  email: string;
  password_hash: string;
  session_version: number;
}

export interface AuthStore {
  getCredential(email: string): Promise<AuthCredential | null>;
  consumeRateLimit(bucketHash: string, now: number, windowMs: number, maxAttempts: number): Promise<boolean>;
  createResetToken(id: string, email: string, tokenHash: string, createdAt: number, expiresAt: number): Promise<void>;
  isResetTokenUsable(email: string, tokenHash: string, now: number): Promise<boolean>;
  consumeResetToken(email: string, tokenHash: string, passwordHash: string, now: number): Promise<boolean>;
}

export class D1AuthStore implements AuthStore {
  constructor(private readonly db: AuthD1Database) {}

  getCredential(email: string): Promise<AuthCredential | null> {
    return this.db.prepare(
      "SELECT email, password_hash, session_version FROM auth_credentials WHERE id = 1 AND email = ? LIMIT 1",
    ).bind(email).first<AuthCredential>();
  }

  async consumeRateLimit(bucketHash: string, now: number, windowMs: number, maxAttempts: number): Promise<boolean> {
    const result = await this.db.prepare(`
      INSERT INTO auth_rate_limits (bucket_hash, window_started_at, attempts)
      VALUES (?, ?, 1)
      ON CONFLICT(bucket_hash) DO UPDATE SET
        attempts = CASE WHEN auth_rate_limits.window_started_at <= ? THEN 1 ELSE auth_rate_limits.attempts + 1 END,
        window_started_at = CASE WHEN auth_rate_limits.window_started_at <= ? THEN excluded.window_started_at ELSE auth_rate_limits.window_started_at END
      RETURNING attempts
    `).bind(bucketHash, now, now - windowMs, now - windowMs).first<{ attempts: number }>();
    await this.db.prepare("DELETE FROM auth_rate_limits WHERE window_started_at < ?").bind(now - 24 * 60 * 60 * 1000).run();
    return Boolean(result && result.attempts <= maxAttempts);
  }

  async createResetToken(id: string, email: string, tokenHash: string, createdAt: number, expiresAt: number): Promise<void> {
    await this.db.batch([
      this.db.prepare("DELETE FROM password_reset_tokens WHERE email = ? AND used_at IS NULL").bind(email),
      this.db.prepare("INSERT INTO password_reset_tokens (id, email, token_hash, expires_at, used_at, created_at) VALUES (?, ?, ?, ?, NULL, ?)")
        .bind(id, email, tokenHash, expiresAt, createdAt),
    ]);
  }
  async isResetTokenUsable(email: string, tokenHash: string, now: number): Promise<boolean> {
    const row = await this.db.prepare(`
      SELECT 1 AS valid
      FROM password_reset_tokens
      WHERE token_hash = ? AND email = ? AND used_at IS NULL AND expires_at > ?
      LIMIT 1
    `).bind(tokenHash, email, now).first<{ valid: number }>();
    return row?.valid === 1;
  }

  async consumeResetToken(email: string, tokenHash: string, passwordHash: string, now: number): Promise<boolean> {
    const results = await this.db.batch([
      this.db.prepare("UPDATE password_reset_tokens SET used_at = ? WHERE token_hash = ? AND email = ? AND used_at IS NULL AND expires_at > ?")
        .bind(now, tokenHash, email, now),
      this.db.prepare(`
        INSERT INTO auth_credentials (id, email, password_hash, session_version, created_at, updated_at)
        SELECT 1, ?, ?, 1, ?, ? WHERE changes() = 1
        ON CONFLICT(id) DO UPDATE SET
          password_hash = excluded.password_hash,
          session_version = auth_credentials.session_version + 1,
          updated_at = excluded.updated_at
        WHERE auth_credentials.email = excluded.email
      `).bind(email, passwordHash, now, now),
      this.db.prepare("DELETE FROM password_reset_tokens WHERE email = ? AND used_at IS NULL").bind(email),
    ]);
    return results[0]?.meta?.changes === 1 && results[1]?.meta?.changes === 1;
  }
}
