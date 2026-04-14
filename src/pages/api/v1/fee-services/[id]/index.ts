import type { NextRequest } from "next/server";
import { createApiHandler } from "@/lib/api-adapter";
import { requireAuth, requireRole } from "@/lib/api-auth";
import { errorResponse, successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const { id } = await params;

  const feeService = await prisma.feeService.findUnique({
    where: { id },
    include: {
      academicYear: { select: { id: true, year: true } },
      prices: {
        orderBy: { effectiveFrom: "desc" },
      },
      _count: { select: { bills: true, subscriptions: true } },
    },
  });

  if (!feeService) {
    return errorResponse("Fee service not found", "NOT_FOUND", 404);
  }

  const now = new Date();
  const activeSubscriptionCount = await prisma.feeSubscription.count({
    where: {
      feeServiceId: id,
      OR: [{ endDate: null }, { endDate: { gte: now } }],
    },
  });

  return successResponse({ ...feeService, activeSubscriptionCount });
}

async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(request, ["ADMIN"]);
  if (auth instanceof Response) return auth;

  const { id } = await params;

  try {
    const existing = await prisma.feeService.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse("Fee service not found", "NOT_FOUND", 404);
    }

    const body = await request.json();
    const { name, description, isActive } = body as {
      name?: string;
      description?: string | null;
      isActive?: boolean;
    };

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (isActive !== undefined) data.isActive = isActive;

    const updated = await prisma.feeService.update({
      where: { id },
      data,
      include: {
        academicYear: { select: { id: true, year: true } },
      },
    });

    return successResponse(updated);
  } catch (error) {
    console.error("Update fee service error:", error);
    return errorResponse("Failed to update fee service", "SERVER_ERROR", 500);
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
    const feeService = await prisma.feeService.findUnique({
      where: { id },
      include: { _count: { select: { bills: true } } },
    });

    if (!feeService) {
      return errorResponse("Fee service not found", "NOT_FOUND", 404);
    }

    if (feeService._count.bills > 0) {
      return errorResponse(
        "Cannot delete fee service with existing bills. Set isActive=false instead.",
        "CONFLICT",
        409,
      );
    }

    await prisma.feeService.delete({ where: { id } });

    return successResponse({ message: "Fee service deleted" });
  } catch (error) {
    console.error("Delete fee service error:", error);
    return errorResponse("Failed to delete fee service", "SERVER_ERROR", 500);
  }
}

export default createApiHandler({ GET, PATCH, DELETE });
