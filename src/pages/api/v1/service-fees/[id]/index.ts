import type { NextRequest } from "next/server";
import type { Month } from "@/generated/prisma/client";
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

async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const { id } = await params;

  const serviceFee = await prisma.serviceFee.findUnique({
    where: { id },
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
  });

  if (!serviceFee) {
    return errorResponse("Service fee not found", "NOT_FOUND", 404);
  }

  return successResponse(serviceFee);
}

async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(request, ["ADMIN"]);
  if (auth instanceof Response) return auth;

  const { id } = await params;

  try {
    const existing = await prisma.serviceFee.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse("Service fee not found", "NOT_FOUND", 404);
    }

    const body = await request.json();
    const { name, amount, billingMonths, isActive } = body as {
      name?: string;
      amount?: string | number;
      billingMonths?: unknown;
      isActive?: boolean;
    };

    const data: Record<string, unknown> = {};

    if (name !== undefined) data.name = name;

    if (amount !== undefined) {
      const numericAmount = Number(amount);
      if (!Number.isFinite(numericAmount) || numericAmount < 0) {
        return errorResponse(
          "amount must be a non-negative number",
          "VALIDATION_ERROR",
          400,
        );
      }
      data.amount = numericAmount;
    }

    if (billingMonths !== undefined) {
      if (!isValidMonthArray(billingMonths)) {
        return errorResponse(
          "billingMonths must be a non-empty array of Month enum values",
          "VALIDATION_ERROR",
          400,
        );
      }
      data.billingMonths = billingMonths;
    }

    if (isActive !== undefined) data.isActive = isActive;

    const updated = await prisma.serviceFee.update({
      where: { id },
      data,
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

    return successResponse(updated);
  } catch (error) {
    console.error("Update service fee error:", error);
    return errorResponse("Failed to update service fee", "SERVER_ERROR", 500);
  }
}

async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(request, ["ADMIN"]);
  if (auth instanceof Response) return auth;

  const { id } = await params;

  try {
    const serviceFee = await prisma.serviceFee.findUnique({
      where: { id },
      include: { _count: { select: { bills: true } } },
    });

    if (!serviceFee) {
      return errorResponse("Service fee not found", "NOT_FOUND", 404);
    }

    if (serviceFee._count.bills > 0) {
      return errorResponse(
        "Cannot delete service fee with existing bills. Set isActive=false instead.",
        "CONFLICT",
        409,
      );
    }

    await prisma.serviceFee.delete({ where: { id } });

    return successResponse({ message: "Service fee deleted" });
  } catch (error) {
    console.error("Delete service fee error:", error);
    return errorResponse("Failed to delete service fee", "SERVER_ERROR", 500);
  }
}

export default createApiHandler({ GET, PATCH, DELETE });
