import ExcelJS from "exceljs";
import {
  getPeriodDisplayName,
  PERIODS,
} from "../business-logic/tuition-generator";
import { addRefColumn, applyListValidation } from "../exceljs-utils";

const LAST_ROW = 1000;

export interface DiscountExcelRow {
  Name: string;
  Description?: string;
  Reason?: string;
  "Discount Amount": number;
  "Target Periods": string; // Comma-separated: "JULY,AUGUST" or "Q1,Q2" or "SEM1"
  "Academic Year": string; // e.g., "2024/2025"
  Class?: string; // Optional - empty means school-wide
}

export function createDiscountTemplate(
  academicYears: Array<{ id: string; year: string }>,
  classes: Array<{
    id: string;
    className: string;
    academicYear: { year: string };
  }>,
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Discounts");

  const headers = [
    "Name",
    "Description",
    "Reason",
    "Discount Amount",
    "Target Periods",
    "Academic Year",
    "Class",
  ];
  sheet.addRow(headers);

  const widths = [25, 35, 20, 18, 30, 15, 25];
  widths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  if (academicYears.length > 0) {
    sheet.addRow([
      "COVID Relief Q2",
      "COVID-19 tuition relief program",
      "COVID Relief",
      100000,
      "Q2",
      academicYears[0].year,
      "",
    ]);
    if (classes.length > 0) {
      sheet.addRow([
        "Class Discount Jul-Aug",
        "Special discount for specific class",
        "School Support",
        50000,
        "JULY,AUGUST",
        academicYears[0].year,
        classes[0].className,
      ]);
    }
  }

  // Keep existing visible reference sheets for backwards compatibility.
  const allPeriods = [
    ...PERIODS.MONTHLY.map((p) => ({
      period: p,
      type: "Monthly",
      display: getPeriodDisplayName(p),
    })),
    ...PERIODS.QUARTERLY.map((p) => ({
      period: p,
      type: "Quarterly",
      display: getPeriodDisplayName(p),
    })),
    ...PERIODS.SEMESTER.map((p) => ({
      period: p,
      type: "Semester",
      display: getPeriodDisplayName(p),
    })),
  ];
  const periodSheet = workbook.addWorksheet("Periods Reference");
  periodSheet.addRow(["Period Code", "Type", "Display Name"]);
  for (const p of allPeriods) {
    periodSheet.addRow([p.period, p.type, p.display]);
  }
  periodSheet.getColumn(1).width = 15;
  periodSheet.getColumn(2).width = 12;
  periodSheet.getColumn(3).width = 25;

  const yearSheet = workbook.addWorksheet("Academic Years Reference");
  yearSheet.addRow(["Academic Year"]);
  for (const ay of academicYears) yearSheet.addRow([ay.year]);
  yearSheet.getColumn(1).width = 15;

  const classSheet = workbook.addWorksheet("Classes Reference");
  classSheet.addRow(["Class Name", "Academic Year"]);
  for (const c of classes)
    classSheet.addRow([c.className, c.academicYear.year]);
  classSheet.getColumn(1).width = 25;
  classSheet.getColumn(2).width = 15;

  // Hidden dynamic ranges for dropdowns.
  const yearRange = addRefColumn(
    workbook,
    "AcademicYear",
    academicYears.map((a) => a.year),
  );
  const classRange = addRefColumn(
    workbook,
    "Class",
    classes.map((c) => c.className),
  );

  // Academic Year -> column F
  if (yearRange) {
    applyListValidation(sheet, "F", 2, LAST_ROW, [`=${yearRange}`], {
      promptTitle: "Academic Year",
      prompt: "Select an academic year.",
    });
  }

  // Class -> column G (optional, blank = school-wide)
  if (classRange) {
    applyListValidation(sheet, "G", 2, LAST_ROW, [`=${classRange}`], {
      promptTitle: "Class",
      prompt: "Leave blank for school-wide discounts.",
    });
  }

  // Target Periods column E accepts comma-separated values; we do not apply a
  // list validation there because Excel list validation does not allow
  // multi-select.

  return workbook;
}

export interface ValidatedDiscountRow {
  name: string;
  description: string | null;
  reason: string | null;
  discountAmount: number;
  targetPeriods: string[];
  academicYear: string;
  className: string | null;
}

const ALL_VALID_PERIODS: readonly string[] = [
  ...PERIODS.MONTHLY,
  ...PERIODS.QUARTERLY,
  ...PERIODS.SEMESTER,
];

export function validateDiscountData(
  data: DiscountExcelRow[],
  validAcademicYears: string[],
  validClassNames: string[],
): {
  valid: ValidatedDiscountRow[];
  errors: Array<{ row: number; errors: string[] }>;
} {
  const valid: ValidatedDiscountRow[] = [];
  const errors: Array<{ row: number; errors: string[] }> = [];

  data.forEach((row, index) => {
    const rowErrors: string[] = [];
    const rowNum = index + 2;

    if (!row.Name && !row["Discount Amount"] && !row["Target Periods"]) {
      return;
    }

    const name = String(row.Name || "").trim();
    if (!name) {
      rowErrors.push("Name is required");
    }

    const discountAmount = Number(row["Discount Amount"]);
    if (!row["Discount Amount"] && row["Discount Amount"] !== 0) {
      rowErrors.push("Discount Amount is required");
    } else if (Number.isNaN(discountAmount) || discountAmount <= 0) {
      rowErrors.push("Discount Amount must be a positive number");
    }

    const periodsStr = String(row["Target Periods"] || "").trim();
    if (!periodsStr) {
      rowErrors.push("Target Periods is required");
    }

    const targetPeriods: string[] = [];
    if (periodsStr) {
      const periods = periodsStr.split(",").map((p) => p.trim().toUpperCase());
      for (const period of periods) {
        if (!ALL_VALID_PERIODS.includes(period)) {
          rowErrors.push(
            `Invalid period "${period}". Valid: ${ALL_VALID_PERIODS.join(", ")}`,
          );
        } else {
          targetPeriods.push(period);
        }
      }
      if (periods.length > 0 && targetPeriods.length === 0) {
        rowErrors.push("At least one valid target period is required");
      }
    }

    const academicYear = String(row["Academic Year"] || "").trim();
    if (!academicYear) {
      rowErrors.push("Academic Year is required");
    } else if (!validAcademicYears.includes(academicYear)) {
      rowErrors.push(`Academic Year "${academicYear}" not found`);
    }

    const className = String(row.Class || "").trim() || null;
    if (className && !validClassNames.includes(className)) {
      rowErrors.push(`Class "${className}" not found`);
    }

    if (rowErrors.length > 0) {
      errors.push({ row: rowNum, errors: rowErrors });
    } else {
      valid.push({
        name,
        description: String(row.Description || "").trim() || null,
        reason: String(row.Reason || "").trim() || null,
        discountAmount,
        targetPeriods,
        academicYear,
        className,
      });
    }
  });

  return { valid, errors };
}
