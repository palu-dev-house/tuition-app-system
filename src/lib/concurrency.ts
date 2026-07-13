/**
 * Map over items with at most `limit` handlers in flight.
 * Results preserve input order. The pg pool holds 10 connections, so
 * DB-heavy batch work should stay below that.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}
