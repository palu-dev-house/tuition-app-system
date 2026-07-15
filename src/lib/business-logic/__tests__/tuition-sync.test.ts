import { describe, expect, it } from "vitest";
import {
  planOrphanedServiceFeeBillDeletion,
  planTuitionSync,
} from "../tuition-sync";

const academicYear = {
  startDate: new Date("2026-06-30"),
  endDate: new Date("2027-06-29"),
};

const classB = {
  id: "class-b",
  paymentFrequency: "MONTHLY" as const,
  monthlyFee: 850000,
  quarterlyFee: null,
  semesterFee: null,
  academicYear,
};

const student = {
  id: "student-1",
  startJoinDate: new Date("2025-07-01"),
  exitedAt: null,
};

function existingTuition(
  overrides: Partial<{
    id: string;
    classAcademicId: string;
    studentId: string;
    period: string;
    year: number;
    status: "UNPAID" | "PAID" | "PARTIAL" | "VOID";
  }> = {},
) {
  return {
    id: "tuition-1",
    classAcademicId: "class-a",
    studentId: "student-1",
    period: "JULY",
    year: 2026,
    status: "UNPAID" as const,
    ...overrides,
  };
}

describe("planTuitionSync", () => {
  it("generates a full year of monthly tuitions for a fresh assignment", () => {
    const plan = planTuitionSync({
      classAcademic: classB,
      students: [student],
      assignments: [
        { studentId: "student-1", classAcademicId: "class-b" },
        { studentId: "student-2", classAcademicId: "class-b" },
      ],
      existingTuitions: [],
      discounts: [],
    });

    expect(plan.toDelete).toEqual([]);
    expect(plan.toCreate).toHaveLength(12);
    expect(plan.toCreate[0]).toMatchObject({
      classAcademicId: "class-b",
      studentId: "student-1",
      period: "JULY",
      year: 2026,
      feeAmount: 850000,
      status: "UNPAID",
    });
  });

  it("creates nothing when the class has no fee configured", () => {
    const plan = planTuitionSync({
      classAcademic: { ...classB, monthlyFee: null },
      students: [student],
      assignments: [
        { studentId: "student-1", classAcademicId: "class-b" },
        { studentId: "student-2", classAcademicId: "class-b" },
      ],
      existingTuitions: [],
      discounts: [],
    });

    expect(plan.toCreate).toEqual([]);
    expect(plan.toDelete).toEqual([]);
  });

  it("deletes unpaid tuitions from classes the student is no longer assigned to", () => {
    const plan = planTuitionSync({
      classAcademic: classB,
      students: [student],
      assignments: [
        { studentId: "student-1", classAcademicId: "class-b" },
        { studentId: "student-2", classAcademicId: "class-b" },
      ], // no longer in class-a
      existingTuitions: [
        existingTuition({ id: "t-jul", period: "JULY", status: "UNPAID" }),
        existingTuition({ id: "t-aug", period: "AUGUST", status: "UNPAID" }),
      ],
      discounts: [],
    });

    expect(plan.toDelete).toEqual(["t-jul", "t-aug"]);
    // Unpaid periods are regenerated in the new class
    const periods = plan.toCreate.map((t) => t.period);
    expect(periods).toContain("JULY");
    expect(periods).toContain("AUGUST");
    expect(plan.toCreate).toHaveLength(12);
  });

  it("keeps paid tuitions from the old class and does not regenerate those periods", () => {
    const plan = planTuitionSync({
      classAcademic: classB,
      students: [student],
      assignments: [
        { studentId: "student-1", classAcademicId: "class-b" },
        { studentId: "student-2", classAcademicId: "class-b" },
      ],
      existingTuitions: [
        existingTuition({ id: "t-jul", period: "JULY", status: "PAID" }),
        existingTuition({ id: "t-aug", period: "AUGUST", status: "PARTIAL" }),
        existingTuition({ id: "t-sep", period: "SEPTEMBER", status: "UNPAID" }),
      ],
      discounts: [],
    });

    // Paid/partial are never deleted, unpaid orphan is
    expect(plan.toDelete).toEqual(["t-sep"]);
    const periods = plan.toCreate.map((t) => t.period);
    expect(periods).not.toContain("JULY");
    expect(periods).not.toContain("AUGUST");
    expect(periods).toContain("SEPTEMBER");
    expect(plan.toCreate).toHaveLength(10);
  });

  it("does not delete unpaid tuitions of a class the student is still assigned to", () => {
    const plan = planTuitionSync({
      classAcademic: classB,
      students: [student],
      assignments: [
        { studentId: "student-1", classAcademicId: "class-a" },
        { studentId: "student-1", classAcademicId: "class-b" },
      ],
      existingTuitions: [
        existingTuition({ id: "t-jul", period: "JULY", status: "UNPAID" }),
      ],
      discounts: [],
    });

    expect(plan.toDelete).toEqual([]);
  });

  it("tracks assignments per student, not globally across the batch", () => {
    // student-1 is still assigned to class-a; student-2 is not.
    const plan = planTuitionSync({
      classAcademic: classB,
      students: [
        student,
        {
          id: "student-2",
          startJoinDate: new Date("2025-07-01"),
          exitedAt: null,
        },
      ],
      assignments: [
        { studentId: "student-1", classAcademicId: "class-a" },
        { studentId: "student-1", classAcademicId: "class-b" },
        { studentId: "student-2", classAcademicId: "class-b" },
      ],
      existingTuitions: [
        existingTuition({ id: "t-s1-jul", period: "JULY", status: "UNPAID" }),
        existingTuition({
          id: "t-s2-jul",
          studentId: "student-2",
          period: "JULY",
          status: "UNPAID",
        }),
      ],
      discounts: [],
    });

    // Only student-2's orphaned tuition is deleted
    expect(plan.toDelete).toEqual(["t-s2-jul"]);
  });

  it("does not duplicate tuitions that already exist in the target class", () => {
    const plan = planTuitionSync({
      classAcademic: classB,
      students: [student],
      assignments: [
        { studentId: "student-1", classAcademicId: "class-b" },
        { studentId: "student-2", classAcademicId: "class-b" },
      ],
      existingTuitions: [
        existingTuition({
          id: "t-jul-b",
          classAcademicId: "class-b",
          period: "JULY",
          status: "UNPAID",
        }),
      ],
      discounts: [],
    });

    expect(plan.toDelete).toEqual([]);
    const periods = plan.toCreate.map((t) => t.period);
    expect(periods).not.toContain("JULY");
    expect(plan.toCreate).toHaveLength(11);
  });

  it("prorates from the student's join date within the academic year", () => {
    const plan = planTuitionSync({
      classAcademic: classB,
      students: [
        { ...student, startJoinDate: new Date("2027-01-15") }, // joins in January
      ],
      assignments: [
        { studentId: "student-1", classAcademicId: "class-b" },
        { studentId: "student-2", classAcademicId: "class-b" },
      ],
      existingTuitions: [],
      discounts: [],
    });

    const periods = plan.toCreate.map((t) => t.period);
    expect(periods).toEqual([
      "JANUARY",
      "FEBRUARY",
      "MARCH",
      "APRIL",
      "MAY",
      "JUNE",
    ]);
  });

  it("applies class discounts to generated tuitions", () => {
    const plan = planTuitionSync({
      classAcademic: classB,
      students: [student],
      assignments: [
        { studentId: "student-1", classAcademicId: "class-b" },
        { studentId: "student-2", classAcademicId: "class-b" },
      ],
      existingTuitions: [],
      discounts: [
        {
          id: "disc-1",
          classAcademicId: "class-b",
          discountAmount: 50000,
          targetPeriods: ["JULY"],
        },
      ],
    });

    const july = plan.toCreate.find((t) => t.period === "JULY");
    expect(july).toMatchObject({ discountAmount: 50000, discountId: "disc-1" });
    const august = plan.toCreate.find((t) => t.period === "AUGUST");
    expect(august).toMatchObject({ discountAmount: 0, discountId: null });
  });

  it("handles multiple students in one batch", () => {
    const plan = planTuitionSync({
      classAcademic: classB,
      students: [
        student,
        {
          id: "student-2",
          startJoinDate: new Date("2025-07-01"),
          exitedAt: null,
        },
      ],
      assignments: [
        { studentId: "student-1", classAcademicId: "class-b" },
        { studentId: "student-2", classAcademicId: "class-b" },
      ],
      existingTuitions: [
        existingTuition({
          id: "t-s2-jul",
          studentId: "student-2",
          period: "JULY",
          status: "PAID",
        }),
      ],
      discounts: [],
    });

    const s1Periods = plan.toCreate.filter((t) => t.studentId === "student-1");
    const s2Periods = plan.toCreate.filter((t) => t.studentId === "student-2");
    expect(s1Periods).toHaveLength(12);
    expect(s2Periods).toHaveLength(11); // July already paid elsewhere
  });
});

describe("planTuitionSync edge cases", () => {
  it("creates nothing when the configured fee is zero", () => {
    const plan = planTuitionSync({
      classAcademic: { ...classB, monthlyFee: 0 },
      students: [student],
      assignments: [{ studentId: "student-1", classAcademicId: "class-b" }],
      existingTuitions: [
        existingTuition({ id: "t-jul", period: "JULY", status: "UNPAID" }),
      ],
      discounts: [],
    });

    // No fee -> no changes at all, orphaned rows are also left alone
    expect(plan.toCreate).toEqual([]);
    expect(plan.toDelete).toEqual([]);
  });

  it("creates nothing when the configured fee is negative", () => {
    const plan = planTuitionSync({
      classAcademic: { ...classB, monthlyFee: -850000 },
      students: [student],
      assignments: [{ studentId: "student-1", classAcademicId: "class-b" }],
      existingTuitions: [],
      discounts: [],
    });

    expect(plan.toCreate).toEqual([]);
    expect(plan.toDelete).toEqual([]);
  });

  it("is idempotent: re-running after a full sync plans no changes (double import)", () => {
    const first = planTuitionSync({
      classAcademic: classB,
      students: [student],
      assignments: [{ studentId: "student-1", classAcademicId: "class-b" }],
      existingTuitions: [],
      discounts: [],
    });

    // Simulate the created rows now existing in the DB, then re-import.
    const second = planTuitionSync({
      classAcademic: classB,
      students: [student],
      assignments: [{ studentId: "student-1", classAcademicId: "class-b" }],
      existingTuitions: first.toCreate.map((t, i) => ({
        id: `t-${i}`,
        classAcademicId: t.classAcademicId,
        studentId: t.studentId,
        period: t.period,
        year: t.year,
        status: t.status,
      })),
      discounts: [],
    });

    expect(second.toDelete).toEqual([]);
    expect(second.toCreate).toEqual([]);
  });

  it("deletes duplicate unpaid rows for the same period in an orphaned class and regenerates the period once", () => {
    // Human mistake: a double import created two UNPAID rows for JULY in class-a
    const plan = planTuitionSync({
      classAcademic: classB,
      students: [student],
      assignments: [{ studentId: "student-1", classAcademicId: "class-b" }],
      existingTuitions: [
        existingTuition({ id: "t-jul-dup1", period: "JULY", status: "UNPAID" }),
        existingTuition({ id: "t-jul-dup2", period: "JULY", status: "UNPAID" }),
      ],
      discounts: [],
    });

    expect(plan.toDelete).toEqual(["t-jul-dup1", "t-jul-dup2"]);
    const julyRows = plan.toCreate.filter((t) => t.period === "JULY");
    expect(julyRows).toHaveLength(1);
  });

  it("keeps VOID tuitions in the old class without letting them block regeneration", () => {
    const plan = planTuitionSync({
      classAcademic: classB,
      students: [student],
      assignments: [{ studentId: "student-1", classAcademicId: "class-b" }],
      existingTuitions: [
        existingTuition({ id: "t-jul-void", period: "JULY", status: "VOID" }),
      ],
      discounts: [],
    });

    // VOID is never deleted (audit trail) but its period is regenerated
    expect(plan.toDelete).toEqual([]);
    const periods = plan.toCreate.map((t) => t.period);
    expect(periods).toContain("JULY");
    expect(plan.toCreate).toHaveLength(12);
  });

  it("does not regenerate a period that has a VOID row in the target class (unique constraint)", () => {
    const plan = planTuitionSync({
      classAcademic: classB,
      students: [student],
      assignments: [{ studentId: "student-1", classAcademicId: "class-b" }],
      existingTuitions: [
        existingTuition({
          id: "t-jul-void-b",
          classAcademicId: "class-b",
          period: "JULY",
          status: "VOID",
        }),
      ],
      discounts: [],
    });

    // The row already occupies class+student+period+year in the target class
    expect(plan.toDelete).toEqual([]);
    const periods = plan.toCreate.map((t) => t.period);
    expect(periods).not.toContain("JULY");
    expect(plan.toCreate).toHaveLength(11);
  });

  it("does not let a paid period from another year block the same period in this year", () => {
    const plan = planTuitionSync({
      classAcademic: classB,
      students: [student],
      assignments: [{ studentId: "student-1", classAcademicId: "class-b" }],
      existingTuitions: [
        // Same period name, previous academic year
        existingTuition({
          id: "t-jul-2025",
          period: "JULY",
          year: 2025,
          status: "PAID",
        }),
      ],
      discounts: [],
    });

    const july = plan.toCreate.filter((t) => t.period === "JULY");
    expect(july).toHaveLength(1);
    expect(july[0]?.year).toBe(2026);
  });

  it("generates no tuitions for a student who joins after the academic year ends", () => {
    const plan = planTuitionSync({
      classAcademic: classB,
      students: [{ ...student, startJoinDate: new Date("2027-08-01") }],
      assignments: [{ studentId: "student-1", classAcademicId: "class-b" }],
      existingTuitions: [],
      discounts: [],
    });

    expect(plan.toCreate).toEqual([]);
  });

  it("stops generating periods after the student's exit date", () => {
    const plan = planTuitionSync({
      classAcademic: classB,
      students: [{ ...student, exitedAt: new Date("2026-12-15") }],
      assignments: [{ studentId: "student-1", classAcademicId: "class-b" }],
      existingTuitions: [],
      discounts: [],
    });

    const periods = plan.toCreate.map((t) => t.period);
    expect(periods).toEqual([
      "JULY",
      "AUGUST",
      "SEPTEMBER",
      "OCTOBER",
      "NOVEMBER",
      "DECEMBER",
    ]);
  });

  it("plans deletions of orphaned tuitions even when the student batch is empty", () => {
    const plan = planTuitionSync({
      classAcademic: classB,
      students: [],
      assignments: [{ studentId: "student-1", classAcademicId: "class-b" }],
      existingTuitions: [
        existingTuition({ id: "t-jul", period: "JULY", status: "UNPAID" }),
      ],
      discounts: [],
    });

    expect(plan.toDelete).toEqual(["t-jul"]);
    expect(plan.toCreate).toEqual([]);
  });
});

describe("planTuitionSync payment frequencies", () => {
  it("falls back to monthlyFee * 3 for quarterly classes without a quarterly fee", () => {
    const plan = planTuitionSync({
      classAcademic: {
        ...classB,
        id: "class-q",
        paymentFrequency: "QUARTERLY" as const,
        quarterlyFee: null,
      },
      students: [student],
      assignments: [{ studentId: "student-1", classAcademicId: "class-q" }],
      existingTuitions: [],
      discounts: [],
    });

    expect(plan.toCreate).toHaveLength(4);
    expect(plan.toCreate.map((t) => t.period)).toEqual([
      "Q1",
      "Q2",
      "Q3",
      "Q4",
    ]);
    for (const t of plan.toCreate) {
      expect(t.feeAmount).toBe(850000 * 3);
    }
    // Q3/Q4 fall in the second calendar year of the academic year
    expect(plan.toCreate.map((t) => t.year)).toEqual([2026, 2026, 2027, 2027]);
  });

  it("generates two semester tuitions using the explicit semester fee", () => {
    const plan = planTuitionSync({
      classAcademic: {
        ...classB,
        id: "class-s",
        paymentFrequency: "SEMESTER" as const,
        semesterFee: 4800000,
      },
      students: [student],
      assignments: [{ studentId: "student-1", classAcademicId: "class-s" }],
      existingTuitions: [],
      discounts: [],
    });

    expect(plan.toCreate).toHaveLength(2);
    expect(plan.toCreate.map((t) => t.period)).toEqual(["SEM1", "SEM2"]);
    for (const t of plan.toCreate) {
      expect(t.feeAmount).toBe(4800000);
    }
  });
});

describe("planTuitionSync scholarships", () => {
  it("applies the student's scholarship for the target class to generated tuitions", () => {
    const plan = planTuitionSync({
      classAcademic: classB,
      students: [student],
      assignments: [{ studentId: "student-1", classAcademicId: "class-b" }],
      existingTuitions: [],
      discounts: [],
      scholarships: [{ studentId: "student-1", nominal: 100000 }],
    });

    expect(plan.toCreate).toHaveLength(12);
    for (const t of plan.toCreate) {
      expect(t.scholarshipAmount).toBe(100000);
      expect(t.status).toBe("UNPAID"); // partial scholarship stays unpaid
    }
  });

  it("marks tuitions PAID when scholarship covers the full fee", () => {
    const plan = planTuitionSync({
      classAcademic: classB,
      students: [student],
      assignments: [{ studentId: "student-1", classAcademicId: "class-b" }],
      existingTuitions: [],
      discounts: [],
      scholarships: [{ studentId: "student-1", nominal: 850000 }],
    });

    for (const t of plan.toCreate) {
      expect(t.scholarshipAmount).toBe(850000);
      expect(t.status).toBe("PAID");
    }
  });

  it("sums multiple scholarships for the same student", () => {
    const plan = planTuitionSync({
      classAcademic: classB,
      students: [student],
      assignments: [{ studentId: "student-1", classAcademicId: "class-b" }],
      existingTuitions: [],
      discounts: [],
      scholarships: [
        { studentId: "student-1", nominal: 400000 },
        { studentId: "student-1", nominal: 450000 },
      ],
    });

    for (const t of plan.toCreate) {
      expect(t.scholarshipAmount).toBe(850000);
      expect(t.status).toBe("PAID");
    }
  });

  it("marks tuitions PAID when the scholarship exceeds the fee", () => {
    // Human mistake: scholarship entered larger than the class fee
    const plan = planTuitionSync({
      classAcademic: classB,
      students: [student],
      assignments: [{ studentId: "student-1", classAcademicId: "class-b" }],
      existingTuitions: [],
      discounts: [],
      scholarships: [{ studentId: "student-1", nominal: 1000000 }],
    });

    for (const t of plan.toCreate) {
      expect(t.scholarshipAmount).toBe(1000000);
      expect(t.status).toBe("PAID");
    }
  });

  it("marks a tuition PAID when scholarship plus discount cover the fee", () => {
    const plan = planTuitionSync({
      classAcademic: classB,
      students: [student],
      assignments: [{ studentId: "student-1", classAcademicId: "class-b" }],
      existingTuitions: [],
      discounts: [
        {
          id: "disc-1",
          classAcademicId: "class-b",
          discountAmount: 100000,
          targetPeriods: ["JULY"],
        },
      ],
      scholarships: [{ studentId: "student-1", nominal: 750000 }],
    });

    const july = plan.toCreate.find((t) => t.period === "JULY");
    expect(july).toMatchObject({
      discountAmount: 100000,
      scholarshipAmount: 750000,
      status: "PAID",
    });
    // Other periods have no discount, so the scholarship alone is not enough
    const august = plan.toCreate.find((t) => t.period === "AUGUST");
    expect(august?.status).toBe("UNPAID");
  });

  it("leaves a tuition UNPAID when a discount alone covers the full fee", () => {
    // Current behavior: only scholarships can auto-mark rows PAID. Note that
    // applyDiscountToTuitions (discount-processor) marks effectiveFee === 0
    // rows PAID, so a full-fee discount behaves differently depending on
    // whether it existed before or after the assignment sync ran.
    const plan = planTuitionSync({
      classAcademic: classB,
      students: [student],
      assignments: [{ studentId: "student-1", classAcademicId: "class-b" }],
      existingTuitions: [],
      discounts: [
        {
          id: "disc-full",
          classAcademicId: "class-b",
          discountAmount: 850000,
          targetPeriods: ["JULY"],
        },
      ],
    });

    const july = plan.toCreate.find((t) => t.period === "JULY");
    expect(july).toMatchObject({ discountAmount: 850000, status: "UNPAID" });
  });

  it("leaves students without scholarships untouched", () => {
    const plan = planTuitionSync({
      classAcademic: classB,
      students: [student],
      assignments: [{ studentId: "student-1", classAcademicId: "class-b" }],
      existingTuitions: [],
      discounts: [],
      scholarships: [{ studentId: "someone-else", nominal: 850000 }],
    });

    for (const t of plan.toCreate) {
      expect(t.scholarshipAmount).toBe(0);
      expect(t.status).toBe("UNPAID");
    }
  });
});

describe("planOrphanedServiceFeeBillDeletion", () => {
  it("deletes unpaid service fee bills of classes the student left, keeps paid ones", () => {
    const toDelete = planOrphanedServiceFeeBillDeletion(
      [
        {
          id: "sfb-1",
          studentId: "student-1",
          classAcademicId: "class-a",
          status: "UNPAID",
        },
        {
          id: "sfb-2",
          studentId: "student-1",
          classAcademicId: "class-a",
          status: "PAID",
        },
        {
          id: "sfb-3",
          studentId: "student-1",
          classAcademicId: "class-b",
          status: "UNPAID",
        },
      ],
      [{ studentId: "student-1", classAcademicId: "class-b" }],
    );

    expect(toDelete).toEqual(["sfb-1"]);
  });

  it("keeps bills of classes the student is still assigned to", () => {
    const toDelete = planOrphanedServiceFeeBillDeletion(
      [
        {
          id: "sfb-1",
          studentId: "student-1",
          classAcademicId: "class-a",
          status: "UNPAID",
        },
      ],
      [
        { studentId: "student-1", classAcademicId: "class-a" },
        { studentId: "student-1", classAcademicId: "class-b" },
      ],
    );

    expect(toDelete).toEqual([]);
  });

  it("keeps PARTIAL and VOID bills of classes the student left", () => {
    const toDelete = planOrphanedServiceFeeBillDeletion(
      [
        {
          id: "sfb-partial",
          studentId: "student-1",
          classAcademicId: "class-a",
          status: "PARTIAL",
        },
        {
          id: "sfb-void",
          studentId: "student-1",
          classAcademicId: "class-a",
          status: "VOID",
        },
        {
          id: "sfb-unpaid",
          studentId: "student-1",
          classAcademicId: "class-a",
          status: "UNPAID",
        },
      ],
      [{ studentId: "student-1", classAcademicId: "class-b" }],
    );

    expect(toDelete).toEqual(["sfb-unpaid"]);
  });

  it("tracks assignments per student across a batch", () => {
    const toDelete = planOrphanedServiceFeeBillDeletion(
      [
        {
          id: "sfb-s1",
          studentId: "student-1",
          classAcademicId: "class-a",
          status: "UNPAID",
        },
        {
          id: "sfb-s2",
          studentId: "student-2",
          classAcademicId: "class-a",
          status: "UNPAID",
        },
      ],
      [
        { studentId: "student-1", classAcademicId: "class-a" },
        { studentId: "student-2", classAcademicId: "class-b" },
      ],
    );

    expect(toDelete).toEqual(["sfb-s2"]);
  });
});
