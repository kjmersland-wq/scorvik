import type { AuthCredential, AuthStore } from "./auth-store";

interface ResetTokenRecord {
  id: string;
  email: string;
  tokenHash: string;
  sessionVersion: number;
  expiresAt: number;
  usedAt: number | null;
}

interface RateBucket {
  startedAt: number;
  attempts: number;
}

export class MemoryAuthStore implements AuthStore {
  private credential: AuthCredential | null = null;
  private readonly resetTokens = new Map<string, ResetTokenRecord>();
  private readonly rateBuckets = new Map<string, RateBucket>();

  async getCredential(email: string): Promise<AuthCredential | null> {
    return this.credential?.email === email ? { ...this.credential } : null;
  }

  async consumeRateLimit(bucketHash: string, now: number, windowMs: number, maxAttempts: number): Promise<boolean> {
    const bucket = this.rateBuckets.get(bucketHash);
    if (!bucket || bucket.startedAt <= now - windowMs) {
      this.rateBuckets.set(bucketHash, { startedAt: now, attempts: 1 });
      return true;
    }
    bucket.attempts += 1;
    return bucket.attempts <= maxAttempts;
  }

  async createResetToken(id: string, email: string, tokenHash: string, sessionVersion: number, _createdAt: number, expiresAt: number): Promise<void> {
    for (const [key, value] of this.resetTokens) if (value.email === email && value.usedAt === null) this.resetTokens.delete(key);
    this.resetTokens.set(tokenHash, { id, email, tokenHash, sessionVersion, expiresAt, usedAt: null });
  }
  async isResetTokenUsable(email: string, tokenHash: string, now: number): Promise<boolean> {
    const token = this.resetTokens.get(tokenHash);
    return Boolean(token && token.email === email && token.usedAt === null && token.expiresAt > now && token.sessionVersion === (this.credential?.session_version ?? 0));
  }

  async consumeResetToken(email: string, tokenHash: string, passwordHash: string, now: number): Promise<boolean> {
    const token = this.resetTokens.get(tokenHash);
    if (!token || token.email !== email || token.usedAt !== null || token.expiresAt <= now || token.sessionVersion !== (this.credential?.session_version ?? 0)) return false;
    token.usedAt = now;
    if (this.credential && this.credential.email !== email) return false;
    this.credential = {
      email,
      password_hash: passwordHash,
      session_version: (this.credential?.session_version ?? 0) + 1,
    };
    for (const [key, value] of this.resetTokens) if (value.email === email && value.usedAt === null) this.resetTokens.delete(key);
    return true;
  }

  async updatePassword(email: string, passwordHash: string): Promise<number | null> {
    if (this.credential && this.credential.email !== email) return null;
    this.credential = { email, password_hash: passwordHash, session_version: (this.credential?.session_version ?? 0) + 1 };
    return this.credential.session_version;
  }
}