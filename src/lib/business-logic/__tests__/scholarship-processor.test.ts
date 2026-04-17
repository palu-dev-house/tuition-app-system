import { describe, expect, it } from "vitest";
import { calculateScholarshipCoverage } from "@/lib/business-logic/scholarship-processor";

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
