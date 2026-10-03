import "server-only";

import { getAuthDatabase } from "./cloudflare-d1";
import { D1AuthStore, type AuthStore } from "./d1-store";
import { MemoryAuthStore } from "./memory-store";

let developmentStore: MemoryAuthStore | undefined;

export async function getAuthStore(): Promise<AuthStore> {
  const database = await getAuthDatabase();
  if (database) return new D1AuthStore(database);
  if (process.env.NODE_ENV === "production") throw new Error("The Cloudflare D1 binding DB is required in production.");
  developmentStore ??= new MemoryAuthStore();
  return developmentStore;
}