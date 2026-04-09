const pendingRequests = new Map<string, Promise<Response>>();
const MAX_TTL = 5_000;

/**
 * Deduplicates identical concurrent GET requests.
 * If the same key is already in-flight, returns the same response.
 */
export async function withDedup(
  key: string,
  handler: () => Promise<Response>,
): Promise<Response> {
  const existing = pendingRequests.get(key);
  if (existing) {
    const response = await existing;
    return response.clone();
  }

  const promise = handler().finally(() => {
    pendingRequests.delete(key);
  });

  pendingRequests.set(key, promise);

  // Safety: auto-cleanup after TTL in case handler never resolves
  setTimeout(() => {
    pendingRequests.delete(key);
  }, MAX_TTL);

  return promise;
}

/**
 * Generate dedup key from request URL + search params
 */
export function getDedupKey(request: Request): string {
  const url = new URL(request.url);
  return `${url.pathname}${url.search}`;
}
