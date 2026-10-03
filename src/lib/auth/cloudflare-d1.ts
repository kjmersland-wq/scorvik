import "server-only";

export interface D1Result {
  success: boolean;
  meta?: { changes?: number };
}

export interface D1PreparedStatement {
  bind(...values: Array<string | number | null>): D1PreparedStatement;
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>;
  run(): Promise<D1Result>;
}

export interface AuthD1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}

declare global {
  interface CloudflareEnv {
    DB?: AuthD1Database;
  }
}

export async function getAuthDatabase(): Promise<AuthD1Database | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    return env.DB ?? null;
  } catch {
    if (process.env.NODE_ENV === "production") {
      throw new Error("The Cloudflare D1 binding DB is unavailable.");
    }
    return null;
  }
}