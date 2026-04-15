import type { NextRequest } from "next/server";
import type { Month, Prisma } from "@/generated/prisma/client";
import { createApiHandler } from "@/lib/api-adapter";
import { requireAuth, requireRole } from "@/lib/api-auth";
import { errorResponse, successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

const VALID_MONTHS: Month[] = [
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
];

function isValidMonthArray(value: unknown): value is Month[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every((v) => VALID_MONTHS.includes(v as Month));
}

async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const searchParams = request.nextUrl.searchParams;
  const page = Number(searchParams.get("page") || "1");
  const limit = Number(searchParams.get("limit") || "10");
  const classAcademicId = searchParams.get("classAcademicId") || undefined;
  const isActiveParam = searchParams.get("isActive");
  const isActive =
    isActiveParam === "true"
      ? true
      : isActiveParam === "false"
        ? false
        : undefined;

  const where: Prisma.ServiceFeeWhereInput = {};
  if (classAcademicId) where.classAcademicId = classAcademicId;
  if (isActive !== undefined) where.isActive = isActive;

  const [serviceFees, total] = await Promise.all([
    prisma.serviceFee.findMany({
      where,
      include: {
        classAcademic: {
          select: {
            id: true,
            className: true,
            grade: true,
            section: true,
            academicYear: { select: { id: true, year: true } },
          },
        },
        _count: { select: { bills: true } },
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ createdAt: "desc" }],
    }),
    prisma.serviceFee.count({ where }),
  ]);

  return successResponse({
    serviceFees,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}

async function POST(request: NextRequest) {
  const auth = await requireRole(request, ["ADMIN"]);
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const { classAcademicId, name, amount, billingMonths, isActive } = body as {
      classAcademicId?: string;
      name?: string;
      amount?: string | number;
      billingMonths?: unknown;
      isActive?: boolean;
    };

    if (!classAcademicId || !name || amount === undefined) {
      return errorResponse(
        "classAcademicId, name, and amount are required",
        "VALIDATION_ERROR",
        400,
      );
    }

    if (!isValidMonthArray(billingMonths)) {
      return errorResponse(
        "billingMonths must be a non-empty array of Month enum values",
        "VALIDATION_ERROR",
        400,
      );
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount < 0) {
      return errorResponse(
        "amount must be a non-negative number",
        "VALIDATION_ERROR",
        400,
      );
    }

    const classAcademic = await prisma.classAcademic.findUnique({
      where: { id: classAcademicId },
      select: { id: true },
    });
    if (!classAcademic) {
      return errorResponse("Class not found", "NOT_FOUND", 404);
    }

    const created = await prisma.serviceFee.create({
      data: {
        classAcademicId,
        name,
        amount: numericAmount,
        billingMonths,
        isActive: isActive ?? true,
      },
      include: {
        classAcademic: {
          select: {
            id: true,
            className: true,
            grade: true,
            section: true,
            academicYear: { select: { id: true, year: true } },
          },
        },
      },
    });

    return successResponse(created, 201);
  } catch (error) {
    console.error("Create service fee error:", error);
    return errorResponse("Failed to create service fee", "SERVER_ERROR", 500);
  }
}

export default createApiHandler({ GET, POST });
