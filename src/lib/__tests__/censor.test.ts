import { describe, expect, it } from "vitest";
import { censorIdentityNumber, censorName, censorPhone } from "@/lib/censor";

describe("censorPhone", () => {
  it("returns empty string for empty input", () => {
    expect(censorPhone("")).toBe("");
  });

  it("masks short numbers as ***", () => {
    expect(censorPhone("12345")).toBe("***");
    expect(censorPhone("123456")).toBe("***");
  });

  it("masks middle digits keeping first and last 2", () => {
    expect(censorPhone("081234567890")).toBe("08********90");
  });

  it("strips non-digit characters except leading +", () => {
    expect(censorPhone("+62 812-3456-7890")).toBe("+6**********90");
  });

  it("keeps international prefix intact", () => {
    expect(censorPhone("+6281234567890")).toBe("+6**********90");
  });
});

describe("censorName", () => {
  it("returns empty string for empty input", () => {
    expect(censorName("")).toBe("");
  });

  it("masks single-word name keeping first letter", () => {
    expect(censorName("Ahmad")).toBe("A****");
  });

  it("masks multi-word name per word", () => {
    expect(censorName("Ahmad Rizki Santoso")).toBe("A**** R**** S******");
  });

  it("replaces single-letter word with asterisk", () => {
    expect(censorName("A B")).toBe("* *");
  });

  it("handles extra spaces gracefully", () => {
    expect(censorName("Budi  Santoso")).toBe("B*** * S******");
  });
});

describe("censorIdentityNumber", () => {
  it("returns empty string for empty input", () => {
    expect(censorIdentityNumber("")).toBe("");
  });

  it("fully masks short ids", () => {
    expect(censorIdentityNumber("12345")).toBe("*****");
    expect(censorIdentityNumber("123456")).toBe("******");
  });

  it("keeps first 4 and last 4 visible for NIK-length ids", () => {
    expect(censorIdentityNumber("3578123456789012")).toBe("3578********9012");
  });

  it("strips spaces and dashes before masking", () => {
    expect(censorIdentityNumber("3578-1234-5678-9012")).toBe(
      "3578********9012",
    );
    expect(censorIdentityNumber("3578 1234 5678 9012")).toBe(
      "3578********9012",
    );
  });
});
