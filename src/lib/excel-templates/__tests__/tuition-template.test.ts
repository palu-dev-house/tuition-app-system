import { describe, expect, it } from "vitest";
import { validateTuitionData } from "../tuition-template";

const classMap = new Map([
  ["Kelas 1A", "class-uuid-1a"],
  ["Kelas 2B", "class-uuid-2b"],
  ["Kelas 3C", "class-uuid-3c"],
]);

describe("validateTuitionData", () => {
  it("validates correct rows", () => {
    const data = [
      { Class: "Kelas 1A", "Fee Amount": 500000 },
      { Class: "Kelas 2B", "Fee Amount": 750000 },
    ];

    const { valid, errors } = validateTuitionData(data, classMap);
    expect(valid).toHaveLength(2);
    expect(errors).toHaveLength(0);
    expect(valid[0].classAcademicId).toBe("class-uuid-1a");
    expect(valid[0].feeAmount).toBe(500000);
  });

  it("rejects row with missing class name", () => {
    const data = [{ Class: "", "Fee Amount": 500000 }];
    const { valid, errors } = validateTuitionData(data, classMap);
    expect(valid).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].errors).toContain("Class is required");
  });

  it("rejects row with zero fee amount", () => {
    const data = [{ Class: "Kelas 1A", "Fee Amount": 0 }];
    const { valid, errors } = validateTuitionData(data, classMap);
    expect(valid).toHaveLength(0);
    expect(errors[0].errors).toContain("Fee Amount must be greater than 0");
  });

  it("rejects row with negative fee amount", () => {
    const data = [{ Class: "Kelas 1A", "Fee Amount": -100000 }];
    const { valid, errors } = validateTuitionData(data, classMap);
    expect(valid).toHaveLength(0);
  });

  it("rejects unknown class name", () => {
    const data = [{ Class: "Nonexistent Class", "Fee Amount": 500000 }];
    const { valid, errors } = validateTuitionData(data, classMap);
    expect(valid).toHaveLength(0);
    expect(errors[0].errors[0]).toContain("not found");
  });

  it("handles mixed valid and invalid rows", () => {
    const data = [
      { Class: "Kelas 1A", "Fee Amount": 500000 }, // valid
      { Class: "", "Fee Amount": 500000 }, // invalid: no class
      { Class: "Kelas 2B", "Fee Amount": 0 }, // invalid: zero fee
      { Class: "Kelas 3C", "Fee Amount": 300000 }, // valid
    ];

    const { valid, errors } = validateTuitionData(data, classMap);
    expect(valid).toHaveLength(2);
    expect(errors).toHaveLength(2);
  });

  it("uses correct row numbers (header = row 1, data starts at row 2)", () => {
    const data = [
      { Class: "", "Fee Amount": 500000 }, // row 2
      { Class: "Kelas 1A", "Fee Amount": 500000 }, // row 3
      { Class: "Unknown", "Fee Amount": 500000 }, // row 4
    ];

    const { errors } = validateTuitionData(data, classMap);
    expect(errors[0].row).toBe(2);
    expect(errors[1].row).toBe(4);
  });

  it("handles empty data array", () => {
    const { valid, errors } = validateTuitionData([], classMap);
    expect(valid).toHaveLength(0);
    expect(errors).toHaveLength(0);
  });

  it("parses string fee amount as number", () => {
    const data = [{ Class: "Kelas 1A", "Fee Amount": "500000" }];
    const { valid } = validateTuitionData(data, classMap);
    expect(valid[0].feeAmount).toBe(500000);
  });

  it("rejects non-numeric fee amount string", () => {
    const data = [{ Class: "Kelas 1A", "Fee Amount": "abc" }];
    const { valid, errors } = validateTuitionData(data, classMap);
    expect(valid).toHaveLength(0);
    expect(errors).toHaveLength(1);
  });

  it("handles empty class map", () => {
    const data = [{ Class: "Kelas 1A", "Fee Amount": 500000 }];
    const { valid, errors } = validateTuitionData(data, new Map());
    expect(valid).toHaveLength(0);
    expect(errors[0].errors[0]).toContain("not found");
  });
});
