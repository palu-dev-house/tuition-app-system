import type {
  Discount,
  PrismaClient,
  Tuition,
} from "@/generated/prisma/client";
import { PERIOD_MONTHS } from "./tuition-generator";

// ============================================
// TYPES
// ============================================

export interface DiscountMatch {
  discount: Discount;
  matchedPeriods: string[];
}

export interface ApplyDiscountResult {
  tuitionId: string;
  discountId: string;
  discountAmount: number;
  previousDiscountAmount: number;
}

// ============================================
// PERIOD MATCHING UTILITIES
// ============================================

/**
 * Expand target periods to individual months
 * Q1 -> [JULY, AUGUST, SEPTEMBER]
 * SEM1 -> [JULY, AUGUST, SEPTEMBER, OCTOBER, NOVEMBER, DECEMBER]
 */
export function expandTargetPeriods(targetPeriods: string[]): string[] {
  const expanded = new Set<string>();

  for (const period of targetPeriods) {
    // Check if it's a quarterly period
    if (PERIOD_MONTHS[period]) {
      for (const month of PERIOD_MONTHS[period]) {
        expanded.add(month);
      }
      // Also add the period itself for quarterly/semester tuitions
      expanded.add(period);
    } else {
      // It's a monthly period or unknown
      expanded.add(period);
    }
  }

  return Array.from(expanded);
}

/**
 * Check if a tuition period matches any of the discount's target periods
 */
export function isPeriodMatch(
  tuitionPeriod: string,
  targetPeriods: string[],
): boolean {
  // Direct match
  if (targetPeriods.includes(tuitionPeriod)) {
    return true;
  }

  // Check if tuition period is a month and target has a containing quarter/semester
  for (const target of targetPeriods) {
    const months = PERIOD_MONTHS[target];
    if (months?.includes(tuitionPeriod as (typeof months)[number])) {
      return true;
    }
  }

  // Check if tuition period is quarterly/semester and overlaps with target months
  const tuitionMonths = PERIOD_MONTHS[tuitionPeriod];
  if (tuitionMonths) {
    const expandedTargets = expandTargetPeriods(targetPeriods);
    for (const month of tuitionMonths) {
      if (expandedTargets.includes(month)) {
        return true;
      }
    }
  }

  return false;
}

// ============================================
// DISCOUNT MATCHING
// ============================================

/**
 * Find discounts that match a tuition's class and period
 */
export async function findMatchingDiscounts(
  tuition: {
    classAcademicId: string;
    period: string;
    year: number;
  },
  academicYearId: string,
  prisma: PrismaClient,
): Promise<DiscountMatch[]> {
  // Fetch active discounts for the academic year
  const discounts = await prisma.discount.findMany({
    where: {
      academicYearId,
      isActive: true,
      OR: [
        { classAcademicId: null }, // School-wide
        { classAcademicId: tuition.classAcademicId }, // Class-specific
      ],
    },
  });

  const matches: DiscountMatch[] = [];

  for (const discount of discounts) {
    if (isPeriodMatch(tuition.period, discount.targetPeriods)) {
      matches.push({
        discount,
        matchedPeriods: discount.targetPeriods.filter((p) =>
          isPeriodMatch(tuition.period, [p]),
        ),
      });
    }
  }

  // Sort: class-specific discounts first, then by amount (highest first)
  matches.sort((a, b) => {
    // Class-specific takes priority
    if (a.discount.classAcademicId && !b.discount.classAcademicId) return -1;
    if (!a.discount.classAcademicId && b.discount.classAcademicId) return 1;
    // Then by amount
    return (
      Number(b.discount.discountAmount) - Number(a.discount.discountAmount)
    );
  });

  return matches;
}

/**
 * Get all applicable discounts for a class during tuition generation
 */
export async function getApplicableDiscounts(
  classAcademicId: string,
  academicYearId: string,
  prisma: PrismaClient,
): Promise<Discount[]> {
  return prisma.discount.findMany({
    where: {
      academicYearId,
      isActive: true,
      OR: [
        { classAcademicId: null }, // School-wide
        { classAcademicId }, // Class-specific
      ],
    },
    orderBy: [
      { classAcademicId: "asc" }, // null (school-wide) comes first
      { discountAmount: "desc" },
    ],
  });
}

/**
 * Calculate the discount amount for a specific period
 * Returns the best matching discount (class-specific preferred, then highest amount)
 */
export interface PeriodDiscountSource {
  id: string;
  classAcademicId: string | null;
  discountAmount: Discount["discountAmount"] | number;
  targetPeriods: string[];
}

export function calculatePeriodDiscount(
  period: string,
  discounts: PeriodDiscountSource[],
  classAcademicId: string,
): { discountAmount: number; discountId: string | null } {
  let bestMatch: { amount: number; id: string } | null = null;

  for (const discount of discounts) {
    if (!isPeriodMatch(period, discount.targetPeriods)) {
      continue;
    }

    const amount = Number(discount.discountAmount);

    // Class-specific discount always wins
    if (discount.classAcademicId === classAcademicId) {
      return { discountAmount: amount, discountId: discount.id };
    }

    // Track best school-wide discount
    if (!bestMatch || amount > bestMatch.amount) {
      bestMatch = { amount, id: discount.id };
    }
  }

  if (bestMatch) {
    return { discountAmount: bestMatch.amount, discountId: bestMatch.id };
  }

  return { discountAmount: 0, discountId: null };
}

// ============================================
// APPLY DISCOUNTS
// ============================================

/**
 * Apply a discount to existing tuitions that match its criteria
 */
export async function applyDiscountToTuitions(
  discountId: string,
  prisma: PrismaClient,
): Promise<ApplyDiscountResult[]> {
  const discount = await prisma.discount.findUnique({
    where: { id: discountId },
    include: {
      academicYear: true,
    },
  });

  if (!discount) {
    throw new Error("Discount not found");
  }

  if (!discount.isActive) {
    throw new Error("Discount is not active");
  }

  // Find tuitions that match the discount criteria
  const whereClause: {
    classAcademic: { academicYearId: string };
    classAcademicId?: string;
    period: { in: string[] };
    status: { not: "PAID" };
  } = {
    classAcademic: {
      academicYearId: discount.academicYearId,
    },
    period: {
      in: expandTargetPeriods(discount.targetPeriods),
    },
    status: {
      not: "PAID", // Don't modify already paid tuitions
    },
  };

  // If class-specific, only apply to that class
  if (discount.classAcademicId) {
    whereClause.classAcademicId = discount.classAcademicId;
  }

  const tuitions = await prisma.tuition.findMany({
    where: whereClause,
  });

  const results: ApplyDiscountResult[] = [];
  const discountAmount = Number(discount.discountAmount);

  for (const tuition of tuitions) {
    // Check if this period actually matches (for quarterly/semester tuitions)
    if (!isPeriodMatch(tuition.period, discount.targetPeriods)) {
      continue;
    }

    // Check if tuition already has a higher discount from a class-specific discount
    if (tuition.discountId && tuition.discountId !== discountId) {
      const existingDiscount = await prisma.discount.findUnique({
        where: { id: tuition.discountId },
      });

      // Skip if existing discount is class-specific and current is school-wide
      if (existingDiscount?.classAcademicId && !discount.classAcademicId) {
        continue;
      }

      // Skip if existing discount has higher amount
      if (
        existingDiscount &&
        Number(existingDiscount.discountAmount) >= discountAmount
      ) {
        continue;
      }
    }

    const previousDiscountAmount = Number(tuition.discountAmount);

    const feeAmount = Number(tuition.feeAmount);
    const totalScholarship = Number(tuition.scholarshipAmount);
    const effectiveFee = Math.max(
      feeAmount - totalScholarship - discountAmount,
      0,
    );

    await prisma.tuition.update({
      where: { id: tuition.id },
      data: {
        discountId: discount.id,
        discountAmount,
        status: effectiveFee === 0 ? "PAID" : tuition.status,
      },
    });

    results.push({
      tuitionId: tuition.id,
      discountId: discount.id,
      discountAmount,
      previousDiscountAmount,
    });
  }

  return results;
}

/**
 * Remove a discount from all tuitions
 */
export async function removeDiscountFromTuitions(
  discountId: string,
  prisma: PrismaClient,
): Promise<number> {
  const result = await prisma.tuition.updateMany({
    where: { discountId },
    data: {
      discountId: null,
      discountAmount: 0,
    },
  });

  return result.count;
}

/**
 * Get tuitions that would be affected by applying a discount
 * Used for preview before applying
 */
export async function previewDiscountApplication(
  discountId: string,
  prisma: PrismaClient,
): Promise<{
  tuitions: Tuition[];
  totalDiscountAmount: number;
  tuitionCount: number;
}> {
  const discount = await prisma.discount.findUnique({
    where: { id: discountId },
  });

  if (!discount) {
    throw new Error("Discount not found");
  }

  const whereClause: {
    classAcademic: { academicYearId: string };
    classAcademicId?: string;
    period: { in: string[] };
    status: { not: "PAID" };
  } = {
    classAcademic: {
      academicYearId: discount.academicYearId,
    },
    period: {
      in: expandTargetPeriods(discount.targetPeriods),
    },
    status: {
      not: "PAID",
    },
  };

  if (discount.classAcademicId) {
    whereClause.classAcademicId = discount.classAcademicId;
  }

  const tuitions = await prisma.tuition.findMany({
    where: whereClause,
    include: {
      student: {
        select: { name: true, nis: true },
      },
      classAcademic: {
        select: { className: true },
      },
    },
  });

  // Filter to only matching periods
  const matchingTuitions = tuitions.filter((t) =>
    isPeriodMatch(t.period, discount.targetPeriods),
  );

  const discountAmount = Number(discount.discountAmount);
  const totalDiscountAmount = matchingTuitions.length * discountAmount;

  return {
    tuitions: matchingTuitions,
    totalDiscountAmount,
    tuitionCount: matchingTuitions.length,
  };
}
