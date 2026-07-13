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
});
