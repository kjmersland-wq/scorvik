export interface AuthCredential {
  email: string;
  password_hash: string;
  session_version: number;
}

export interface AuthStore {
  getCredential(email: string): Promise<AuthCredential | null>;
  consumeRateLimit(bucketHash: string, now: number, windowMs: number, maxAttempts: number): Promise<boolean>;
  createResetToken(id: string, email: string, tokenHash: string, sessionVersion: number, createdAt: number, expiresAt: number): Promise<void>;
  isResetTokenUsable(email: string, tokenHash: string, now: number): Promise<boolean>;
  consumeResetToken(email: string, tokenHash: string, passwordHash: string, now: number): Promise<boolean>;
  updatePassword(email: string, passwordHash: string, now: number): Promise<number | null>;
}
