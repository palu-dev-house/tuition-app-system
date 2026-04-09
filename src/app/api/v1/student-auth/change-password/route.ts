import type { NextRequest } from "next/server";
import { errorResponse, successResponse } from "@/lib/api-response";
import { changePassword } from "@/lib/business-logic/student-account";
import {
  checkRateLimit,
  rateLimitErrorResponse,
} from "@/lib/middleware/rate-limit";
import { getStudentSessionFromRequest } from "@/lib/student-auth";

export async function POST(request: NextRequest) {
  try {
    const session = await getStudentSessionFromRequest(request);
    if (!session) {
      return errorResponse("Unauthorized", "UNAUTHORIZED", 401);
    }

    // Check rate limit (3 per minute)
    const rateLimitResult = await checkRateLimit(
      "changePassword",
      session.studentNis,
    );
    if (!rateLimitResult.success) {
      return await rateLimitErrorResponse(rateLimitResult, request);
    }

    const body = await request.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return errorResponse(
        "Password lama dan baru harus diisi",
        "VALIDATION_ERROR",
        400,
      );
    }

    await changePassword({
      studentNis: session.studentNis,
      currentPassword,
      newPassword,
    });

    return successResponse({ message: "Password berhasil diubah" });
  } catch (error) {
    console.error("Change password error:", error);
    if (error instanceof Error) {
      return errorResponse(error.message, "VALIDATION_ERROR", 400);
    }
    return errorResponse("Internal server error", "SERVER_ERROR", 500);
  }
}
