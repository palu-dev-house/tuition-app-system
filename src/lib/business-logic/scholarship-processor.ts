import type { PrismaClient } from "@/generated/prisma/client";

export interface ScholarshipApplicationParams {
  studentId: string;
  classAcademicId: string;
  nominal: number;
  monthlyFee: number;
}

export interface ScholarshipApplicationResult {
  isFullScholarship: boolean;
  tuitionsAffected: number;
  autoPayments: Array<{
    tuitionId: string;
    amount: number;
  }>;
}

export interface ScholarshipTuitionInput {
  id: string;
  feeAmount: number;
  paidAmount: number;
  discountAmount: number;
}

export interface ScholarshipUpdateGroup {
  status: "PAID" | "PARTIAL" | "UNPAID";
  tuitionIds: string[];
}

/**
 * Group tuitions by the status they end up with after the scholarship is
 * applied, so callers can issue one bulk update per group instead of one
 * update per tuition.
 */
export function planScholarshipUpdates(
  tuitions: ScholarshipTuitionInput[],
  nominal: number,
): ScholarshipUpdateGroup[] {
  const byStatus = new Map<ScholarshipUpdateGroup["status"], string[]>();

  for (const tuition of tuitions) {
    const effectiveFee = Math.max(
      tuition.feeAmount - nominal - tuition.discountAmount,
      0,
    );

    let newStatus: ScholarshipUpdateGroup["status"];
    if (tuition.paidAmount >= effectiveFee) {
      newStatus = "PAID";
    } else if (tuition.paidAmount > 0) {
      newStatus = "PARTIAL";
    } else {
      newStatus = "UNPAID";
    }

    const ids = byStatus.get(newStatus) ?? [];
    ids.push(tuition.id);
    byStatus.set(newStatus, ids);
  }

  const order: ScholarshipUpdateGroup["status"][] = [
    "PAID",
    "PARTIAL",
    "UNPAID",
  ];
  return order
    .filter((status) => byStatus.has(status))
    .map((status) => ({ status, tuitionIds: byStatus.get(status)! }));
}

/**
 * Apply scholarship to tuitions
 * - For full scholarships: mark UNPAID tuitions as PAID with scholarshipAmount = fee
 * - For partial scholarships: just update scholarshipAmount on UNPAID/PARTIAL tuitions
 * - Does NOT create fake payment records - scholarship is tracked separately
 * - Batched: one updateMany per resulting status (max 3 queries).
 */
export async function applyScholarship(
  params: ScholarshipApplicationParams,
  prisma: PrismaClient,
  _systemEmployeeId: string, // No longer needed, kept for API compatibility
): Promise<ScholarshipApplicationResult> {
  const { studentId, classAcademicId, nominal, monthlyFee } = params;

  // Determine if full scholarship (covers full monthly fee)
  const isFullScholarship = nominal >= monthlyFee;

  const result: ScholarshipApplicationResult = {
    isFullScholarship,
    tuitionsAffected: 0,
    autoPayments: [],
  };

  // Find all unpaid/partial tuitions for this student in this class
  const tuitions = await prisma.tuition.findMany({
    where: {
      studentId,
      classAcademicId,
      status: { in: ["UNPAID", "PARTIAL"] },
    },
    select: {
      id: true,
      feeAmount: true,
      paidAmount: true,
      discountAmount: true,
    },
  });

  const groups = planScholarshipUpdates(
    tuitions.map((t) => ({
      id: t.id,
      feeAmount: Number(t.feeAmount),
      paidAmount: Number(t.paidAmount),
      discountAmount: Number(t.discountAmount),
    })),
    nominal,
  );

  await prisma.$transaction(
    groups.map((group) =>
      prisma.tuition.updateMany({
        where: { id: { in: group.tuitionIds } },
        data: { scholarshipAmount: nominal, status: group.status },
      }),
    ),
  );

  for (const tuition of tuitions) {
    result.autoPayments.push({
      tuitionId: tuition.id,
      amount: 0, // No actual payment, just scholarship
    });
  }

  result.tuitionsAffected = tuitions.length;

  return result;
}

/**
 * Calculate scholarship coverage percentage
 */
export function calculateScholarshipCoverage(
  scholarshipAmount: number,
  monthlyFee: number,
): {
  percentage: number;
  isFullScholarship: boolean;
  remainingAmount: number;
} {
  const percentage = Math.min((scholarshipAmount / monthlyFee) * 100, 100);
  const isFullScholarship = percentage >= 100;
  const remainingAmount = Math.max(monthlyFee - scholarshipAmount, 0);

  return {
    percentage,
    isFullScholarship,
    remainingAmount,
  };
}

/**
 * Get the fee amount for a class (from existing tuitions or default)
 */
export async function getClassFeeAmount(
  classAcademicId: string,
  prisma: PrismaClient,
): Promise<number | null> {
  const tuition = await prisma.tuition.findFirst({
    where: { classAcademicId },
    select: { feeAmount: true },
  });

  return tuition ? Number(tuition.feeAmount) : null;
}
