import ExcelJS from "exceljs";
import {
  addRefColumn,
  applyListValidation,
  inlineListFormula,
} from "../exceljs-utils";

const LAST_ROW = 1000;
const CATEGORIES = ["TRANSPORT", "ACCOMMODATION"];

export interface FeeServiceExcelRow {
  "Academic Year": string;
  Category: string;
  Name: string;
  Description: string;
}

export function createFeeServiceTemplate(
  academicYears: Array<{ id: string; year: string }>,
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Fee Services");

  sheet.addRow(["Academic Year", "Category", "Name", "Description"]);
  [20, 18, 30, 40].forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  if (academicYears.length > 0) {
    sheet.addRow([
      academicYears[0].year,
      "TRANSPORT",
      "Bus Rute A",
      "Rute A kota",
    ]);
  }

  // Visible reference sheets preserved.
  const refSheet = workbook.addWorksheet("Reference");
  refSheet.addRow(["Academic Year"]);
  for (const ay of academicYears) refSheet.addRow([ay.year]);
  refSheet.getColumn(1).width = 20;

  const catSheet = workbook.addWorksheet("Categories");
  catSheet.addRow(["Category"]);
  for (const c of CATEGORIES) catSheet.addRow([c]);
  catSheet.getColumn(1).width = 18;

  // Dropdown: Academic Year (col A)
  const yearRange = addRefColumn(
    workbook,
    "AcademicYear",
    academicYears.map((a) => a.year),
  );
  if (yearRange) {
    applyListValidation(sheet, "A", 2, LAST_ROW, [`=${yearRange}`], {
      promptTitle: "Academic Year",
      prompt: "Select an academic year.",
    });
  }

  // Dropdown: Category (col B)
  applyListValidation(
    sheet,
    "B",
    2,
    LAST_ROW,
    [inlineListFormula(CATEGORIES)],
    {
      promptTitle: "Category",
      prompt: "Choose TRANSPORT or ACCOMMODATION.",
    },
  );

  return workbook;
}

export interface ValidatedFeeServiceRow {
  academicYearId: string;
  category: "TRANSPORT" | "ACCOMMODATION";
  name: string;
  description: string | null;
}

export function validateFeeServiceData(
  data: FeeServiceExcelRow[],
  yearMap: Map<string, string>,
): {
  valid: ValidatedFeeServiceRow[];
  errors: Array<{ row: number; errors: string[] }>;
} {
  const valid: ValidatedFeeServiceRow[] = [];
  const errors: Array<{ row: number; errors: string[] }> = [];
  const validCategories = ["TRANSPORT", "ACCOMMODATION"];

  data.forEach((row, index) => {
    const rowErrors: string[] = [];
    const rowNum = index + 2;

    if (!row["Academic Year"] && !row.Category && !row.Name) return;

    const yearStr = String(row["Academic Year"] || "").trim();
    if (!yearStr) {
      rowErrors.push("Academic Year is required");
    } else if (!yearMap.has(yearStr)) {
      rowErrors.push(`Academic Year "${yearStr}" not found`);
    }

    const category = String(row.Category || "")
      .trim()
      .toUpperCase();
    if (!category) {
      rowErrors.push("Category is required");
    } else if (!validCategories.includes(category)) {
      rowErrors.push(`Category must be TRANSPORT or ACCOMMODATION`);
    }

    const name = String(row.Name || "").trim();
    if (!name) {
      rowErrors.push("Name is required");
    }

    if (rowErrors.length > 0) {
      errors.push({ row: rowNum, errors: rowErrors });
    } else {
      valid.push({
        academicYearId: yearMap.get(yearStr)!,
        category: category as "TRANSPORT" | "ACCOMMODATION",
        name,
        description: row.Description ? String(row.Description).trim() : null,
      });
    }
  });

  return { valid, errors };
}
