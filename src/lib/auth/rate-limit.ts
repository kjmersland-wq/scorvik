import type { AuthStore } from "./auth-store";

interface RateBucket {
  windowStartedAt: number;
  attempts: number;
}

const localBuckets = new Map<string, RateBucket>();

export async function consumeAuthRateLimit(
  store: AuthStore | null,
  bucketHash: string,
  now: number,
  windowMs: number,
  maxAttempts: number,
): Promise<boolean> {
  if (store) return store.consumeRateLimit(bucketHash, now, windowMs, maxAttempts);
  const existing = localBuckets.get(bucketHash);
  if (!existing || existing.windowStartedAt <= now - windowMs) {
    localBuckets.set(bucketHash, { windowStartedAt: now, attempts: 1 });
    return true;
  }
  existing.attempts += 1;
  return existing.attempts <= maxAttempts;
}
