import type { NextRequest } from "next/server";
import { createApiHandler } from "@/lib/api-adapter";
import { requireAuth } from "@/lib/api-auth";
import { errorResponse, successResponse } from "@/lib/api-response";
import { getServerT } from "@/lib/i18n-server";
import { prisma } from "@/lib/prisma";
import { serverCache } from "@/lib/server-cache";

const STATS_CACHE_KEY = "dashboard:stats";
const STATS_TTL_MS = 30_000;

async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const t = await getServerT(request);
  try {
    const stats = await serverCache.getOrSet(
      STATS_CACHE_KEY,
      STATS_TTL_MS,
      computeStats,
    );
    return successResponse(stats, 200, "private, max-age=30");
  } catch (error) {
    console.error("Dashboard stats error:", error);
    return errorResponse(t("api.internalError"), "SERVER_ERROR", 500);
  }
}

async function computeStats() {
  {
    // Get active academic year (the remaining queries scope to it)
    const activeYear = await prisma.academicYear.findFirst({
      where: { isActive: true },
    });

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const yearScope = activeYear
      ? { classAcademic: { academicYearId: activeYear.id } }
      : {};

    // Independent aggregates run in parallel
    const [
      totalStudents,
      totalEmployees,
      monthlyPayments,
      overdueTuitions,
      outstandingData,
      tuitionStats,
      recentPayments,
    ] = await Promise.all([
      prisma.student.count(),
      prisma.employee.count(),
      prisma.payment.aggregate({
        _sum: { amount: true },
        _count: true,
        where: {
          paymentDate: {
            gte: startOfMonth,
            lte: endOfMonth,
          },
        },
      }),
      prisma.tuition.count({
        where: {
          status: { in: ["UNPAID", "PARTIAL"] },
          dueDate: { lt: now },
          ...yearScope,
        },
      }),
      prisma.tuition.aggregate({
        _sum: { feeAmount: true, scholarshipAmount: true, paidAmount: true },
        where: {
          status: { in: ["UNPAID", "PARTIAL"] },
          ...yearScope,
        },
      }),
      activeYear
        ? prisma.tuition.groupBy({
            by: ["status"],
            _count: true,
            where: { classAcademic: { academicYearId: activeYear.id } },
          })
        : Promise.resolve([]),
      prisma.payment.findMany({
        take: 5,
        orderBy: { paymentDate: "desc" },
        include: {
          tuition: {
            include: {
              student: { select: { name: true, nis: true } },
              classAcademic: { select: { className: true } },
              discount: {
                select: { name: true, reason: true, description: true },
              },
            },
          },
          employee: { select: { name: true } },
        },
      }),
    ]);

    const totalFees = Number(outstandingData._sum.feeAmount || 0);
    const totalScholarships = Number(
      outstandingData._sum.scholarshipAmount || 0,
    );
    const totalPaid = Number(outstandingData._sum.paidAmount || 0);
    const totalOutstanding = Math.max(
      totalFees - totalScholarships - totalPaid,
      0,
    );

    const paidCount =
      tuitionStats.find((s) => s.status === "PAID")?._count || 0;
    const unpaidCount =
      tuitionStats.find((s) => s.status === "UNPAID")?._count || 0;
    const partialCount =
      tuitionStats.find((s) => s.status === "PARTIAL")?._count || 0;

    return {
      totalStudents,
      totalEmployees,
      activeAcademicYear: activeYear?.year || null,
      monthlyRevenue: Number(monthlyPayments._sum.amount || 0),
      monthlyPaymentsCount: monthlyPayments._count,
      overdueTuitions,
      totalOutstanding,
      tuitionStats: {
        paid: paidCount,
        unpaid: unpaidCount,
        partial: partialCount,
        total: paidCount + unpaidCount + partialCount,
      },
      recentPayments: recentPayments
        .filter((p) => p.tuition !== null)
        .map((p) => {
          const tuition = p.tuition as NonNullable<typeof p.tuition>;
          return {
            id: p.id,
            amount: Number(p.amount),
            paymentDate: p.paymentDate,
            studentName: tuition.student.name,
            studentId: tuition.student.nis,
            className: tuition.classAcademic.className,
            processedBy: p.employee?.name ?? "Online Payment",
            scholarshipAmount: tuition.scholarshipAmount,
            discountAmount: tuition.discountAmount,
            discount: tuition.discount,
          };
        }),
    };
  }
}

export default createApiHandler({ GET });
