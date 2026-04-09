/**
 * Cleanup Cron Jobs
 * Run these in a server environment (not serverless)
 * For serverless, use Supabase pg_cron or Edge Functions
 */

import cron from "node-cron";
import { deactivateExpiredIdempotencyRecords } from "@/lib/middleware/idempotency";
import { prisma } from "@/lib/prisma";
import { deactivateExpiredRateLimits } from "@/lib/services/rate-limit-service";

/**
 * Deactivate expired idempotency records
 * Runs every hour
 */
cron.schedule("0 * * * *", async () => {
  try {
    const count = await deactivateExpiredIdempotencyRecords();
    if (count > 0) {
      console.log(`[Idempotency] Deactivated ${count} expired records`);
    }
  } catch (error) {
    console.error("[Idempotency] Deactivation error:", error);
  }
});

/**
 * Deactivate expired rate limit records
 * Runs every 5 minutes
 */
cron.schedule("*/5 * * * *", async () => {
  try {
    const count = await deactivateExpiredRateLimits();
    if (count > 0) {
      console.log(`[Rate Limit] Deactivated ${count} expired records`);
    }
  } catch (error) {
    console.error("[Rate Limit] Deactivation error:", error);
  }
});

/**
 * Hard delete very old INACTIVE records
 * Runs weekly (Sunday 3 AM)
 * Keeps last 30 days for audit trail
 */
cron.schedule("0 3 * * 0", async () => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Clean old INACTIVE idempotency records
    const idempotencyResult = await prisma.idempotencyRecord.deleteMany({
      where: {
        status: "INACTIVE",
        updatedAt: { lt: thirtyDaysAgo },
      },
    });

    // Clean old INACTIVE rate limit records
    const rateLimitResult = await prisma.rateLimitRecord.deleteMany({
      where: {
        status: "INACTIVE",
        updatedAt: { lt: thirtyDaysAgo },
      },
    });

    console.log(
      `[Weekly Cleanup] Removed ${idempotencyResult.count} old idempotency records`,
    );
    console.log(
      `[Weekly Cleanup] Removed ${rateLimitResult.count} old rate limit records`,
    );
  } catch (error) {
    console.error("[Weekly Cleanup] Error:", error);
  }
});

console.log("[Cron Jobs] Cleanup jobs scheduled");
