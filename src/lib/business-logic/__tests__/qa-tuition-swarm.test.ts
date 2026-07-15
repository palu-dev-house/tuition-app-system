/**
 * QA swarm suite for the tuition lifecycle:
 *  - tuition generation (12 months, July -> June)
 *  - student re-assignment (move semantics: unpaid regenerated, paid kept)
 *  - scholarship (re-)application
 *
 * Core invariant everywhere: PAID/PARTIAL rows are never deleted, never
 * regenerated, and never updated by a scholarship re-apply.
 *
 * The swarm section runs hundreds of seeded random scenarios through the
 * pure planners and asserts the invariants hold on every one.
 */
import { describe, expect, it } from "vitest";
import {
  planScholarshipUpdates,
  type ScholarshipTuitionInput,
} from "../scholarship-processor";
import { getPeriodStart, isPeriodAfterExit } from "../student-exit";
import { generateTuitions, PERIODS } from "../tuition-generator";
import { planTuitionSync, type SyncExistingTuition } from "../tuition-sync";

const academicYear = {
  startDate: new Date("2026-06-30"),
  endDate: new Date("2027-06-29"),
};

const MONTHS = PERIODS.MONTHLY as readonly string[];

function makeClass(id: string, monthlyFee = 585000) {
  return {
    id,
    paymentFrequency: "MONTHLY" as const,
    monthlyFee,
    quarterlyFee: null,
    semesterFee: null,
    academicYear,
  };
}

const enrolledStudent = {
  id: "student-1",
  startJoinDate: new Date("2026-07-06"),
  exitedAt: null,
};

// ============================================
// 1. Tuition generation
// ============================================

describe("QA: tuition generation", () => {
  it("generates exactly 12 tuitions from JULY to JUNE for a July joiner", () => {
    const tuitions = generateTuitions({
      classAcademicId: "class-a",
      frequency: "MONTHLY",
      feeAmount: 585000,
      students: [enrolledStudent],
      academicYear,
    });

    expect(tuitions.map((t) => t.period)).toEqual([...MONTHS]);
    expect(tuitions).toHaveLength(12);
  });

  it("puts JULY-DECEMBER in the start year and JANUARY-JUNE in the next year", () => {
    const tuitions = generateTuitions({
      classAcademicId: "class-a",
      frequency: "MONTHLY",
      feeAmount: 585000,
      students: [enrolledStudent],
      academicYear,
    });

    for (const t of tuitions) {
      const expectedYear = [
        "JULY",
        "AUGUST",
        "SEPTEMBER",
        "OCTOBER",
        "NOVEMBER",
        "DECEMBER",
      ].includes(t.period)
        ? 2026
        : 2027;
      expect(t.year, `${t.period} year`).toBe(expectedYear);
    }
  });

  it("starts from the join month for a mid-year joiner", () => {
    const tuitions = generateTuitions({
      classAcademicId: "class-a",
      frequency: "MONTHLY",
      feeAmount: 585000,
      students: [
        {
          id: "late-joiner",
          startJoinDate: new Date("2026-10-05"),
          exitedAt: null,
        },
      ],
      academicYear,
    });

    expect(tuitions[0].period).toBe("OCTOBER");
    expect(tuitions).toHaveLength(9); // Oct..Jun
  });
});

// ============================================
// 2. Re-assignment (move semantics)
// ============================================

describe("QA: student re-assignment", () => {
  const oldClassRows = (
    statuses: Record<string, SyncExistingTuition["status"]>,
  ) =>
    MONTHS.map((period, i) => ({
      id: `old-${period}`,
      classAcademicId: "class-old",
      studentId: "student-1",
      period,
      year: i < 6 ? 2026 : 2027,
      status: statuses[period] ?? ("UNPAID" as const),
    }));

  it("moves all 12 months when nothing is paid in the old class", () => {
    const plan = planTuitionSync({
      classAcademic: makeClass("class-new"),
      students: [enrolledStudent],
      assignments: [{ studentId: "student-1", classAcademicId: "class-new" }],
      existingTuitions: oldClassRows({}),
      discounts: [],
    });

    expect(plan.toDelete).toHaveLength(12);
    expect(plan.toCreate).toHaveLength(12);
    expect(plan.toCreate.map((t) => t.period)).toEqual([...MONTHS]);
  });

  it("never deletes or regenerates PAID periods (only paid, no update)", () => {
    const plan = planTuitionSync({
      classAcademic: makeClass("class-new"),
      students: [enrolledStudent],
      assignments: [{ studentId: "student-1", classAcademicId: "class-new" }],
      existingTuitions: oldClassRows({ JULY: "PAID", AUGUST: "PARTIAL" }),
      discounts: [],
    });

    // PAID/PARTIAL rows survive in the old class...
    expect(plan.toDelete).not.toContain("old-JULY");
    expect(plan.toDelete).not.toContain("old-AUGUST");
    expect(plan.toDelete).toHaveLength(10);
    // ...and their periods are not re-billed in the new class.
    const createdPeriods = plan.toCreate.map((t) => t.period);
    expect(createdPeriods).not.toContain("JULY");
    expect(createdPeriods).not.toContain("AUGUST");
    expect(plan.toCreate).toHaveLength(10);
  });

  it("re-assigning back to the same class is a no-op", () => {
    const plan = planTuitionSync({
      classAcademic: makeClass("class-old"),
      students: [enrolledStudent],
      assignments: [{ studentId: "student-1", classAcademicId: "class-old" }],
      existingTuitions: oldClassRows({ JULY: "PAID" }),
      discounts: [],
    });

    expect(plan.toDelete).toEqual([]);
    expect(plan.toCreate).toEqual([]);
  });

  it("applies the target-class scholarship to regenerated rows; full scholarship -> PAID", () => {
    const plan = planTuitionSync({
      classAcademic: makeClass("class-new", 585000),
      students: [enrolledStudent],
      assignments: [{ studentId: "student-1", classAcademicId: "class-new" }],
      existingTuitions: oldClassRows({}),
      discounts: [],
      scholarships: [{ studentId: "student-1", nominal: 585000 }],
    });

    expect(plan.toCreate).toHaveLength(12);
    for (const t of plan.toCreate) {
      expect(t.scholarshipAmount).toBe(585000);
      expect(t.status).toBe("PAID");
    }
  });

  it("partial scholarship keeps regenerated rows UNPAID with the amount recorded", () => {
    const plan = planTuitionSync({
      classAcademic: makeClass("class-new", 585000),
      students: [enrolledStudent],
      assignments: [{ studentId: "student-1", classAcademicId: "class-new" }],
      existingTuitions: oldClassRows({}),
      discounts: [],
      scholarships: [{ studentId: "student-1", nominal: 200000 }],
    });

    for (const t of plan.toCreate) {
      expect(t.scholarshipAmount).toBe(200000);
      expect(t.status).toBe("UNPAID");
    }
  });
});

// ============================================
// 3. Scholarship re-apply
// ============================================

describe("QA: scholarship re-apply", () => {
  const tuition = (
    overrides: Partial<ScholarshipTuitionInput> = {},
  ): ScholarshipTuitionInput => ({
    id: "t-1",
    feeAmount: 585000,
    paidAmount: 0,
    discountAmount: 0,
    ...overrides,
  });

  it("full scholarship marks unpaid tuitions PAID", () => {
    const groups = planScholarshipUpdates([tuition()], 585000);
    expect(groups).toEqual([{ status: "PAID", tuitionIds: ["t-1"] }]);
  });

  it("partial scholarship keeps untouched tuitions UNPAID", () => {
    const groups = planScholarshipUpdates([tuition()], 200000);
    expect(groups).toEqual([{ status: "UNPAID", tuitionIds: ["t-1"] }]);
  });

  it("re-apply with a smaller nominal can demote PARTIAL back from covered", () => {
    // paid 100k of an effective 385k fee -> stays PARTIAL
    const groups = planScholarshipUpdates(
      [tuition({ paidAmount: 100000 })],
      200000,
    );
    expect(groups).toEqual([{ status: "PARTIAL", tuitionIds: ["t-1"] }]);
  });

  it("scholarship + discount together can fully cover the fee", () => {
    const groups = planScholarshipUpdates(
      [tuition({ discountAmount: 385000 })],
      200000,
    );
    expect(groups).toEqual([{ status: "PAID", tuitionIds: ["t-1"] }]);
  });

  it("someone who already paid at least the effective fee ends up PAID, never reduced", () => {
    const groups = planScholarshipUpdates(
      [tuition({ paidAmount: 585000 })],
      200000,
    );
    expect(groups).toEqual([{ status: "PAID", tuitionIds: ["t-1"] }]);
  });
});

// ============================================
// 4. Randomized swarm — invariants over many scenarios
// ============================================

// Deterministic PRNG so failures are reproducible.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STATUSES: SyncExistingTuition["status"][] = [
  "UNPAID",
  "PAID",
  "PARTIAL",
  "VOID",
];

describe("QA swarm: re-assignment invariants hold across random scenarios", () => {
  it("500 seeded scenarios: paid rows untouched, no duplicates, full coverage", () => {
    const rand = mulberry32(20260715);

    for (let run = 0; run < 500; run++) {
      const studentCount = 1 + Math.floor(rand() * 4);
      const students = Array.from({ length: studentCount }, (_, i) => ({
        id: `s-${i}`,
        startJoinDate: new Date("2026-07-06"),
        exitedAt: null,
      }));

      // Random existing tuitions spread across an old class and the target.
      const existingTuitions: SyncExistingTuition[] = [];
      for (const s of students) {
        for (const [i, period] of MONTHS.entries()) {
          if (rand() < 0.6) {
            const inTarget = rand() < 0.3;
            existingTuitions.push({
              id: `${s.id}-${inTarget ? "new" : "old"}-${period}`,
              classAcademicId: inTarget ? "class-new" : "class-old",
              studentId: s.id,
              period,
              year: i < 6 ? 2026 : 2027,
              status: STATUSES[Math.floor(rand() * STATUSES.length)],
            });
          }
        }
      }

      const scholarships =
        rand() < 0.4
          ? students
              .filter(() => rand() < 0.5)
              .map((s) => ({
                studentId: s.id,
                nominal: rand() < 0.5 ? 585000 : 200000,
              }))
          : [];

      const plan = planTuitionSync({
        classAcademic: makeClass("class-new", 585000),
        students,
        // Everyone has been moved to class-new (move semantics applied).
        assignments: students.map((s) => ({
          studentId: s.id,
          classAcademicId: "class-new",
        })),
        existingTuitions,
        discounts: [],
        scholarships,
      });

      const byId = new Map(existingTuitions.map((t) => [t.id, t]));
      const deleteSet = new Set(plan.toDelete);
      const context = `run=${run}`;

      // Invariant 1: only UNPAID rows from classes the student left get deleted.
      for (const id of plan.toDelete) {
        const row = byId.get(id);
        expect(row, context).toBeDefined();
        expect(row!.status, `${context} deleted ${id} must be UNPAID`).toBe(
          "UNPAID",
        );
        expect(
          row!.classAcademicId,
          `${context} deleted ${id} must be orphaned`,
        ).toBe("class-old");
      }

      // Invariant 2: nothing created duplicates a surviving row in the target
      // class, or a surviving billed/paid (non-VOID) period anywhere.
      const surviving = existingTuitions.filter((t) => !deleteSet.has(t.id));
      const blocked = new Set(
        surviving
          .filter(
            (t) => t.classAcademicId === "class-new" || t.status !== "VOID",
          )
          .map((t) => `${t.studentId}-${t.period}-${t.year}`),
      );
      for (const c of plan.toCreate) {
        const key = `${c.studentId}-${c.period}-${c.year}`;
        expect(blocked.has(key), `${context} created blocked ${key}`).toBe(
          false,
        );
      }
      const createdKeys = plan.toCreate.map(
        (c) => `${c.studentId}-${c.period}-${c.year}`,
      );
      expect(new Set(createdKeys).size, context).toBe(createdKeys.length);

      // Invariant 3: full coverage — after the plan, every month of every
      // student is billed somewhere (created, surviving in target, or a
      // surviving billed/paid row in the old class).
      for (const s of students) {
        for (const [i, period] of MONTHS.entries()) {
          const year = i < 6 ? 2026 : 2027;
          const key = `${s.id}-${period}-${year}`;
          const covered = createdKeys.includes(key) || blocked.has(key);
          expect(covered, `${context} uncovered ${key}`).toBe(true);
        }
      }

      // Invariant 4: scholarship handling on created rows.
      const scholarshipByStudent = new Map<string, number>();
      for (const sch of scholarships) {
        scholarshipByStudent.set(
          sch.studentId,
          (scholarshipByStudent.get(sch.studentId) ?? 0) + sch.nominal,
        );
      }
      for (const c of plan.toCreate) {
        const nominal = scholarshipByStudent.get(c.studentId) ?? 0;
        expect(c.scholarshipAmount, context).toBe(nominal);
        const expectPaid = nominal > 0 && c.feeAmount - nominal <= 0;
        expect(c.status, context).toBe(expectPaid ? "PAID" : "UNPAID");
      }
    }
  });
});

describe("QA swarm: scholarship re-apply invariants across random scenarios", () => {
  it("500 seeded scenarios: grouping is a partition and statuses are consistent", () => {
    const rand = mulberry32(8124);

    for (let run = 0; run < 500; run++) {
      const count = 1 + Math.floor(rand() * 12);
      const tuitions: ScholarshipTuitionInput[] = Array.from(
        { length: count },
        (_, i) => {
          const feeAmount = 100000 + Math.floor(rand() * 10) * 50000;
          return {
            id: `t-${i}`,
            feeAmount,
            paidAmount: rand() < 0.5 ? Math.floor(rand() * feeAmount * 1.2) : 0,
            discountAmount:
              rand() < 0.3 ? Math.floor(rand() * feeAmount * 0.5) : 0,
          };
        },
      );
      const nominal = Math.floor(rand() * 700000);

      const groups = planScholarshipUpdates(tuitions, nominal);
      const context = `run=${run}`;

      // Partition: every tuition lands in exactly one group.
      const allIds = groups.flatMap((g) => g.tuitionIds);
      expect(new Set(allIds).size, context).toBe(tuitions.length);
      expect(allIds.length, context).toBe(tuitions.length);

      // Status consistency with the effective fee formula.
      const statusOf = new Map<string, string>();
      for (const g of groups)
        for (const id of g.tuitionIds) statusOf.set(id, g.status);
      for (const t of tuitions) {
        const effectiveFee = Math.max(
          t.feeAmount - nominal - t.discountAmount,
          0,
        );
        const expected =
          t.paidAmount >= effectiveFee
            ? "PAID"
            : t.paidAmount > 0
              ? "PARTIAL"
              : "UNPAID";
        expect(statusOf.get(t.id), `${context} ${t.id}`).toBe(expected);
      }
    }
  });
});

// ============================================
// 5. Mid-year join and student exit
// ============================================

describe("QA: mid-year join and exit in re-assignment sync", () => {
  it("mid-year joiner (October) gets only Oct-Jun on assignment", () => {
    const plan = planTuitionSync({
      classAcademic: makeClass("class-new"),
      students: [
        {
          id: "student-1",
          startJoinDate: new Date("2026-10-12"),
          exitedAt: null,
        },
      ],
      assignments: [{ studentId: "student-1", classAcademicId: "class-new" }],
      existingTuitions: [],
      discounts: [],
    });

    expect(plan.toCreate.map((t) => t.period)).toEqual([
      "OCTOBER",
      "NOVEMBER",
      "DECEMBER",
      "JANUARY",
      "FEBRUARY",
      "MARCH",
      "APRIL",
      "MAY",
      "JUNE",
    ]);
  });

  it("re-assigning a mid-year joiner never creates months before the join month", () => {
    const plan = planTuitionSync({
      classAcademic: makeClass("class-new"),
      students: [
        {
          id: "student-1",
          startJoinDate: new Date("2027-02-01"),
          exitedAt: null,
        },
      ],
      assignments: [{ studentId: "student-1", classAcademicId: "class-new" }],
      existingTuitions: [
        {
          id: "old-feb",
          classAcademicId: "class-old",
          studentId: "student-1",
          period: "FEBRUARY",
          year: 2027,
          status: "PAID",
        },
        {
          id: "old-mar",
          classAcademicId: "class-old",
          studentId: "student-1",
          period: "MARCH",
          year: 2027,
          status: "UNPAID",
        },
      ],
      discounts: [],
    });

    // PAID February survives, unpaid March moves; Feb is never re-billed.
    expect(plan.toDelete).toEqual(["old-mar"]);
    expect(plan.toCreate.map((t) => t.period)).toEqual([
      "MARCH",
      "APRIL",
      "MAY",
      "JUNE",
    ]);
  });

  it("exited student gets no periods after the exit month", () => {
    const plan = planTuitionSync({
      classAcademic: makeClass("class-new"),
      students: [
        {
          id: "student-1",
          startJoinDate: new Date("2026-07-06"),
          exitedAt: new Date("2026-11-15"),
        },
      ],
      assignments: [{ studentId: "student-1", classAcademicId: "class-new" }],
      existingTuitions: [],
      discounts: [],
    });

    // July..November only — December onwards starts after the exit date.
    expect(plan.toCreate.map((t) => t.period)).toEqual([
      "JULY",
      "AUGUST",
      "SEPTEMBER",
      "OCTOBER",
      "NOVEMBER",
    ]);
  });

  it("student who joined after the academic year ended gets nothing", () => {
    const plan = planTuitionSync({
      classAcademic: makeClass("class-new"),
      students: [
        {
          id: "student-1",
          startJoinDate: new Date("2027-08-01"),
          exitedAt: null,
        },
      ],
      assignments: [{ studentId: "student-1", classAcademicId: "class-new" }],
      existingTuitions: [],
      discounts: [],
    });

    expect(plan.toCreate).toEqual([]);
  });
});

describe("QA: exit voiding period math (isPeriodAfterExit)", () => {
  it("keeps the exit month billed and voids strictly later months", () => {
    const exit = new Date(2026, 10, 15); // Nov 15, 2026
    expect(isPeriodAfterExit("NOVEMBER", 2026, "MONTHLY", exit)).toBe(false);
    expect(isPeriodAfterExit("DECEMBER", 2026, "MONTHLY", exit)).toBe(true);
    expect(isPeriodAfterExit("OCTOBER", 2026, "MONTHLY", exit)).toBe(false);
    // Second-semester rows carry the next calendar year.
    expect(isPeriodAfterExit("JANUARY", 2027, "MONTHLY", exit)).toBe(true);
  });

  it("handles quarterly and semester periods", () => {
    const exit = new Date(2026, 10, 15); // Nov 15, 2026
    expect(isPeriodAfterExit("Q2", 2026, "QUARTERLY", exit)).toBe(false); // starts Oct 1
    expect(isPeriodAfterExit("Q3", 2027, "QUARTERLY", exit)).toBe(true); // starts Jan 1
    expect(isPeriodAfterExit("SEM1", 2026, "SEMESTER", exit)).toBe(false);
    expect(isPeriodAfterExit("SEM2", 2027, "SEMESTER", exit)).toBe(true);
  });

  it("exit exactly on a period start keeps that period", () => {
    const exit = new Date(2026, 11, 1); // Dec 1, 2026 00:00
    expect(isPeriodAfterExit("DECEMBER", 2026, "MONTHLY", exit)).toBe(false);
    expect(isPeriodAfterExit("JANUARY", 2027, "MONTHLY", exit)).toBe(true);
  });

  it("getPeriodStart rejects unknown periods", () => {
    expect(() => getPeriodStart("SOMEDAY", 2026, "MONTHLY")).toThrow();
    expect(() => getPeriodStart("Q5", 2026, "QUARTERLY")).toThrow();
  });
});

describe("QA swarm: join/exit windows across random scenarios", () => {
  it("500 seeded scenarios: created periods exactly match the enrollment window", () => {
    const rand = mulberry32(11777);

    for (let run = 0; run < 500; run++) {
      // Join in a random academic month (0 = July .. 11 = June), sometimes
      // before the year starts; optional exit in a later academic month.
      const joinIdx = rand() < 0.3 ? -1 : Math.floor(rand() * 12);
      const joinDate =
        joinIdx === -1
          ? new Date("2025-07-01")
          : new Date(
              joinIdx < 6 ? 2026 : 2027,
              (6 + joinIdx) % 12,
              1 + Math.floor(rand() * 27),
            );
      const hasExit = rand() < 0.4;
      const exitIdx = hasExit
        ? Math.max(joinIdx, 0) +
          Math.floor(rand() * (12 - Math.max(joinIdx, 0)))
        : null;
      const exitDate =
        exitIdx === null
          ? null
          : new Date(
              exitIdx < 6 ? 2026 : 2027,
              (6 + exitIdx) % 12,
              1 + Math.floor(rand() * 27),
            );

      const plan = planTuitionSync({
        classAcademic: makeClass("class-new"),
        students: [{ id: "s-0", startJoinDate: joinDate, exitedAt: exitDate }],
        assignments: [{ studentId: "s-0", classAcademicId: "class-new" }],
        existingTuitions: [],
        discounts: [],
      });

      const startIdx = Math.max(joinIdx, 0);
      // A period is generated while its first day is not after the exit date.
      const expected = MONTHS.filter((_, i) => {
        if (i < startIdx) return false;
        if (!exitDate) return true;
        const periodStart = new Date(i < 6 ? 2026 : 2027, (6 + i) % 12, 1);
        return periodStart.getTime() <= exitDate.getTime();
      });

      expect(
        plan.toCreate.map((t) => t.period),
        `run=${run} join=${joinDate.toISOString()} exit=${exitDate?.toISOString() ?? "none"}`,
      ).toEqual(expected);
    }
  });
});
