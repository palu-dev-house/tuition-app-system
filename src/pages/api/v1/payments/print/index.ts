import type { NextRequest } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { createApiHandler } from "@/lib/api-adapter";
import { requireAuth } from "@/lib/api-auth";
import { successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const searchParams = request.nextUrl.searchParams;
  const academicYearId = searchParams.get("academicYearId");
  const mode = searchParams.get("mode") || "today"; // "today" | "all" | "student"
  const studentNis = searchParams.get("studentNis");

  const where: Prisma.PaymentWhereInput = {};
  const andClauses: Prisma.PaymentWhereInput[] = [];

  // Student filter (reprint of lost slip) — match via any of the three FKs.
  if (mode === "student" && studentNis) {
    andClauses.push({
      OR: [
        { tuition: { studentNis } },
        { feeBill: { studentNis } },
        { serviceFeeBill: { studentNis } },
      ],
    });
  }

  // Academic-year filter — may combine with student filter.
  if (academicYearId) {
    andClauses.push({
      OR: [
        { tuition: { classAcademic: { academicYearId } } },
        { feeBill: { feeService: { academicYearId } } },
        { serviceFeeBill: { classAcademic: { academicYearId } } },
      ],
    });
  }

  // Filter for today only (not applicable in student mode).
  if (mode === "today") {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    where.paymentDate = { gte: todayStart, lte: todayEnd };
  }

  if (andClauses.length > 0) {
    where.AND = andClauses;
  }

  const payments = await prisma.payment.findMany({
    where,
    include: {
      tuition: {
        include: {
          student: {
            select: { nis: true, name: true, parentName: true },
          },
          classAcademic: {
            select: {
              className: true,
              academicYear: { select: { year: true } },
            },
          },
        },
      },
      feeBill: {
        include: {
          feeService: {
            select: {
              id: true,
              name: true,
              category: true,
              academicYear: { select: { year: true } },
            },
          },
          student: {
            select: { nis: true, name: true, parentName: true },
          },
        },
      },
      serviceFeeBill: {
        include: {
          serviceFee: { select: { id: true, name: true } },
          student: {
            select: { nis: true, name: true, parentName: true },
          },
          classAcademic: {
            select: {
              className: true,
              academicYear: { select: { year: true } },
            },
          },
        },
      },
      employee: { select: { name: true } },
    },
    orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }],
  });

  return successResponse({ payments });
}

export default createApiHandler({ GET });
