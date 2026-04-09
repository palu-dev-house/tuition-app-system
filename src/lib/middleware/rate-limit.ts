import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { RATE_LIMITS } from "@/lib/config/rate-limit-config";
import { getServerT } from "@/lib/i18n-server";
import {
  checkRateLimit,
  type RateLimitResult,
} from "@/lib/services/rate-limit-service";

/**
 * Rate limit error response with i18n
 */
export async function rateLimitErrorResponse(
  result: RateLimitResult,
  request: NextRequest,
) {
  const t = await getServerT(request);
  const retryAfter = Math.ceil((result.reset.getTime() - Date.now()) / 1000);

  return NextResponse.json(
    {
      success: false,
      error: {
        message: t("api.rateLimitExceeded", { seconds: retryAfter }),
        code: "RATE_LIMIT_EXCEEDED",
        retryAfter,
      },
    },
    {
      status: 429,
      headers: {
        "X-RateLimit-Limit": result.limit.toString(),
        "X-RateLimit-Remaining": result.remaining.toString(),
        "X-RateLimit-Reset": result.reset.toISOString(),
        "Retry-After": retryAfter.toString(),
      },
    },
  );
}

/**
 * Create a response with rate limit headers
 */
export function withRateLimitHeaders<T>(
  data: T,
  result: RateLimitResult,
  status: number = 200,
) {
  return NextResponse.json(
    { success: true, data },
    {
      status,
      headers: {
        "X-RateLimit-Limit": result.limit.toString(),
        "X-RateLimit-Remaining": result.remaining.toString(),
        "X-RateLimit-Reset": result.reset.toISOString(),
      },
    },
  );
}

/**
 * Get client IP from request
 */
export function getClientIP(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0] ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

// Re-export for convenience
export { checkRateLimit, RATE_LIMITS };
export type { RateLimitResult };
