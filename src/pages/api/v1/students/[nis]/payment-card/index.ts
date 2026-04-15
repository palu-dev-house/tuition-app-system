import type { NextRequest } from "next/server";
import type { Month } from "@/generated/prisma/client";
import { createApiHandler } from "@/lib/api-adapter";
import { requireRole } from "@/lib/api-auth";
import { errorResponse, successResponse } from "@/lib/api-response";
import { ACADEMIC_MONTH_ORDER } from "@/lib/business-logic/tuition-generator";
import { getServerT } from "@/lib/i18n-server";
import { prisma } from "@/lib/prisma";

function yearForMonth(startYear: number, month: Month): number {
  const firstHalf: Month[] = [
    "JULY",
    "AUGUST",
    "SEPTEMBER",
    "OCTOBER",
    "NOVEMBER",
    "DECEMBER",
  ];
  return firstHalf.includes(month) ? startYear : startYear + 1;
}

async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ nis: string }> },
) {
  const auth = await requireRole(request, ["ADMIN", "CASHIER"]);
  if (auth instanceof Response) return auth;

  const t = await getServerT(request);
  const { nis } = await params;

  const sp = request.nextUrl.searchParams;
  const academicYearIdParam = sp.get("academicYearId") || undefined;

  try {
    const student = await prisma.student.findUnique({ where: { nis } });
    if (!student) {
      return errorResponse(
        t("api.notFound", { resource: "Student" }),
        "NOT_FOUND",
        404,
      );
    }

    const academicYear = academicYearIdParam
      ? await prisma.academicYear.findUnique({
          where: { id: academicYearIdParam },
        })
      : await prisma.academicYear.findFirst({ where: { isActive: true } });

    if (!academicYear) {
      return errorResponse(
        t("api.notFound", { resource: "AcademicYear" }),
        "NOT_FOUND",
        404,
      );
    }

    const startYear = academicYear.startDate.getUTCFullYear();

    const studentClass = await prisma.studentClass.findFirst({
      where: {
        studentNis: nis,
        classAcademic: { academicYearId: academicYear.id },
      },
      include: { classAcademic: true },
    });

    const [tuitions, feeBills, serviceFeeBills] = await Promise.all([
      prisma.tuition.findMany({
        where: {
          studentNis: nis,
          year: { in: [startYear, startYear + 1] },
          classAcademic: { academicYearId: academicYear.id },
        },
        include: {
          payments: { orderBy: { paymentDate: "desc" } },
        },
      }),
      prisma.feeBill.findMany({
        where: {
          studentNis: nis,
          year: { in: [startYear, startYear + 1] },
          feeService: { academicYearId: academicYear.id },
        },
        include: {
          feeService: true,
          payments: { orderBy: { paymentDate: "desc" } },
        },
      }),
      prisma.serviceFeeBill.findMany({
        where: {
          studentNis: nis,
          year: { in: [startYear, startYear + 1] },
          classAcademic: { academicYearId: academicYear.id },
        },
        include: {
          serviceFee: true,
          payments: { orderBy: { paymentDate: "desc" } },
        },
      }),
    ]);

    const months = ACADEMIC_MONTH_ORDER.map((month, idx) => {
      const year = yearForMonth(startYear, month);

      const tuition = tuitions.find(
        (tt) => tt.period === month && tt.year === year,
      );
      const feeRows = feeBills.filter(
        (b) => b.period === month && b.year === year,
      );
      const svcRows = serviceFeeBills.filter(
        (b) => b.period === month && b.year === year,
      );

      const tuitionAmount = tuition
        ? Number(tuition.feeAmount) -
          Number(tuition.scholarshipAmount) -
          Number(tuition.discountAmount)
        : 0;
      const tuitionPaid = tuition ? Number(tuition.paidAmount) : 0;

      const feeAmount = feeRows.reduce((s, b) => s + Number(b.amount), 0);
      const feePaid = feeRows.reduce((s, b) => s + Number(b.paidAmount), 0);

      const svcAmount = svcRows.reduce((s, b) => s + Number(b.amount), 0);
      const svcPaid = svcRows.reduce((s, b) => s + Number(b.paidAmount), 0);

      const allPayments = [
        ...(tuition?.payments ?? []),
        ...feeRows.flatMap((b) => b.payments),
        ...svcRows.flatMap((b) => b.payments),
      ];
      const lastPayment = allPayments.reduce<Date | null>((latest, p) => {
        const d = new Date(p.paymentDate);
        return !latest || d > latest ? d : latest;
      }, null);

      const receiptNos = Array.from(
        new Set(allPayments.map((p) => p.id.slice(0, 8).toUpperCase())),
      );

      return {
        index: idx + 1,
        month,
        year,
        tuition: tuition
          ? { amount: tuitionAmount, paidAmount: tuitionPaid }
          : null,
        feeBills: {
          amount: feeAmount,
          paidAmount: feePaid,
          details: feeRows.map((b) => ({
            name: b.feeService.name,
            category: b.feeService.category,
            amount: Number(b.amount),
            paidAmount: Number(b.paidAmount),
          })),
        },
        serviceFeeBills: {
          amount: svcAmount,
          paidAmount: svcPaid,
          details: svcRows.map((b) => ({
            name: b.serviceFee.name,
            amount: Number(b.amount),
            paidAmount: Number(b.paidAmount),
          })),
        },
        totalAmount: tuitionAmount + feeAmount + svcAmount,
        totalPaid: tuitionPaid + feePaid + svcPaid,
        lastPaymentDate: lastPayment ? lastPayment.toISOString() : null,
        receiptNos,
      };
    });

    return successResponse({
      student: {
        nis: student.nis,
        name: student.name,
        address: student.address,
        parentName: student.parentName,
      },
      class: studentClass
        ? {
            className: studentClass.classAcademic.className,
            grade: studentClass.classAcademic.grade,
            section: studentClass.classAcademic.section,
          }
        : null,
      academicYear: {
        id: academicYear.id,
        year: academicYear.year,
        startDate: academicYear.startDate.toISOString(),
        endDate: academicYear.endDate.toISOString(),
      },
      months,
    });
  } catch (error) {
    console.error("Payment card error:", error);
    return errorResponse(t("api.internalError"), "SERVER_ERROR", 500);
  }
}

export default createApiHandler({ GET });
