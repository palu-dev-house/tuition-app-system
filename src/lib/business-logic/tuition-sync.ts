import type {
  PaymentFrequency,
  PaymentStatus,
  PrismaClient,
} from "@/generated/prisma/client";
import {
  calculatePeriodDiscount,
  type PeriodDiscountSource,
} from "./discount-processor";
import { generateServiceFeeBillsForFee } from "./service-fee-bills";
import {
  type GeneratedTuition,
  generateTuitions,
  getFeeForFrequency,
} from "./tuition-generator";

// ============================================
// TYPES
// ============================================

export interface SyncClassAcademic {
  id: string;
  paymentFrequency: PaymentFrequency;
  monthlyFee: number | null;
  quarterlyFee: number | null;
  semesterFee: number | null;
  academicYear: { startDate: Date; endDate: Date };
}

export interface SyncStudent {
  id: string;
  startJoinDate: Date;
  exitedAt: Date | null;
}

export interface SyncExistingTuition {
  id: string;
  classAcademicId: string;
  studentId: string;
  period: string;
  year: number;
  status: PaymentStatus;
}

export interface SyncAssignment {
  studentId: string;
  classAcademicId: string;
}

export interface SyncScholarship {
  studentId: string;
  nominal: number;
}

export type PlannedTuition = Omit<GeneratedTuition, "status"> & {
  discountAmount: number;
  discountId: string | null;
  scholarshipAmount: number;
  status: "UNPAID" | "PAID";
};

export interface TuitionSyncPlan {
  /** IDs of unpaid tuitions orphaned by re-assignment, safe to delete. */
  toDelete: string[];
  toCreate: PlannedTuition[];
}

export interface TuitionSyncInput {
  classAcademic: SyncClassAcademic;
  students: SyncStudent[];
  /** Current assignments (same academic year) of the students in the batch. */
  assignments: SyncAssignment[];
  /** All tuitions of these students within the same academic year. */
  existingTuitions: SyncExistingTuition[];
  discounts: PeriodDiscountSource[];
  /** Scholarships already scoped to the target class. */
  scholarships?: SyncScholarship[];
}

// ============================================
// PLANNER (pure)
// ============================================

/**
 * Plan tuition changes when students are assigned to a class.
 *
 * Rules:
 * - No fee configured on the class -> no changes (fees must exist first).
 * - UNPAID tuitions in classes a student is no longer assigned to are
 *   deleted and their periods regenerated in the new class.
 * - PAID/PARTIAL tuitions are never deleted and their periods are never
 *   regenerated (already billed/paid).
 * - Periods already covered in the target class are never duplicated
 *   (unique constraint on class+student+period+year).
 * - Discounts and the student's scholarships for the target class are
 *   applied to generated rows; a scholarship covering the full fee marks
 *   the tuition PAID.
 */
export function planTuitionSync(input: TuitionSyncInput): TuitionSyncPlan {
  const { classAcademic, students, assignments, existingTuitions } = input;

  const feeAmount = getFeeForFrequency(classAcademic);
  if (!feeAmount || feeAmount <= 0) {
    return { toDelete: [], toCreate: [] };
  }

  const assignedByStudent = new Map<string, Set<string>>();
  for (const a of assignments) {
    let set = assignedByStudent.get(a.studentId);
    if (!set) {
      set = new Set();
      assignedByStudent.set(a.studentId, set);
    }
    set.add(a.classAcademicId);
  }

  const toDelete = existingTuitions
    .filter(
      (t) =>
        t.status === "UNPAID" &&
        !assignedByStudent.get(t.studentId)?.has(t.classAcademicId),
    )
    .map((t) => t.id);
  const deleteSet = new Set(toDelete);

  // Periods that must not be regenerated: any surviving tuition in the target
  // class (unique constraint), or a surviving billed/paid period anywhere in
  // the academic year. VOID tuitions in other classes do not block.
  const blocked = new Set<string>();
  for (const t of existingTuitions) {
    if (deleteSet.has(t.id)) continue;
    if (t.classAcademicId === classAcademic.id || t.status !== "VOID") {
      blocked.add(`${t.studentId}-${t.period}-${t.year}`);
    }
  }

  const scholarshipByStudent = new Map<string, number>();
  for (const s of input.scholarships ?? []) {
    scholarshipByStudent.set(
      s.studentId,
      (scholarshipByStudent.get(s.studentId) ?? 0) + s.nominal,
    );
  }

  const generated = generateTuitions({
    classAcademicId: classAcademic.id,
    frequency: classAcademic.paymentFrequency,
    feeAmount,
    students,
    academicYear: classAcademic.academicYear,
  });

  const toCreate = generated
    .filter((t) => !blocked.has(`${t.studentId}-${t.period}-${t.year}`))
    .map((t) => {
      const { discountAmount, discountId } = calculatePeriodDiscount(
        t.period,
        input.discounts,
        classAcademic.id,
      );
      const scholarshipAmount = scholarshipByStudent.get(t.studentId) ?? 0;
      const outstanding = t.feeAmount - discountAmount - scholarshipAmount;

      return {
        ...t,
        discountAmount,
        discountId,
        scholarshipAmount,
        status:
          scholarshipAmount > 0 && outstanding <= 0
            ? ("PAID" as const)
            : ("UNPAID" as const),
      };
    });

  return { toDelete, toCreate };
}

export interface SyncServiceFeeBill {
  id: string;
  studentId: string;
  classAcademicId: string;
  status: PaymentStatus;
}

/**
 * Service fee bills follow the same re-assignment rule as tuitions:
 * UNPAID bills of classes a student is no longer assigned to are deleted;
 * PAID/PARTIAL (and VOID, for audit) bills are kept.
 */
export function planOrphanedServiceFeeBillDeletion(
  existingBills: SyncServiceFeeBill[],
  assignments: SyncAssignment[],
): string[] {
  const assignedByStudent = new Map<string, Set<string>>();
  for (const a of assignments) {
    let set = assignedByStudent.get(a.studentId);
    if (!set) {
      set = new Set();
      assignedByStudent.set(a.studentId, set);
    }
    set.add(a.classAcademicId);
  }

  return existingBills
    .filter(
      (b) =>
        b.status === "UNPAID" &&
        !assignedByStudent.get(b.studentId)?.has(b.classAcademicId),
    )
    .map((b) => b.id);
}

// ============================================
// ORCHESTRATOR (DB)
// ============================================

/**
 * A student belongs to at most one class per academic year: assigning to a
 * class removes the student's assignments to other classes of the same year
 * (re-assignment = move). Call BEFORE syncTuitionsForClassAssignment so the
 * sync sees the old class as orphaned and regenerates its UNPAID rows in the
 * new class (PAID/PARTIAL rows are preserved by the sync).
 */
export async function removeOtherAssignmentsInYear(
  prisma: PrismaClient,
  classAcademicId: string,
  studentIds: string[],
): Promise<number> {
  if (studentIds.length === 0) return 0;

  const classAcademic = await prisma.classAcademic.findUnique({
    where: { id: classAcademicId },
    select: { academicYearId: true },
  });
  if (!classAcademic) return 0;

  const res = await prisma.studentClass.deleteMany({
    where: {
      studentId: { in: studentIds },
      classAcademicId: { not: classAcademicId },
      classAcademic: { academicYearId: classAcademic.academicYearId },
    },
  });
  return res.count;
}

export interface TuitionSyncResult {
  tuitionsCreated: number;
  tuitionsRemoved: number;
  serviceFeeBillsCreated: number;
  serviceFeeBillsRemoved: number;
}

/**
 * Sync tuitions and service fee bills after students were assigned to a class.
 * Batched: a constant number of queries per class regardless of student count.
 * Call once per class; multiple classes can run under Promise.all.
 */
export async function syncTuitionsForClassAssignment(
  prisma: PrismaClient,
  classAcademicId: string,
  studentIds: string[],
): Promise<TuitionSyncResult> {
  const empty: TuitionSyncResult = {
    tuitionsCreated: 0,
    tuitionsRemoved: 0,
    serviceFeeBillsCreated: 0,
    serviceFeeBillsRemoved: 0,
  };
  if (studentIds.length === 0) return empty;

  const classAcademic = await prisma.classAcademic.findUnique({
    where: { id: classAcademicId },
    include: {
      academicYear: true,
      serviceFees: { where: { isActive: true } },
    },
  });
  if (!classAcademic) return empty;

  const yearScope = {
    classAcademic: { academicYearId: classAcademic.academicYearId },
  };

  const [
    students,
    assignments,
    existingTuitions,
    existingBills,
    discounts,
    scholarships,
  ] = await Promise.all([
    prisma.student.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, startJoinDate: true, exitedAt: true },
    }),
    prisma.studentClass.findMany({
      where: { studentId: { in: studentIds }, ...yearScope },
      select: { studentId: true, classAcademicId: true },
    }),
    prisma.tuition.findMany({
      where: { studentId: { in: studentIds }, ...yearScope },
      select: {
        id: true,
        classAcademicId: true,
        studentId: true,
        period: true,
        year: true,
        status: true,
      },
    }),
    prisma.serviceFeeBill.findMany({
      where: { studentId: { in: studentIds }, ...yearScope },
      select: {
        id: true,
        studentId: true,
        classAcademicId: true,
        status: true,
      },
    }),
    prisma.discount.findMany({
      where: {
        academicYearId: classAcademic.academicYearId,
        isActive: true,
        OR: [{ classAcademicId: null }, { classAcademicId }],
      },
      orderBy: [{ classAcademicId: "asc" }, { discountAmount: "desc" }],
    }),
    prisma.scholarship.findMany({
      where: { classAcademicId, studentId: { in: studentIds } },
      select: { studentId: true, nominal: true },
    }),
  ]);

  const plan = planTuitionSync({
    classAcademic: {
      id: classAcademic.id,
      paymentFrequency: classAcademic.paymentFrequency,
      monthlyFee: classAcademic.monthlyFee
        ? Number(classAcademic.monthlyFee)
        : null,
      quarterlyFee: classAcademic.quarterlyFee
        ? Number(classAcademic.quarterlyFee)
        : null,
      semesterFee: classAcademic.semesterFee
        ? Number(classAcademic.semesterFee)
        : null,
      academicYear: {
        startDate: classAcademic.academicYear.startDate,
        endDate: classAcademic.academicYear.endDate,
      },
    },
    students,
    assignments,
    existingTuitions,
    discounts,
    scholarships: scholarships.map((s) => ({
      studentId: s.studentId,
      nominal: Number(s.nominal),
    })),
  });

  const billsToDelete = planOrphanedServiceFeeBillDeletion(
    existingBills,
    assignments,
  );

  return prisma.$transaction(async (tx) => {
    let tuitionsRemoved = 0;
    if (plan.toDelete.length > 0) {
      // Extra guard: never delete a row that somehow acquired payments.
      const res = await tx.tuition.deleteMany({
        where: {
          id: { in: plan.toDelete },
          payments: { none: {} },
          onlinePaymentItems: { none: {} },
        },
      });
      tuitionsRemoved = res.count;
    }

    let tuitionsCreated = 0;
    if (plan.toCreate.length > 0) {
      const res = await tx.tuition.createMany({
        data: plan.toCreate.map((t) => ({
          classAcademicId: t.classAcademicId,
          studentId: t.studentId,
          period: t.period,
          month: t.month,
          year: t.year,
          feeAmount: t.feeAmount,
          dueDate: t.dueDate,
          status: t.status,
          discountAmount: t.discountAmount,
          discountId: t.discountId,
          scholarshipAmount: t.scholarshipAmount,
        })),
        skipDuplicates: true,
      });
      tuitionsCreated = res.count;
    }

    let serviceFeeBillsRemoved = 0;
    if (billsToDelete.length > 0) {
      const res = await tx.serviceFeeBill.deleteMany({
        where: {
          id: { in: billsToDelete },
          payments: { none: {} },
          onlinePaymentItems: { none: {} },
        },
      });
      serviceFeeBillsRemoved = res.count;
    }

    let serviceFeeBillsCreated = 0;
    for (const fee of classAcademic.serviceFees) {
      const res = await generateServiceFeeBillsForFee(
        tx,
        fee,
        students.map((s) => ({ id: s.id, exitedAt: s.exitedAt })),
        {
          id: classAcademic.academicYearId,
          startDate: classAcademic.academicYear.startDate,
          endDate: classAcademic.academicYear.endDate,
        },
      );
      serviceFeeBillsCreated += res.created;
    }

    return {
      tuitionsCreated,
      tuitionsRemoved,
      serviceFeeBillsCreated,
      serviceFeeBillsRemoved,
    };
  });
}
