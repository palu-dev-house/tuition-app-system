import { describe, expect, it } from "vitest";
import {
  type ProrationCandidate,
  planExitMonthProration,
} from "../student-exit";

const row = (
  overrides: Partial<ProrationCandidate> = {},
): ProrationCandidate => ({
  id: "t-1",
  period: "NOVEMBER",
  year: 2026,
  frequency: "MONTHLY",
  status: "UNPAID",
  feeAmount: 585000,
  paidAmount: 0,
  discountAmount: 0,
  scholarshipAmount: 0,
  ...overrides,
});

describe("planExitMonthProration (half-month rule)", () => {
  it("halves the exit month's fee when the student leaves on or before the 15th", () => {
    const updates = planExitMonthProration(
      [row()],
      new Date(2026, 10, 15), // Nov 15
    );
    expect(updates).toEqual([
      { id: "t-1", newFeeAmount: 292500, newStatus: "UNPAID" },
    ]);
  });

  it("keeps the full fee when the student leaves after the 15th", () => {
    const updates = planExitMonthProration([row()], new Date(2026, 10, 16));
    expect(updates).toEqual([]);
  });

  it("only touches the exit month, not earlier or later periods", () => {
    const updates = planExitMonthProration(
      [
        row({ id: "t-oct", period: "OCTOBER" }),
        row({ id: "t-nov", period: "NOVEMBER" }),
        row({ id: "t-dec", period: "DECEMBER" }),
        row({ id: "t-nov-prev-year", period: "NOVEMBER", year: 2025 }),
      ],
      new Date(2026, 10, 3),
    );
    expect(updates.map((u) => u.id)).toEqual(["t-nov"]);
  });

  it("matches the exit month by calendar year (second-semester rows)", () => {
    const updates = planExitMonthProration(
      [row({ id: "t-feb", period: "FEBRUARY", year: 2027 })],
      new Date(2027, 1, 10), // Feb 10, 2027
    );
    expect(updates.map((u) => u.id)).toEqual(["t-feb"]);
  });

  it("never reduces the fee below what was already paid on a PARTIAL row", () => {
    const updates = planExitMonthProration(
      [row({ status: "PARTIAL", paidAmount: 400000 })],
      new Date(2026, 10, 10),
    );
    // half would be 292500 < paid 400000 -> clamp to 400000, fully covered
    expect(updates).toEqual([
      { id: "t-1", newFeeAmount: 400000, newStatus: "PAID" },
    ]);
  });

  it("keeps PARTIAL when payments cover some but not all of the halved fee", () => {
    const updates = planExitMonthProration(
      [row({ status: "PARTIAL", paidAmount: 100000 })],
      new Date(2026, 10, 10),
    );
    expect(updates).toEqual([
      { id: "t-1", newFeeAmount: 292500, newStatus: "PARTIAL" },
    ]);
  });

  it("marks the row PAID when discount and scholarship cover the halved fee", () => {
    const updates = planExitMonthProration(
      [
        row({
          status: "PARTIAL",
          paidAmount: 50000,
          discountAmount: 150000,
          scholarshipAmount: 100000,
        }),
      ],
      new Date(2026, 10, 10),
    );
    // halved 292500 - 150000 - 100000 = 42500 effective; paid 50000 covers it
    expect(updates).toEqual([
      { id: "t-1", newFeeAmount: 292500, newStatus: "PAID" },
    ]);
  });

  it("rounds the halved fee to a whole rupiah", () => {
    const updates = planExitMonthProration(
      [row({ feeAmount: 333333 })],
      new Date(2026, 10, 1),
    );
    expect(updates[0].newFeeAmount).toBe(166667);
  });

  it("skips quarterly and semester tuitions (monthly-only policy)", () => {
    const updates = planExitMonthProration(
      [
        row({ id: "t-q2", period: "Q2", frequency: "QUARTERLY" }),
        row({ id: "t-sem1", period: "SEM1", frequency: "SEMESTER" }),
      ],
      new Date(2026, 10, 10),
    );
    expect(updates).toEqual([]);
  });

  it("skips rows whose fee is already at or below the prorated amount", () => {
    const updates = planExitMonthProration(
      [row({ feeAmount: 0 })],
      new Date(2026, 10, 10),
    );
    expect(updates).toEqual([]);
  });
});
