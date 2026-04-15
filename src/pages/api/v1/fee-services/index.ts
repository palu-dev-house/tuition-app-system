import type { NextRequest } from "next/server";
import type { FeeServiceCategory, Prisma } from "@/generated/prisma/client";
import { createApiHandler } from "@/lib/api-adapter";
import { requireAuth, requireRole } from "@/lib/api-auth";
import { errorResponse, successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const searchParams = request.nextUrl.searchParams;
  const page = Number(searchParams.get("page") || "1");
  const limit = Number(searchParams.get("limit") || "10");
  const academicYearId = searchParams.get("academicYearId") || undefined;
  const categoryParam = searchParams.get("category");
  const category =
    categoryParam && categoryParam !== "null"
      ? (categoryParam as FeeServiceCategory)
      : undefined;
  const isActiveParam = searchParams.get("isActive");
  const isActive =
    isActiveParam === "true"
      ? true
      : isActiveParam === "false"
        ? false
        : undefined;

  const where: Prisma.FeeServiceWhereInput = {};
  if (academicYearId) where.academicYearId = academicYearId;
  if (category) where.category = category;
  if (isActive !== undefined) where.isActive = isActive;

  const [feeServices, total] = await Promise.all([
    prisma.feeService.findMany({
      where,
      include: {
        academicYear: { select: { id: true, year: true } },
        _count: {
          select: { prices: true, subscriptions: true, bills: true },
        },
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
    prisma.feeService.count({ where }),
  ]);

  return successResponse({
    feeServices,
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
    const { academicYearId, category, name, description, isActive } = body as {
      academicYearId?: string;
      category?: FeeServiceCategory;
      name?: string;
      description?: string | null;
      isActive?: boolean;
    };

    if (!academicYearId || !category || !name) {
      return errorResponse(
        "academicYearId, category, and name are required",
        "VALIDATION_ERROR",
        400,
      );
    }

    if (category !== "TRANSPORT" && category !== "ACCOMMODATION") {
      return errorResponse(
        "category must be TRANSPORT or ACCOMMODATION",
        "VALIDATION_ERROR",
        400,
      );
    }

    const academicYear = await prisma.academicYear.findUnique({
      where: { id: academicYearId },
      select: { id: true },
    });
    if (!academicYear) {
      return errorResponse("Academic year not found", "NOT_FOUND", 404);
    }

    const created = await prisma.feeService.create({
      data: {
        academicYearId,
        category,
        name,
        description: description ?? null,
        isActive: isActive ?? true,
      },
      include: {
        academicYear: { select: { id: true, year: true } },
      },
    });

    return successResponse(created, 201);
  } catch (error) {
    console.error("Create fee service error:", error);
    return errorResponse("Failed to create fee service", "SERVER_ERROR", 500);
  }
}

export default createApiHandler({ GET, POST });
