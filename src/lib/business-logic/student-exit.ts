import type { PaymentFrequency } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import {
  NoPriceForPeriodError,
  resolvePriceForPeriod,
} from "@/lib/business-logic/fee-bills";
import { prisma } from "@/lib/prisma";

const MONTH_NUMBER: Record<string, number> = {
  JANUARY: 1,
  FEBRUARY: 2,
  MARCH: 3,
  APRIL: 4,
  MAY: 5,
  JUNE: 6,
  JULY: 7,
  AUGUST: 8,
  SEPTEMBER: 9,
  OCTOBER: 10,
  NOVEMBER: 11,
  DECEMBER: 12,
};

const QUARTER_START_MONTH: Record<string, number> = {
  Q1: 7, // July
  Q2: 10, // October
  Q3: 1, // January
  Q4: 4, // April
};

const SEMESTER_START_MONTH: Record<string, number> = {
  SEM1: 7, // July
  SEM2: 1, // January
};

/**
 * First calendar day of a tuition period.
 * `year` is the calendar year stored on the Tuition row (Jan-Jun periods use academicYear.startYear+1).
 */
export function getPeriodStart(
  period: string,
  year: number,
  frequency: PaymentFrequency,
): Date {
  if (frequency === "MONTHLY") {
    const month = MONTH_NUMBER[period];
    if (!month) throw new Error(`Invalid monthly period: ${period}`);
    return new Date(year, month - 1, 1);
  }
  if (frequency === "QUARTERLY") {
    const month = QUARTER_START_MONTH[period];
    if (!month) throw new Error(`Invalid quarterly period: ${period}`);
    return new Date(year, month - 1, 1);
  }
  if (frequency === "SEMESTER") {
    const month = SEMESTER_START_MONTH[period];
    if (!month) throw new Error(`Invalid semester period: ${period}`);
    return new Date(year, month - 1, 1);
  }
  throw new Error(`Unknown frequency: ${frequency}`);
}

/**
 * True when the period begins strictly after the exit date.
 * Used to decide whether a tuition row should be auto-voided on exit.
 */
export function isPeriodAfterExit(
  period: string,
  year: number,
  frequency: PaymentFrequency,
  exitDate: Date,
): boolean {
  return getPeriodStart(period, year, frequency).getTime() > exitDate.getTime();
}

export interface ProrationCandidate {
  id: string;
  period: string;
  year: number;
  frequency: PaymentFrequency;
  status: "UNPAID" | "PARTIAL";
  feeAmount: number;
  paidAmount: number;
  discountAmount?: number;
  scholarshipAmount?: number;
}

export interface ProrationUpdate {
  id: string;
  newFeeAmount: number;
  newStatus: "UNPAID" | "PARTIAL" | "PAID";
}

/**
 * Half-month rule for the exit month (monthly periods only): leaving on or
 * before the 15th halves the month's fee; after the 15th the full fee stands.
 * The fee is never reduced below what has already been paid, and quarterly/
 * semester tuitions are left untouched (no proration policy for them).
 */
export function planExitMonthProration(
  rows: ProrationCandidate[],
  exitDate: Date,
): ProrationUpdate[] {
  if (exitDate.getDate() > 15) return [];

  const updates: ProrationUpdate[] = [];
  for (const r of rows) {
    if (r.frequency !== "MONTHLY") continue;
    if (
      MONTH_NUMBER[r.period] !== exitDate.getMonth() + 1 ||
      r.year !== exitDate.getFullYear()
    ) {
      continue;
    }

    const halfFee = Math.round(r.feeAmount / 2);
    const newFeeAmount = Math.max(halfFee, r.paidAmount);
    if (newFeeAmount >= r.feeAmount) continue;

    const effectiveFee = Math.max(
      newFeeAmount - (r.discountAmount ?? 0) - (r.scholarshipAmount ?? 0),
      0,
    );
    const newStatus =
      r.paidAmount >= effectiveFee
        ? ("PAID" as const)
        : r.paidAmount > 0
          ? ("PARTIAL" as const)
          : ("UNPAID" as const);

    updates.push({ id: r.id, newFeeAmount, newStatus });
  }
  return updates;
}

export interface RecordExitParams {
  nis: string;
  exitDate: Date;
  reason: string;
  employeeId: string;
}

export type PartialWarningSource = "tuition" | "feeBill" | "serviceFeeBill";

export interface PartialWarning {
  source: PartialWarningSource;
  /** Legacy field retained for backward compat when source === "tuition". */
  tuitionId?: string;
  /** Set when source === "feeBill". */
  feeBillId?: string;
  /** Set when source === "serviceFeeBill". */
  serviceFeeBillId?: string;
  period: string;
  year: number;
  paidAmount: string; // Decimal serialized
}

export interface RecordExitResult {
  voidedCount: number;
  /** Exit-month rows reduced by the half-month rule. */
  proratedCount: number;
  partialWarnings: PartialWarning[];
}

export class StudentExitError extends Error {
  constructor(
    public code:
      | "NOT_FOUND"
      | "ALREADY_EXITED"
      | "DATE_BEFORE_JOIN"
      | "DATE_IN_FUTURE",
    message: string,
  ) {
    super(message);
    this.name = "StudentExitError";
  }
}

export async function recordStudentExit(
  params: RecordExitParams,
): Promise<RecordExitResult> {
  const { nis, exitDate, reason, employeeId } = params;

  return prisma.$transaction(async (tx) => {
    const student = await tx.student.findFirst({ where: { nis } });
    if (!student) {
      throw new StudentExitError("NOT_FOUND", `Student ${nis} not found`);
    }
    if (student.exitedAt) {
      throw new StudentExitError(
        "ALREADY_EXITED",
        `Student ${nis} is already exited`,
      );
    }
    if (exitDate < student.startJoinDate) {
      throw new StudentExitError(
        "DATE_BEFORE_JOIN",
        "Exit date cannot be before student's join date",
      );
    }
    // Compare only the date (ignore time) so "today" is allowed.
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (exitDate > today) {
      throw new StudentExitError(
        "DATE_IN_FUTURE",
        "Exit date cannot be in the future",
      );
    }

    await tx.student.update({
      where: { id: student.id },
      data: { exitedAt: exitDate, exitReason: reason, exitedBy: employeeId },
    });

    const candidates = await tx.tuition.findMany({
      where: {
        studentId: student.id,
        status: { in: ["UNPAID", "PARTIAL"] },
      },
      select: {
        id: true,
        period: true,
        year: true,
        status: true,
        feeAmount: true,
        paidAmount: true,
        discountAmount: true,
        scholarshipAmount: true,
        classAcademic: { select: { paymentFrequency: true } },
      },
    });

    const toVoid: string[] = [];
    const partialWarnings: PartialWarning[] = [];

    for (const t of candidates) {
      if (
        !isPeriodAfterExit(
          t.period,
          t.year,
          t.classAcademic.paymentFrequency,
          exitDate,
        )
      ) {
        continue;
      }
      if (t.status === "PARTIAL") {
        partialWarnings.push({
          source: "tuition",
          tuitionId: t.id,
          period: t.period,
          year: t.year,
          paidAmount: t.paidAmount.toString(),
        });
        continue;
      }
      toVoid.push(t.id);
    }

    if (toVoid.length > 0) {
      await tx.tuition.updateMany({
        where: { id: { in: toVoid } },
        data: {
          status: "VOID",
          voidedByExit: true,
          feeAmount: new Prisma.Decimal(0),
          paidAmount: new Prisma.Decimal(0),
        },
      });
    }

    // --- Half-month rule: exit on/before the 15th halves the exit month ---
    const tuitionProrations = planExitMonthProration(
      candidates.map((t) => ({
        id: t.id,
        period: t.period,
        year: t.year,
        frequency: t.classAcademic.paymentFrequency,
        status: t.status as "UNPAID" | "PARTIAL",
        feeAmount: Number(t.feeAmount),
        paidAmount: Number(t.paidAmount),
        discountAmount: Number(t.discountAmount),
        scholarshipAmount: Number(t.scholarshipAmount),
      })),
      exitDate,
    );
    for (const u of tuitionProrations) {
      await tx.tuition.update({
        where: { id: u.id },
        data: {
          feeAmount: new Prisma.Decimal(u.newFeeAmount),
          status: u.newStatus,
          proratedByExit: true,
        },
      });
    }

    // --- FeeSubscription: cap endDate at exitDate for still-active subs ---
    await tx.feeSubscription.updateMany({
      where: {
        studentId: student.id,
        OR: [{ endDate: null }, { endDate: { gt: exitDate } }],
      },
      data: { endDate: exitDate },
    });

    // --- FeeBill: void future unpaid, warn on future partial ---
    const feeBillCandidates = await tx.feeBill.findMany({
      where: { studentId: student.id, status: { in: ["UNPAID", "PARTIAL"] } },
      select: {
        id: true,
        period: true,
        year: true,
        status: true,
        amount: true,
        paidAmount: true,
      },
    });

    const feeBillsToVoid: string[] = [];
    for (const b of feeBillCandidates) {
      if (!isPeriodAfterExit(b.period, b.year, "MONTHLY", exitDate)) {
        continue;
      }
      if (b.status === "PARTIAL") {
        partialWarnings.push({
          source: "feeBill",
          feeBillId: b.id,
          period: b.period,
          year: b.year,
          paidAmount: b.paidAmount.toString(),
        });
        continue;
      }
      feeBillsToVoid.push(b.id);
    }

    if (feeBillsToVoid.length > 0) {
      await tx.feeBill.updateMany({
        where: { id: { in: feeBillsToVoid } },
        data: {
          status: "VOID",
          voidedByExit: true,
          amount: new Prisma.Decimal(0),
          paidAmount: new Prisma.Decimal(0),
        },
      });
    }

    const feeBillProrations = planExitMonthProration(
      feeBillCandidates.map((b) => ({
        id: b.id,
        period: b.period,
        year: b.year,
        frequency: "MONTHLY" as const,
        status: b.status as "UNPAID" | "PARTIAL",
        feeAmount: Number(b.amount),
        paidAmount: Number(b.paidAmount),
      })),
      exitDate,
    );
    for (const u of feeBillProrations) {
      await tx.feeBill.update({
        where: { id: u.id },
        data: {
          amount: new Prisma.Decimal(u.newFeeAmount),
          status: u.newStatus,
          proratedByExit: true,
        },
      });
    }

    // --- ServiceFeeBill: void future unpaid, warn on future partial ---
    const serviceBillCandidates = await tx.serviceFeeBill.findMany({
      where: { studentId: student.id, status: { in: ["UNPAID", "PARTIAL"] } },
      select: {
        id: true,
        period: true,
        year: true,
        status: true,
        amount: true,
        paidAmount: true,
      },
    });

    const serviceBillsToVoid: string[] = [];
    for (const b of serviceBillCandidates) {
      if (!isPeriodAfterExit(b.period, b.year, "MONTHLY", exitDate)) {
        continue;
      }
      if (b.status === "PARTIAL") {
        partialWarnings.push({
          source: "serviceFeeBill",
          serviceFeeBillId: b.id,
          period: b.period,
          year: b.year,
          paidAmount: b.paidAmount.toString(),
        });
        continue;
      }
      serviceBillsToVoid.push(b.id);
    }

    if (serviceBillsToVoid.length > 0) {
      await tx.serviceFeeBill.updateMany({
        where: { id: { in: serviceBillsToVoid } },
        data: {
          status: "VOID",
          voidedByExit: true,
          amount: new Prisma.Decimal(0),
          paidAmount: new Prisma.Decimal(0),
        },
      });
    }

    const serviceBillProrations = planExitMonthProration(
      serviceBillCandidates.map((b) => ({
        id: b.id,
        period: b.period,
        year: b.year,
        frequency: "MONTHLY" as const,
        status: b.status as "UNPAID" | "PARTIAL",
        feeAmount: Number(b.amount),
        paidAmount: Number(b.paidAmount),
      })),
      exitDate,
    );
    for (const u of serviceBillProrations) {
      await tx.serviceFeeBill.update({
        where: { id: u.id },
        data: {
          amount: new Prisma.Decimal(u.newFeeAmount),
          status: u.newStatus,
          proratedByExit: true,
        },
      });
    }

    return {
      voidedCount:
        toVoid.length + feeBillsToVoid.length + serviceBillsToVoid.length,
      proratedCount:
        tuitionProrations.length +
        feeBillProrations.length +
        serviceBillProrations.length,
      partialWarnings,
    };
  });
}

export interface UndoExitParams {
  nis: string;
  employeeId: string; // reserved for future audit; not persisted today
}

export interface UndoExitResult {
  restoredCount: number;
}

export async function undoStudentExit(
  params: UndoExitParams,
): Promise<UndoExitResult> {
  const { nis } = params;

  return prisma.$transaction(async (tx) => {
    const student = await tx.student.findFirst({ where: { nis } });
    if (!student) {
      throw new StudentExitError("NOT_FOUND", `Student ${nis} not found`);
    }
    if (!student.exitedAt) {
      throw new StudentExitError(
        "ALREADY_EXITED", // re-used: caller maps to 400
        `Student ${nis} is not currently exited`,
      );
    }

    // Find tuitions auto-voided by this exit, with their class fee config.
    const voided = await tx.tuition.findMany({
      where: { studentId: student.id, voidedByExit: true },
      select: {
        id: true,
        classAcademic: {
          select: {
            paymentFrequency: true,
            monthlyFee: true,
            quarterlyFee: true,
            semesterFee: true,
          },
        },
      },
    });

    const tuitionUpdates: Array<{ id: string; fee: Prisma.Decimal }> = [];
    for (const t of voided) {
      const c = t.classAcademic;
      const fee =
        c.paymentFrequency === "MONTHLY"
          ? c.monthlyFee
          : c.paymentFrequency === "QUARTERLY"
            ? c.quarterlyFee
            : c.semesterFee;
      if (fee == null) continue; // data inconsistent — skip
      tuitionUpdates.push({ id: t.id, fee });
    }
    if (tuitionUpdates.length > 0) {
      const rows = tuitionUpdates.map((r, i) =>
        i === 0
          ? Prisma.sql`(${r.id}::text, ${r.fee}::numeric)`
          : Prisma.sql`(${r.id}, ${r.fee})`,
      );
      await tx.$executeRaw`
        UPDATE tuitions
        SET status = 'UNPAID'::"PaymentStatus",
            voided_by_exit = false,
            fee_amount = v.fee_amount,
            updated_at = NOW()
        FROM (VALUES ${Prisma.join(rows)}) AS v(id, fee_amount)
        WHERE tuitions.id = v.id
      `;
    }
    const restoredCount = tuitionUpdates.length;

    // --- Restore FeeSubscription rows capped at exit date ---
    const exitedAt = student.exitedAt; // snapshot before clearing below
    const _subsRestored = await tx.feeSubscription.updateMany({
      where: { studentId: student.id, endDate: exitedAt },
      data: { endDate: null },
    });

    // --- Restore FeeBill rows voided by this exit; re-resolve price per period ---
    const voidedFeeBills = await tx.feeBill.findMany({
      where: { studentId: student.id, voidedByExit: true },
      select: {
        id: true,
        feeServiceId: true,
        period: true,
        year: true,
      },
    });

    const feeServiceIds = Array.from(
      new Set(voidedFeeBills.map((b) => b.feeServiceId)),
    );
    const allPrices = feeServiceIds.length
      ? await tx.feeServicePrice.findMany({
          where: { feeServiceId: { in: feeServiceIds } },
        })
      : [];
    const pricesByService = new Map<string, typeof allPrices>();
    for (const p of allPrices) {
      const list = pricesByService.get(p.feeServiceId);
      if (list) list.push(p);
      else pricesByService.set(p.feeServiceId, [p]);
    }

    const feeBillUpdates: Array<{ id: string; amount: Prisma.Decimal }> = [];
    for (const bill of voidedFeeBills) {
      const prices = pricesByService.get(bill.feeServiceId) ?? [];
      let amount: Prisma.Decimal;
      try {
        amount = resolvePriceForPeriod(prices, bill.period, bill.year);
      } catch (err) {
        if (err instanceof NoPriceForPeriodError) continue;
        throw err;
      }
      feeBillUpdates.push({ id: bill.id, amount });
    }
    if (feeBillUpdates.length > 0) {
      const rows = feeBillUpdates.map((r, i) =>
        i === 0
          ? Prisma.sql`(${r.id}::text, ${r.amount}::numeric)`
          : Prisma.sql`(${r.id}, ${r.amount})`,
      );
      await tx.$executeRaw`
        UPDATE fee_bills
        SET status = 'UNPAID'::"PaymentStatus",
            voided_by_exit = false,
            amount = v.amount,
            paid_amount = 0,
            updated_at = NOW()
        FROM (VALUES ${Prisma.join(rows)}) AS v(id, amount)
        WHERE fee_bills.id = v.id
      `;
    }
    const feeBillsRestored = feeBillUpdates.length;

    // --- Restore ServiceFeeBill rows voided by this exit ---
    const voidedServiceBills = await tx.serviceFeeBill.findMany({
      where: { studentId: student.id, voidedByExit: true },
      select: {
        id: true,
        serviceFee: {
          select: { id: true, amount: true, isActive: true },
        },
      },
    });

    const serviceBillUpdates: Array<{ id: string; amount: Prisma.Decimal }> =
      [];
    for (const bill of voidedServiceBills) {
      if (!bill.serviceFee || !bill.serviceFee.isActive) continue;
      serviceBillUpdates.push({
        id: bill.id,
        amount: new Prisma.Decimal(bill.serviceFee.amount),
      });
    }
    if (serviceBillUpdates.length > 0) {
      const rows = serviceBillUpdates.map((r, i) =>
        i === 0
          ? Prisma.sql`(${r.id}::text, ${r.amount}::numeric)`
          : Prisma.sql`(${r.id}, ${r.amount})`,
      );
      await tx.$executeRaw`
        UPDATE service_fee_bills
        SET status = 'UNPAID'::"PaymentStatus",
            voided_by_exit = false,
            amount = v.amount,
            paid_amount = 0,
            updated_at = NOW()
        FROM (VALUES ${Prisma.join(rows)}) AS v(id, amount)
        WHERE service_fee_bills.id = v.id
      `;
    }
    const serviceBillsRestored = serviceBillUpdates.length;

    // --- Restore rows reduced by the half-month rule on exit ---
    const statusFor = (paid: number, effectiveFee: number) =>
      paid >= effectiveFee ? "PAID" : paid > 0 ? "PARTIAL" : "UNPAID";

    const proratedTuitions = await tx.tuition.findMany({
      where: { studentId: student.id, proratedByExit: true },
      select: {
        id: true,
        paidAmount: true,
        discountAmount: true,
        scholarshipAmount: true,
        classAcademic: {
          select: {
            paymentFrequency: true,
            monthlyFee: true,
            quarterlyFee: true,
            semesterFee: true,
          },
        },
      },
    });
    let proratedRestored = 0;
    for (const t of proratedTuitions) {
      const c = t.classAcademic;
      const fee =
        c.paymentFrequency === "MONTHLY"
          ? c.monthlyFee
          : c.paymentFrequency === "QUARTERLY"
            ? c.quarterlyFee
            : c.semesterFee;
      if (fee == null) continue; // data inconsistent — skip
      const effective = Math.max(
        Number(fee) - Number(t.discountAmount) - Number(t.scholarshipAmount),
        0,
      );
      await tx.tuition.update({
        where: { id: t.id },
        data: {
          feeAmount: fee,
          status: statusFor(Number(t.paidAmount), effective),
          proratedByExit: false,
        },
      });
      proratedRestored++;
    }

    const proratedFeeBills = await tx.feeBill.findMany({
      where: { studentId: student.id, proratedByExit: true },
      select: {
        id: true,
        feeServiceId: true,
        period: true,
        year: true,
        paidAmount: true,
      },
    });
    for (const bill of proratedFeeBills) {
      const prices =
        pricesByService.get(bill.feeServiceId) ??
        (await tx.feeServicePrice.findMany({
          where: { feeServiceId: bill.feeServiceId },
        }));
      pricesByService.set(bill.feeServiceId, prices);
      let amount: Prisma.Decimal;
      try {
        amount = resolvePriceForPeriod(prices, bill.period, bill.year);
      } catch (err) {
        if (err instanceof NoPriceForPeriodError) continue;
        throw err;
      }
      await tx.feeBill.update({
        where: { id: bill.id },
        data: {
          amount,
          status: statusFor(Number(bill.paidAmount), Number(amount)),
          proratedByExit: false,
        },
      });
      proratedRestored++;
    }

    const proratedServiceBills = await tx.serviceFeeBill.findMany({
      where: { studentId: student.id, proratedByExit: true },
      select: {
        id: true,
        paidAmount: true,
        serviceFee: { select: { amount: true, isActive: true } },
      },
    });
    for (const bill of proratedServiceBills) {
      if (!bill.serviceFee || !bill.serviceFee.isActive) continue;
      const amount = new Prisma.Decimal(bill.serviceFee.amount);
      await tx.serviceFeeBill.update({
        where: { id: bill.id },
        data: {
          amount,
          status: statusFor(Number(bill.paidAmount), Number(amount)),
          proratedByExit: false,
        },
      });
      proratedRestored++;
    }

    await tx.student.update({
      where: { id: student.id },
      data: { exitedAt: null, exitReason: null, exitedBy: null },
    });

    return {
      restoredCount:
        restoredCount +
        feeBillsRestored +
        serviceBillsRestored +
        proratedRestored,
    };
  });
}
