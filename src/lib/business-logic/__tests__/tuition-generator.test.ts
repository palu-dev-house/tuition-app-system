import { describe, expect, it } from "vitest";
import {
  calculateDefaultFees,
  calculateDiscount,
  calculateTotalTuition,
  generateMonthlyTuitions,
  generateTuitions,
  getFeeForFrequency,
  getFrequencyFromPeriod,
  getMonthDisplayName,
  getPeriodDisplayName,
  getPeriodDueDate,
  getRecordCountForFrequency,
  isMonthlyPeriod,
  isQuarterlyPeriod,
  isSemesterPeriod,
  type TuitionGenerationParams,
} from "../tuition-generator";

// Academic year: July 2024 - June 2025
const ACADEMIC_YEAR = {
  startDate: new Date(2024, 6, 1), // July 1, 2024
  endDate: new Date(2025, 5, 30), // June 30, 2025
};

function makeStudent(
  overrides: Partial<TuitionGenerationParams["students"][0]> = {},
) {
  return {
    id: "student-uuid-1",
    startJoinDate: new Date(2024, 0, 1), // Jan 1, 2024 (before academic year)
    exitedAt: null,
    ...overrides,
  };
}

// ============================================
// generateTuitions - MONTHLY
// ============================================

describe("generateTuitions (MONTHLY)", () => {
  it("generates 12 monthly tuitions for a full-year student", () => {
    const result = generateTuitions({
      classAcademicId: "class-1",
      frequency: "MONTHLY",
      feeAmount: 500000,
      students: [makeStudent()],
      academicYear: ACADEMIC_YEAR,
    });

    expect(result).toHaveLength(12);
    expect(result[0].period).toBe("JULY");
    expect(result[11].period).toBe("JUNE");
    expect(result.every((t) => t.feeAmount === 500000)).toBe(true);
    expect(result.every((t) => t.status === "UNPAID")).toBe(true);
  });

  it("uses student UUID id as studentId, not NIS", () => {
    const result = generateTuitions({
      classAcademicId: "class-1",
      frequency: "MONTHLY",
      feeAmount: 100000,
      students: [makeStudent({ id: "uuid-abc-123" })],
      academicYear: ACADEMIC_YEAR,
    });

    expect(result[0].studentId).toBe("uuid-abc-123");
    // Should NOT contain NIS-style values
    expect(result[0].studentId).not.toMatch(/^2024\d{3}$/);
  });

  it("generates tuitions for multiple students with same fee", () => {
    const students = [
      makeStudent({ id: "student-1" }),
      makeStudent({ id: "student-2" }),
      makeStudent({ id: "student-3" }),
    ];

    const result = generateTuitions({
      classAcademicId: "class-1",
      frequency: "MONTHLY",
      feeAmount: 500000,
      students,
      academicYear: ACADEMIC_YEAR,
    });

    // 3 students x 12 months = 36
    expect(result).toHaveLength(36);

    const student1Tuitions = result.filter((t) => t.studentId === "student-1");
    const student2Tuitions = result.filter((t) => t.studentId === "student-2");
    expect(student1Tuitions).toHaveLength(12);
    expect(student2Tuitions).toHaveLength(12);
  });

  it("sets month field for backward compatibility on MONTHLY frequency", () => {
    const result = generateTuitions({
      classAcademicId: "class-1",
      frequency: "MONTHLY",
      feeAmount: 100000,
      students: [makeStudent()],
      academicYear: ACADEMIC_YEAR,
    });

    expect(result[0].month).toBe("JULY");
    expect(result[6].month).toBe("JANUARY");
  });

  it("handles student joining mid-year (October)", () => {
    const result = generateTuitions({
      classAcademicId: "class-1",
      frequency: "MONTHLY",
      feeAmount: 500000,
      students: [
        makeStudent({ startJoinDate: new Date(2024, 9, 15) }), // Oct 15
      ],
      academicYear: ACADEMIC_YEAR,
    });

    // October to June = 9 months
    expect(result).toHaveLength(9);
    expect(result[0].period).toBe("OCTOBER");
    expect(result[result.length - 1].period).toBe("JUNE");
  });

  it("handles student joining in second semester (February)", () => {
    const result = generateTuitions({
      classAcademicId: "class-1",
      frequency: "MONTHLY",
      feeAmount: 500000,
      students: [
        makeStudent({ startJoinDate: new Date(2025, 1, 1) }), // Feb 1, 2025
      ],
      academicYear: ACADEMIC_YEAR,
    });

    // February to June = 5 months
    expect(result).toHaveLength(5);
    expect(result[0].period).toBe("FEBRUARY");
  });

  it("returns empty array if student joined after academic year", () => {
    const result = generateTuitions({
      classAcademicId: "class-1",
      frequency: "MONTHLY",
      feeAmount: 500000,
      students: [
        makeStudent({ startJoinDate: new Date(2025, 7, 1) }), // Aug 2025
      ],
      academicYear: ACADEMIC_YEAR,
    });

    expect(result).toHaveLength(0);
  });

  it("excludes periods after student exit date", () => {
    const result = generateTuitions({
      classAcademicId: "class-1",
      frequency: "MONTHLY",
      feeAmount: 500000,
      students: [
        makeStudent({ exitedAt: new Date(2024, 10, 15) }), // Exited Nov 15
      ],
      academicYear: ACADEMIC_YEAR,
    });

    // July to November = 5 months (Dec onwards excluded)
    expect(result).toHaveLength(5);
    expect(result[result.length - 1].period).toBe("NOVEMBER");
  });

  it("applies period-specific discounts", () => {
    const result = generateTuitions({
      classAcademicId: "class-1",
      frequency: "MONTHLY",
      feeAmount: 500000,
      periodDiscounts: [
        { period: "JULY", discountedFee: 250000 },
        { period: "DECEMBER", discountedFee: 0 },
      ],
      students: [makeStudent()],
      academicYear: ACADEMIC_YEAR,
    });

    const july = result.find((t) => t.period === "JULY");
    const december = result.find((t) => t.period === "DECEMBER");
    const august = result.find((t) => t.period === "AUGUST");

    expect(july?.feeAmount).toBe(250000);
    expect(december?.feeAmount).toBe(0);
    expect(august?.feeAmount).toBe(500000); // No discount
  });

  it("handles zero fee amount", () => {
    const result = generateTuitions({
      classAcademicId: "class-1",
      frequency: "MONTHLY",
      feeAmount: 0,
      students: [makeStudent()],
      academicYear: ACADEMIC_YEAR,
    });

    expect(result).toHaveLength(12);
    expect(result.every((t) => t.feeAmount === 0)).toBe(true);
  });

  it("handles empty students array", () => {
    const result = generateTuitions({
      classAcademicId: "class-1",
      frequency: "MONTHLY",
      feeAmount: 500000,
      students: [],
      academicYear: ACADEMIC_YEAR,
    });

    expect(result).toHaveLength(0);
  });
});

// ============================================
// generateTuitions - QUARTERLY
// ============================================

describe("generateTuitions (QUARTERLY)", () => {
  it("generates 4 quarterly tuitions for a full-year student", () => {
    const result = generateTuitions({
      classAcademicId: "class-1",
      frequency: "QUARTERLY",
      feeAmount: 1500000,
      students: [makeStudent()],
      academicYear: ACADEMIC_YEAR,
    });

    expect(result).toHaveLength(4);
    expect(result.map((t) => t.period)).toEqual(["Q1", "Q2", "Q3", "Q4"]);
    expect(result[0].month).toBeUndefined(); // No month field for quarterly
  });

  it("handles mid-year join for quarterly", () => {
    const result = generateTuitions({
      classAcademicId: "class-1",
      frequency: "QUARTERLY",
      feeAmount: 1500000,
      students: [
        makeStudent({ startJoinDate: new Date(2024, 9, 15) }), // Oct = Q2
      ],
      academicYear: ACADEMIC_YEAR,
    });

    // Q2, Q3, Q4 = 3 quarters
    expect(result).toHaveLength(3);
    expect(result[0].period).toBe("Q2");
  });
});

// ============================================
// generateTuitions - SEMESTER
// ============================================

describe("generateTuitions (SEMESTER)", () => {
  it("generates 2 semester tuitions for a full-year student", () => {
    const result = generateTuitions({
      classAcademicId: "class-1",
      frequency: "SEMESTER",
      feeAmount: 3000000,
      students: [makeStudent()],
      academicYear: ACADEMIC_YEAR,
    });

    expect(result).toHaveLength(2);
    expect(result.map((t) => t.period)).toEqual(["SEM1", "SEM2"]);
  });

  it("handles student joining in second semester", () => {
    const result = generateTuitions({
      classAcademicId: "class-1",
      frequency: "SEMESTER",
      feeAmount: 3000000,
      students: [
        makeStudent({ startJoinDate: new Date(2025, 1, 1) }), // Feb = SEM2
      ],
      academicYear: ACADEMIC_YEAR,
    });

    expect(result).toHaveLength(1);
    expect(result[0].period).toBe("SEM2");
  });
});

// ============================================
// generateTuitions - DUPLICATE EDGE CASES (NIS migration)
// ============================================

describe("generateTuitions - duplicate NIS edge cases", () => {
  it("generates separate tuitions for students with same NIS but different IDs (SD vs SMP)", () => {
    // This simulates two students with NIS "2024001" at SD and SMP levels
    // After UUID migration, they have different UUIDs
    const sdStudent = makeStudent({ id: "uuid-sd-student" });
    const smpStudent = makeStudent({ id: "uuid-smp-student" });

    const result = generateTuitions({
      classAcademicId: "class-1",
      frequency: "MONTHLY",
      feeAmount: 500000,
      students: [sdStudent, smpStudent],
      academicYear: ACADEMIC_YEAR,
    });

    // Each student gets 12 months
    expect(result).toHaveLength(24);

    const sdTuitions = result.filter((t) => t.studentId === "uuid-sd-student");
    const smpTuitions = result.filter(
      (t) => t.studentId === "uuid-smp-student",
    );

    expect(sdTuitions).toHaveLength(12);
    expect(smpTuitions).toHaveLength(12);

    // Ensure no studentId collision - all tuitions reference UUID, not NIS
    const uniqueStudentIds = new Set(result.map((t) => t.studentId));
    expect(uniqueStudentIds.size).toBe(2);
  });

  it("deduplication key uses UUID studentId, not NIS", () => {
    // Simulate the deduplication logic from the API endpoint
    const tuitions = generateTuitions({
      classAcademicId: "class-1",
      frequency: "MONTHLY",
      feeAmount: 500000,
      students: [
        makeStudent({ id: "uuid-sd-001" }),
        makeStudent({ id: "uuid-smp-001" }),
      ],
      academicYear: ACADEMIC_YEAR,
    });

    // Build dedup keys the same way the API does
    const keys = tuitions.map((t) => `${t.studentId}-${t.period}-${t.year}`);
    const uniqueKeys = new Set(keys);

    // 2 students x 12 periods = 24 unique keys
    expect(uniqueKeys.size).toBe(24);

    // Verify keys contain UUID, not NIS
    for (const key of keys) {
      expect(key).toMatch(/^uuid-/);
    }
  });
});

// ============================================
// Due dates
// ============================================

describe("getPeriodDueDate", () => {
  it("returns 10th of the month for monthly periods", () => {
    const julyDue = getPeriodDueDate("JULY", ACADEMIC_YEAR);
    expect(julyDue.getDate()).toBe(10);
    expect(julyDue.getMonth()).toBe(6); // July = 6 (0-indexed)
    expect(julyDue.getFullYear()).toBe(2024);
  });

  it("returns next year for second-semester months", () => {
    const janDue = getPeriodDueDate("JANUARY", ACADEMIC_YEAR);
    expect(janDue.getFullYear()).toBe(2025);
    expect(janDue.getMonth()).toBe(0); // January
  });

  it("returns correct due date for quarterly periods", () => {
    const q1Due = getPeriodDueDate("Q1", ACADEMIC_YEAR);
    expect(q1Due.getMonth()).toBe(6); // July
    expect(q1Due.getFullYear()).toBe(2024);

    const q3Due = getPeriodDueDate("Q3", ACADEMIC_YEAR);
    expect(q3Due.getMonth()).toBe(0); // January
    expect(q3Due.getFullYear()).toBe(2025);
  });

  it("returns fallback for unknown period", () => {
    const due = getPeriodDueDate("UNKNOWN", ACADEMIC_YEAR);
    expect(due.getMonth()).toBe(6); // July fallback
    expect(due.getDate()).toBe(10);
  });
});

// ============================================
// Fee calculations
// ============================================

describe("calculateDefaultFees", () => {
  it("calculates quarterly and semester defaults from monthly", () => {
    const result = calculateDefaultFees(500000);
    expect(result.monthly).toBe(500000);
    expect(result.quarterlyDefault).toBe(1500000);
    expect(result.semesterDefault).toBe(3000000);
  });

  it("handles zero fee", () => {
    const result = calculateDefaultFees(0);
    expect(result.quarterlyDefault).toBe(0);
    expect(result.semesterDefault).toBe(0);
  });
});

describe("calculateDiscount", () => {
  it("calculates discount amount and percentage", () => {
    const result = calculateDiscount(500000, 450000);
    expect(result.discount).toBe(50000);
    expect(result.percentage).toBeCloseTo(10);
  });

  it("handles zero base fee", () => {
    const result = calculateDiscount(0, 0);
    expect(result.percentage).toBe(0);
  });

  it("handles full discount", () => {
    const result = calculateDiscount(500000, 0);
    expect(result.discount).toBe(500000);
    expect(result.percentage).toBe(100);
  });
});

describe("getFeeForFrequency", () => {
  const classAcademic = {
    paymentFrequency: "MONTHLY" as const,
    monthlyFee: 500000,
    quarterlyFee: 1400000,
    semesterFee: 2700000,
  };

  it("returns monthly fee for MONTHLY frequency", () => {
    expect(getFeeForFrequency(classAcademic)).toBe(500000);
  });

  it("returns quarterly fee for QUARTERLY frequency", () => {
    expect(
      getFeeForFrequency({ ...classAcademic, paymentFrequency: "QUARTERLY" }),
    ).toBe(1400000);
  });

  it("falls back to monthly * 3 if quarterly fee is null", () => {
    expect(
      getFeeForFrequency({
        ...classAcademic,
        paymentFrequency: "QUARTERLY",
        quarterlyFee: null,
      }),
    ).toBe(1500000);
  });

  it("uses override fee when provided", () => {
    expect(getFeeForFrequency(classAcademic, 999999)).toBe(999999);
  });
});

// ============================================
// Utility functions
// ============================================

describe("getRecordCountForFrequency", () => {
  it("returns 12 for MONTHLY", () => {
    expect(getRecordCountForFrequency("MONTHLY")).toBe(12);
  });
  it("returns 4 for QUARTERLY", () => {
    expect(getRecordCountForFrequency("QUARTERLY")).toBe(4);
  });
  it("returns 2 for SEMESTER", () => {
    expect(getRecordCountForFrequency("SEMESTER")).toBe(2);
  });
});

describe("calculateTotalTuition", () => {
  it("calculates full year total for early joiner", () => {
    const result = calculateTotalTuition(
      500000,
      "MONTHLY",
      new Date(2024, 0, 1), // Before academic year
      ACADEMIC_YEAR,
    );
    expect(result.periods).toBe(12);
    expect(result.total).toBe(6000000);
  });

  it("calculates partial year total for mid-year joiner", () => {
    const result = calculateTotalTuition(
      500000,
      "MONTHLY",
      new Date(2024, 9, 1), // October
      ACADEMIC_YEAR,
    );
    expect(result.periods).toBe(9); // Oct - Jun
    expect(result.total).toBe(4500000);
  });
});

describe("period type helpers", () => {
  it("identifies monthly periods", () => {
    expect(isMonthlyPeriod("JULY")).toBe(true);
    expect(isMonthlyPeriod("Q1")).toBe(false);
    expect(isMonthlyPeriod("SEM1")).toBe(false);
  });

  it("identifies quarterly periods", () => {
    expect(isQuarterlyPeriod("Q1")).toBe(true);
    expect(isQuarterlyPeriod("JULY")).toBe(false);
  });

  it("identifies semester periods", () => {
    expect(isSemesterPeriod("SEM1")).toBe(true);
    expect(isSemesterPeriod("Q1")).toBe(false);
  });

  it("derives frequency from period", () => {
    expect(getFrequencyFromPeriod("JULY")).toBe("MONTHLY");
    expect(getFrequencyFromPeriod("Q2")).toBe("QUARTERLY");
    expect(getFrequencyFromPeriod("SEM1")).toBe("SEMESTER");
  });
});

describe("display names", () => {
  it("returns display name for monthly period", () => {
    expect(getPeriodDisplayName("JULY")).toBe("July");
    expect(getMonthDisplayName("JANUARY")).toBe("January");
  });

  it("returns display name for quarterly period", () => {
    expect(getPeriodDisplayName("Q1")).toBe("Q1 (Jul-Sep)");
  });

  it("returns display name for semester period", () => {
    expect(getPeriodDisplayName("SEM1")).toBe("Semester 1 (Jul-Dec)");
  });

  it("returns raw value for unknown period", () => {
    expect(getPeriodDisplayName("UNKNOWN")).toBe("UNKNOWN");
  });
});

describe("generateMonthlyTuitions (legacy)", () => {
  it("delegates to generateTuitions with MONTHLY frequency", () => {
    const result = generateMonthlyTuitions({
      classAcademicId: "class-1",
      feeAmount: 500000,
      students: [makeStudent()],
      academicYear: ACADEMIC_YEAR,
    });

    expect(result).toHaveLength(12);
    expect(result[0].month).toBe("JULY");
  });
});
