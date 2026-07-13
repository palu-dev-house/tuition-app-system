/**
 * Minimal in-memory TTL cache for server-side responses (dashboard stats,
 * reference data). Safe for the current single-instance Railway deploy;
 * swap for Redis if the app ever runs multiple instances.
 */

interface Entry {
  value: unknown;
  expiresAt: number;
}

export class ServerCache {
  private entries = new Map<string, Entry>();

  async getOrSet<T>(
    key: string,
    ttlMs: number,
    fn: () => Promise<T>,
  ): Promise<T> {
    const hit = this.entries.get(key);
    if (hit && hit.expiresAt > Date.now()) {
      return hit.value as T;
    }

    const value = await fn();
    this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  }

  invalidate(key: string): void {
    this.entries.delete(key);
  }

  invalidatePrefix(prefix: string): void {
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }
  }
}

// Shared instance. Survives across requests within one server process; in dev
// Next.js may reload modules, which simply starts with an empty cache.
const globalForCache = globalThis as unknown as {
  serverCache: ServerCache | undefined;
};
export const serverCache = globalForCache.serverCache ?? new ServerCache();
if (process.env.NODE_ENV !== "production") {
  globalForCache.serverCache = serverCache;
}
