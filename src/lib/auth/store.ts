import "server-only";

import { NeonAuthStore } from "./neon-store";
import type { AuthStore } from "./auth-store";
import { MemoryAuthStore } from "./memory-store";

let developmentStore: MemoryAuthStore | undefined;

export async function getAuthStore(): Promise<AuthStore | null> {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString) return new NeonAuthStore(connectionString);
  if (process.env.NODE_ENV === "production") return null;
  developmentStore ??= new MemoryAuthStore();
  return developmentStore;
}