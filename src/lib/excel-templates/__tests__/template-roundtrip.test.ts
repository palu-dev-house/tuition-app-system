import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { exceljsToBuffer } from "../../exceljs-utils";
import {
  createDiscountTemplate,
  type DiscountExcelRow,
  validateDiscountData,
} from "../discount-template";
import {
  createFeeServiceTemplate,
  type FeeServiceExcelRow,
  validateFeeServiceData,
} from "../fee-service-template";
import {
  createScholarshipTemplate,
  type ScholarshipExcelRow,
  validateScholarshipData,
} from "../scholarship-template";
import {
  createServiceFeeTemplate,
  type ServiceFeeExcelRow,
  validateServiceFeeData,
} from "../service-fee-template";
import {
  generateStudentClassTemplate,
  parseStudentClassImport,
} from "../student-class-template";
import {
  createTuitionTemplate,
  type TuitionExcelRow,
  validateTuitionData,
} from "../tuition-template";

/**
 * Export -> import round-trips: every downloadable template, filled with its
 * own example row, must parse and validate through the exact code path its
 * import route uses (XLSX.read + sheet_to_json on the first sheet, or the
 * dedicated parse function).
 */

const classes = [
  { id: "class-1", className: "I-1. REGULER-2026/2027" },
  { id: "class-2", className: "II-1. REGULER-2026/2027" },
];
const classMap = new Map(classes.map((c) => [c.className, c.id]));
const students = [
  { nis: "2026001", name: "Alice" },
  { nis: "2026002", name: "Bob" },
];
const academicYears = [{ id: "year-1", year: "2026/2027" }];

async function parseFirstSheet<T>(
  workbook: Awaited<ReturnType<typeof createTuitionTemplate>>,
): Promise<T[]> {
  const buffer = await exceljsToBuffer(workbook);
  const wb = XLSX.read(buffer, { type: "array" });
  return XLSX.utils.sheet_to_json<T>(wb.Sheets[wb.SheetNames[0]]);
}

describe("template export -> import round-trips", () => {
  it("tuition template example row imports as valid", async () => {
    const data = await parseFirstSheet<TuitionExcelRow>(
      createTuitionTemplate(classes),
    );
    expect(data.length).toBeGreaterThan(0);

    const { valid, errors } = validateTuitionData(data, classMap);
    expect(errors).toEqual([]);
    expect(valid[0]).toMatchObject({ classAcademicId: "class-1" });
  });

  it("scholarship template example row imports as valid", async () => {
    const data = await parseFirstSheet<ScholarshipExcelRow>(
      createScholarshipTemplate(students, classes),
    );
    expect(data.length).toBeGreaterThan(0);

    const { valid, errors } = validateScholarshipData(
      data,
      students.map((s) => s.nis),
      classes.map((c) => c.className),
    );
    expect(errors).toEqual([]);
    expect(valid.length).toBe(data.length);
  });

  it("discount template example rows import as valid", async () => {
    const data = await parseFirstSheet<DiscountExcelRow>(
      createDiscountTemplate(academicYears, [
        { ...classes[0], academicYear: { year: academicYears[0].year } },
      ]),
    );
    expect(data.length).toBeGreaterThan(0);

    const { valid, errors } = validateDiscountData(
      data,
      academicYears.map((y) => y.year),
      classes.map((c) => c.className),
    );
    expect(errors).toEqual([]);
    expect(valid.length).toBe(data.length);
  });

  it("service fee template example row imports as valid", async () => {
    const data = await parseFirstSheet<ServiceFeeExcelRow>(
      createServiceFeeTemplate(classes),
    );
    expect(data.length).toBeGreaterThan(0);

    const { valid, errors } = validateServiceFeeData(data, classMap);
    expect(errors).toEqual([]);
    expect(valid.length).toBe(data.length);
  });

  it("fee service template example rows import as valid", async () => {
    const data = await parseFirstSheet<FeeServiceExcelRow>(
      createFeeServiceTemplate(academicYears),
    );
    expect(data.length).toBeGreaterThan(0);

    const yearMap = new Map(academicYears.map((y) => [y.year, y.id]));
    const { valid, errors } = validateFeeServiceData(data, yearMap);
    expect(errors).toEqual([]);
    expect(valid.length).toBe(data.length);
  });

  it("empty student-class template parses with no rows and no errors", async () => {
    const workbook = generateStudentClassTemplate(students, classes);
    const buffer = await exceljsToBuffer(workbook);

    const { rows, errors } = parseStudentClassImport(buffer);
    expect(errors).toEqual([]);
    expect(rows).toEqual([]); // ships without example rows
  });

  it("filled student-class template parses through parseStudentClassImport", async () => {
    const workbook = generateStudentClassTemplate(students, classes);
    // Write to explicit rows the way a user fills the sheet in Excel
    // (addRow would append after the 1000 rows carrying dropdown validation).
    const dataSheet = workbook.getWorksheet("Import Data");
    if (dataSheet) {
      dataSheet.getRow(2).values = ["2026001", "Alice", classes[0].className];
      dataSheet.getRow(3).values = ["2026002", "Bob", classes[1].className];
    }
    const buffer = await exceljsToBuffer(workbook);

    const { rows, errors } = parseStudentClassImport(buffer);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { studentId: "2026001", className: classes[0].className, rowNumber: 2 },
      { studentId: "2026002", className: classes[1].className, rowNumber: 3 },
    ]);
  });
});
