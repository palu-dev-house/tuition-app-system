import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "../concurrency";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("mapWithConcurrency", () => {
  it("maps all items preserving input order", async () => {
    const result = await mapWithConcurrency([3, 1, 2], 2, async (n) => {
      await sleep(n * 5);
      return n * 10;
    });
    expect(result).toEqual([30, 10, 20]);
  });

  it("never runs more than the limit at once", async () => {
    let running = 0;
    let peak = 0;
    await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async () => {
      running++;
      peak = Math.max(peak, running);
      await sleep(10);
      running--;
    });
    expect(peak).toBe(2);
  });

  it("propagates errors", async () => {
    await expect(
      mapWithConcurrency([1, 2], 2, async (n) => {
        if (n === 2) throw new Error("boom");
        return n;
      }),
    ).rejects.toThrow("boom");
  });

  it("handles empty input", async () => {
    expect(await mapWithConcurrency([], 3, async (n) => n)).toEqual([]);
  });
});
