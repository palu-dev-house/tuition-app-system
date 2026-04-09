import type { NextRequest } from "next/server";
import type { PaymentRequestStatus } from "@/generated/prisma/client";
import { errorResponse, successResponse } from "@/lib/api-response";
import {
  createPaymentRequest,
  listPaymentRequests,
} from "@/lib/business-logic/payment-request";
import {
  generateIdempotencyKey,
  withIdempotency,
} from "@/lib/middleware/idempotency";
import {
  checkRateLimit,
  rateLimitErrorResponse,
} from "@/lib/middleware/rate-limit";
import { getStudentSessionFromRequest } from "@/lib/student-auth";

export async function GET(request: NextRequest) {
  try {
    const session = await getStudentSessionFromRequest(request);
    if (!session) {
      return errorResponse("Unauthorized", "UNAUTHORIZED", 401);
    }

    const { searchParams } = new URL(request.url);
    const page = Number.parseInt(searchParams.get("page") || "1", 10);
    const limit = Number.parseInt(searchParams.get("limit") || "10", 10);
    const status = searchParams.get("status") as PaymentRequestStatus | null;

    const result = await listPaymentRequests({
      studentNis: session.studentNis,
      status: status || undefined,
      page,
      limit,
    });

    return successResponse(result);
  } catch (error) {
    console.error("List payment requests error:", error);
    return errorResponse("Internal server error", "SERVER_ERROR", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getStudentSessionFromRequest(request);
    if (!session) {
      return errorResponse("Unauthorized", "UNAUTHORIZED", 401);
    }

    const body = await request.json();
    const { tuitionIds } = body;

    if (!tuitionIds || !Array.isArray(tuitionIds) || tuitionIds.length === 0) {
      return errorResponse(
        "tuitionIds harus berupa array dan tidak boleh kosong",
        "VALIDATION_ERROR",
        400,
      );
    }

    // Check rate limit (3 per minute per user)
    const rateLimitResult = await checkRateLimit(
      "paymentRequest",
      session.studentNis,
    );
    if (!rateLimitResult.success) {
      return await rateLimitErrorResponse(rateLimitResult, request);
    }

    // Get idempotency key from header or generate from payload
    const idempotencyKey =
      request.headers.get("X-Idempotency-Key") ||
      generateIdempotencyKey(session.studentNis, "CREATE_PAYMENT_REQUEST", {
        tuitionIds: tuitionIds.sort().join(","),
      });

    // Execute with idempotency check
    const { isDuplicate, result } = await withIdempotency(
      idempotencyKey,
      async () => {
        return createPaymentRequest({
          studentNis: session.studentNis,
          tuitionIds,
          idempotencyKey,
        });
      },
    );

    // Return 200 for duplicate, 201 for new
    return successResponse(result, isDuplicate ? 200 : 201);
  } catch (error) {
    console.error("Create payment request error:", error);
    if (error instanceof Error) {
      return errorResponse(error.message, "VALIDATION_ERROR", 400);
    }
    return errorResponse("Internal server error", "SERVER_ERROR", 500);
  }
}
