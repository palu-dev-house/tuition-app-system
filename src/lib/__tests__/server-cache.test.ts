import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServerCache } from "../server-cache";

describe("ServerCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns cached value within TTL and recomputes after expiry", async () => {
    const cache = new ServerCache();
    let calls = 0;
    const fn = async () => {
      calls++;
      return calls;
    };

    expect(await cache.getOrSet("k", 1000, fn)).toBe(1);
    expect(await cache.getOrSet("k", 1000, fn)).toBe(1); // cached

    vi.advanceTimersByTime(1001);
    expect(await cache.getOrSet("k", 1000, fn)).toBe(2); // recomputed
  });

  it("invalidate removes a single key", async () => {
    const cache = new ServerCache();
    await cache.getOrSet("a", 60000, async () => "first");
    cache.invalidate("a");
    expect(await cache.getOrSet("a", 60000, async () => "second")).toBe(
      "second",
    );
  });

  it("invalidatePrefix removes all matching keys", async () => {
    const cache = new ServerCache();
    await cache.getOrSet("dash:stats", 60000, async () => 1);
    await cache.getOrSet("dash:recent", 60000, async () => 2);
    await cache.getOrSet("other", 60000, async () => 3);

    cache.invalidatePrefix("dash:");

    let recomputed = 0;
    await cache.getOrSet("dash:stats", 60000, async () => ++recomputed);
    await cache.getOrSet("dash:recent", 60000, async () => ++recomputed);
    expect(recomputed).toBe(2);
    expect(await cache.getOrSet("other", 60000, async () => 99)).toBe(3);
  });

  it("does not cache rejected promises", async () => {
    const cache = new ServerCache();
    await expect(
      cache.getOrSet("k", 60000, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(await cache.getOrSet("k", 60000, async () => "ok")).toBe("ok");
  });
});
