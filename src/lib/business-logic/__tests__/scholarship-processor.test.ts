import { describe, expect, it } from "vitest";
import {
  calculateScholarshipCoverage,
  planScholarshipUpdates,
} from "@/lib/business-logic/scholarship-processor";

describe("calculateScholarshipCoverage", () => {
  it("reports 0% when scholarship amount is zero", () => {
    const result = calculateScholarshipCoverage(0, 500_000);
    expect(result.percentage).toBe(0);
    expect(result.isFullScholarship).toBe(false);
    expect(result.remainingAmount).toBe(500_000);
  });

  it("reports partial coverage proportionally", () => {
    const result = calculateScholarshipCoverage(200_000, 500_000);
    expect(result.percentage).toBe(40);
    expect(result.isFullScholarship).toBe(false);
    expect(result.remainingAmount).toBe(300_000);
  });

  it("caps percentage at 100 when scholarship exceeds fee", () => {
    const result = calculateScholarshipCoverage(750_000, 500_000);
    expect(result.percentage).toBe(100);
    expect(result.isFullScholarship).toBe(true);
    expect(result.remainingAmount).toBe(0);
  });

  it("marks full scholarship when exactly equal to fee", () => {
    const result = calculateScholarshipCoverage(500_000, 500_000);
    expect(result.percentage).toBe(100);
    expect(result.isFullScholarship).toBe(true);
    expect(result.remainingAmount).toBe(0);
  });

  it("never returns negative remaining amount", () => {
    const result = calculateScholarshipCoverage(1_000_000, 500_000);
    expect(result.remainingAmount).toBe(0);
  });
});

function tuition(
  overrides: Partial<{
    id: string;
    feeAmount: number;
    paidAmount: number;
    discountAmount: number;
  }> = {},
) {
  return {
    id: "t-1",
    feeAmount: 500000,
    paidAmount: 0,
    discountAmount: 0,
    ...overrides,
  };
}

describe("planScholarshipUpdates", () => {
  it("groups tuitions by their resulting status", () => {
    const groups = planScholarshipUpdates(
      [
        // full scholarship covers fee -> PAID
        tuition({ id: "t-paid", feeAmount: 300000 }),
        // partial payment on remaining fee -> PARTIAL
        tuition({ id: "t-partial", feeAmount: 500000, paidAmount: 50000 }),
        // nothing paid, fee not covered -> UNPAID
        tuition({ id: "t-unpaid", feeAmount: 500000 }),
        // second unpaid joins the same group
        tuition({ id: "t-unpaid-2", feeAmount: 600000 }),
      ],
      300000,
    );

    expect(groups).toEqual([
      { status: "PAID", tuitionIds: ["t-paid"] },
      { status: "PARTIAL", tuitionIds: ["t-partial"] },
      { status: "UNPAID", tuitionIds: ["t-unpaid", "t-unpaid-2"] },
    ]);
  });

  it("counts discount toward the covered amount", () => {
    const groups = planScholarshipUpdates(
      [tuition({ id: "t-1", feeAmount: 500000, discountAmount: 200000 })],
      300000,
    );
    // 500000 - 300000 - 200000 = 0 outstanding -> PAID
    expect(groups).toEqual([{ status: "PAID", tuitionIds: ["t-1"] }]);
  });

  it("returns no groups for no tuitions", () => {
    expect(planScholarshipUpdates([], 100000)).toEqual([]);
  });

  it("omits empty status groups", () => {
    const groups = planScholarshipUpdates(
      [tuition({ id: "t-1", feeAmount: 100000 })],
      100000,
    );
    expect(groups).toEqual([{ status: "PAID", tuitionIds: ["t-1"] }]);
  });
});
