import { describe, expect, it } from "vitest";
import {
  assertSingleBillTarget,
  resolveBillTargetType,
} from "@/lib/business-logic/payment-items";

describe("assertSingleBillTarget", () => {
  it("throws when no target is set", () => {
    expect(() => assertSingleBillTarget({})).toThrow(/must set one of/);
  });

  it("throws when all targets are null or empty", () => {
    expect(() =>
      assertSingleBillTarget({
        tuitionId: null,
        feeBillId: "",
        serviceFeeBillId: null,
      }),
    ).toThrow(/must set one of/);
  });

  it("throws when two targets are set", () => {
    expect(() =>
      assertSingleBillTarget({
        tuitionId: "t-1",
        feeBillId: "f-1",
      }),
    ).toThrow(/exactly one of/);
  });

  it("throws when all three targets are set", () => {
    expect(() =>
      assertSingleBillTarget({
        tuitionId: "t-1",
        feeBillId: "f-1",
        serviceFeeBillId: "s-1",
      }),
    ).toThrow(/exactly one of/);
  });

  it("accepts exactly one target", () => {
    expect(() => assertSingleBillTarget({ tuitionId: "t-1" })).not.toThrow();
    expect(() => assertSingleBillTarget({ feeBillId: "f-1" })).not.toThrow();
    expect(() =>
      assertSingleBillTarget({ serviceFeeBillId: "s-1" }),
    ).not.toThrow();
  });
});

describe("resolveBillTargetType", () => {
  it("returns tuition when tuitionId is set", () => {
    expect(resolveBillTargetType({ tuitionId: "t-1" })).toBe("tuition");
  });

  it("returns feeBill when feeBillId is set", () => {
    expect(resolveBillTargetType({ feeBillId: "f-1" })).toBe("feeBill");
  });

  it("returns serviceFeeBill when serviceFeeBillId is set", () => {
    expect(resolveBillTargetType({ serviceFeeBillId: "s-1" })).toBe(
      "serviceFeeBill",
    );
  });

  it("propagates the assertion error for invalid input", () => {
    expect(() => resolveBillTargetType({})).toThrow();
    expect(() =>
      resolveBillTargetType({ tuitionId: "t-1", feeBillId: "f-1" }),
    ).toThrow();
  });
});
