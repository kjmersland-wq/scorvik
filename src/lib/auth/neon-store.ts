import "server-only";

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type { AuthCredential, AuthStore } from "./auth-store";

type NeonSql = NeonQueryFunction<false, false>;

export class NeonAuthStore implements AuthStore {
  private readonly sql: NeonSql;

  constructor(connectionString: string) {
    this.sql = neon<false, false>(connectionString);
  }

  async getCredential(email: string): Promise<AuthCredential | null> {
    const rows = await this.sql`
      SELECT email, password_hash, session_version
      FROM auth_credentials WHERE id = 1 AND email = ${email} LIMIT 1
    `;
    return (rows[0] as AuthCredential | undefined) ?? null;
  }

  async consumeRateLimit(bucketHash: string, now: number, windowMs: number, maxAttempts: number): Promise<boolean> {
    const rows = await this.sql`
      INSERT INTO auth_rate_limits (bucket_hash, window_started_at, attempts)
      VALUES (${bucketHash}, ${now}, 1)
      ON CONFLICT (bucket_hash) DO UPDATE SET
        attempts = CASE WHEN auth_rate_limits.window_started_at <= ${now - windowMs}
          THEN 1 ELSE auth_rate_limits.attempts + 1 END,
        window_started_at = CASE WHEN auth_rate_limits.window_started_at <= ${now - windowMs}
          THEN EXCLUDED.window_started_at ELSE auth_rate_limits.window_started_at END
      RETURNING attempts
    `;
    await this.sql`DELETE FROM auth_rate_limits WHERE window_started_at < ${now - 24 * 60 * 60 * 1000}`;
    return Number((rows[0] as { attempts?: number } | undefined)?.attempts ?? 0) <= maxAttempts;
  }

  async createResetToken(id: string, email: string, tokenHash: string, sessionVersion: number, createdAt: number, expiresAt: number): Promise<void> {
    await this.sql.transaction([
      this.sql`DELETE FROM password_reset_tokens WHERE email = ${email} AND used_at IS NULL`,
      this.sql`
        INSERT INTO password_reset_tokens (id, email, token_hash, session_version, expires_at, used_at, created_at)
        VALUES (${id}, ${email}, ${tokenHash}, ${sessionVersion}, ${expiresAt}, NULL, ${createdAt})
      `,
    ]);
  }

  async isResetTokenUsable(email: string, tokenHash: string, now: number): Promise<boolean> {
    const rows = await this.sql`
      SELECT 1 AS valid FROM password_reset_tokens
      WHERE token_hash = ${tokenHash} AND email = ${email} AND used_at IS NULL AND expires_at > ${now}
        AND session_version = COALESCE((SELECT session_version FROM auth_credentials WHERE id = 1 AND email = ${email}), 0)
      LIMIT 1
    `;
    return rows.length === 1;
  }

  async consumeResetToken(email: string, tokenHash: string, passwordHash: string, now: number): Promise<boolean> {
    const rows = await this.sql`
      WITH consumed AS (
        UPDATE password_reset_tokens
        SET used_at = ${now}
        WHERE token_hash = ${tokenHash} AND email = ${email} AND used_at IS NULL AND expires_at > ${now}
          AND session_version = COALESCE((SELECT session_version FROM auth_credentials WHERE id = 1 AND email = ${email}), 0)
        RETURNING email
      ), saved AS (
        INSERT INTO auth_credentials (id, email, password_hash, session_version, created_at, updated_at)
        SELECT 1, ${email}, ${passwordHash}, 1, ${now}, ${now} FROM consumed
        ON CONFLICT (id) DO UPDATE SET
          password_hash = EXCLUDED.password_hash,
          session_version = auth_credentials.session_version + 1,
          updated_at = EXCLUDED.updated_at
        WHERE auth_credentials.email = EXCLUDED.email
        RETURNING session_version
      )
      SELECT session_version FROM saved
    `;
    if (rows.length !== 1) return false;
    await this.sql`UPDATE password_reset_tokens SET used_at = ${now} WHERE email = ${email} AND used_at IS NULL`;
    return true;
  }

  async updatePassword(email: string, passwordHash: string, now: number): Promise<number | null> {
    const rows = await this.sql`
      INSERT INTO auth_credentials (id, email, password_hash, session_version, created_at, updated_at)
      VALUES (1, ${email}, ${passwordHash}, 1, ${now}, ${now})
      ON CONFLICT (id) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        session_version = auth_credentials.session_version + 1,
        updated_at = EXCLUDED.updated_at
      WHERE auth_credentials.email = EXCLUDED.email
      RETURNING session_version
    `;
    const version = (rows[0] as { session_version?: number } | undefined)?.session_version;
    return version === undefined ? null : Number(version);
  }
}
