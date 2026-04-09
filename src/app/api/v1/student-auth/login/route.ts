import type { NextRequest } from "next/server";
import { errorResponse, successResponse } from "@/lib/api-response";
import { loginStudent } from "@/lib/business-logic/student-account";
import {
  checkRateLimit,
  rateLimitErrorResponse,
} from "@/lib/middleware/rate-limit";
import { signStudentToken } from "@/lib/student-auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { nis, password } = body;

    if (!nis || !password) {
      return errorResponse(
        "NIS dan password harus diisi",
        "VALIDATION_ERROR",
        400,
      );
    }

    // Check rate limit (3 attempts per minute per NIS)
    const rateLimitResult = await checkRateLimit("login", nis);
    if (!rateLimitResult.success) {
      return await rateLimitErrorResponse(rateLimitResult, request);
    }

    const result = await loginStudent({ nis, password });

    if (!result.success || !result.student) {
      return errorResponse(result.error || "Login gagal", "UNAUTHORIZED", 401);
    }

    const token = await signStudentToken({
      studentNis: result.student.nis,
      studentName: result.student.name,
    });

    const response = successResponse({
      message: "Login berhasil",
      mustChangePassword: result.student.mustChangePassword,
      user: {
        studentNis: result.student.nis,
        studentName: result.student.name,
      },
    });

    response.headers.set(
      "Set-Cookie",
      `student-token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${24 * 60 * 60}`,
    );

    return response;
  } catch (error) {
    console.error("Student login error:", error);
    return errorResponse("Internal server error", "SERVER_ERROR", 500);
  }
}
