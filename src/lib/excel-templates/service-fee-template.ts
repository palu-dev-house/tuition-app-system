import ExcelJS from "exceljs";
import { addRefColumn, applyListValidation } from "../exceljs-utils";

const LAST_ROW = 1000;

export interface ServiceFeeExcelRow {
  Class: string;
  Name: string;
  Amount: number;
  "Billing Months": string;
}

const VALID_MONTHS = [
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
];

export function createServiceFeeTemplate(
  classes: Array<{ id: string; className: string }>,
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Service Fees");

  sheet.addRow(["Class", "Name", "Amount", "Billing Months"]);
  [25, 30, 15, 50].forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  if (classes.length > 0) {
    sheet.addRow([
      classes[0].className,
      "Uang Perlengkapan",
      750000,
      "JULY,JANUARY",
    ]);
  }

  // Visible reference sheets preserved.
  const classSheet = workbook.addWorksheet("Classes Reference");
  classSheet.addRow(["Class Name"]);
  for (const c of classes) classSheet.addRow([c.className]);
  classSheet.getColumn(1).width = 25;

  const monthSheet = workbook.addWorksheet("Months Reference");
  monthSheet.addRow(["Month"]);
  for (const m of VALID_MONTHS) monthSheet.addRow([m]);
  monthSheet.getColumn(1).width = 15;

  // Dropdown: Class (col A)
  const classRange = addRefColumn(
    workbook,
    "Class",
    classes.map((c) => c.className),
  );
  if (classRange) {
    applyListValidation(sheet, "A", 2, LAST_ROW, [`=${classRange}`], {
      promptTitle: "Class",
      prompt: "Select a class.",
    });
  }

  // Billing Months (col D) is comma-separated, so no list validation.

  return workbook;
}

export interface ValidatedServiceFeeRow {
  classAcademicId: string;
  name: string;
  amount: number;
  billingMonths: string[];
}

export function validateServiceFeeData(
  data: ServiceFeeExcelRow[],
  classMap: Map<string, string>,
): {
  valid: ValidatedServiceFeeRow[];
  errors: Array<{ row: number; errors: string[] }>;
} {
  const valid: ValidatedServiceFeeRow[] = [];
  const errors: Array<{ row: number; errors: string[] }> = [];

  data.forEach((row, index) => {
    const rowErrors: string[] = [];
    const rowNum = index + 2;

    if (!row.Class && !row.Name && !row.Amount) return;

    const className = String(row.Class || "").trim();
    if (!className) {
      rowErrors.push("Class is required");
    } else if (!classMap.has(className)) {
      rowErrors.push(`Class "${className}" not found`);
    }

    const name = String(row.Name || "").trim();
    if (!name) {
      rowErrors.push("Name is required");
    }

    const amount = Number(row.Amount);
    if (!row.Amount && row.Amount !== 0) {
      rowErrors.push("Amount is required");
    } else if (Number.isNaN(amount) || amount <= 0) {
      rowErrors.push("Amount must be a positive number");
    }

    const monthsStr = String(row["Billing Months"] || "")
      .trim()
      .toUpperCase();
    const months = monthsStr
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);
    if (months.length === 0) {
      rowErrors.push("Billing Months is required (e.g. JULY,JANUARY)");
    } else {
      const invalid = months.filter((m) => !VALID_MONTHS.includes(m));
      if (invalid.length > 0) {
        rowErrors.push(`Invalid months: ${invalid.join(", ")}`);
      }
    }

    if (rowErrors.length > 0) {
      errors.push({ row: rowNum, errors: rowErrors });
    } else {
      valid.push({
        classAcademicId: classMap.get(className)!,
        name,
        amount,
        billingMonths: months,
      });
    }
  });

  return { valid, errors };
}
