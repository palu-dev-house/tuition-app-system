import ExcelJS from "exceljs";
import { addRefColumn, applyListValidation } from "../exceljs-utils";

const LAST_ROW = 1000;

export interface TuitionExcelRow {
  Class: string;
  "Fee Amount": number | string;
}

export function createTuitionTemplate(
  classes: Array<{ id: string; className: string }>,
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Tuitions");

  sheet.addRow(["Class", "Fee Amount"]);
  sheet.columns = [
    { header: "Class", key: "class", width: 30 },
    { header: "Fee Amount", key: "fee", width: 20 },
  ];

  if (classes.length > 0) {
    sheet.addRow([classes[0].className, 500000]);
  }

  // Visible reference sheet preserved for parity with the previous template.
  const refSheet = workbook.addWorksheet("Classes (Ref)");
  refSheet.addRow(["Class"]);
  for (const c of classes) refSheet.addRow([c.className]);
  refSheet.getColumn(1).width = 30;

  // Hidden dynamic range for data validation.
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

  return workbook;
}

interface ValidatedTuitionRow {
  classAcademicId: string;
  className: string;
  feeAmount: number;
}

interface ValidationError {
  row: number;
  errors: string[];
}

export function validateTuitionData(
  data: TuitionExcelRow[],
  classMap: Map<string, string>,
): { valid: ValidatedTuitionRow[]; errors: ValidationError[] } {
  const valid: ValidatedTuitionRow[] = [];
  const errors: ValidationError[] = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const rowErrors: string[] = [];
    const rowNum = i + 2; // header is row 1

    const className = String(row.Class || "").trim();
    if (!className) {
      rowErrors.push("Class is required");
    }

    const feeAmount = Number(row["Fee Amount"]);
    if (!feeAmount || feeAmount <= 0) {
      rowErrors.push("Fee Amount must be greater than 0");
    }

    if (rowErrors.length > 0) {
      errors.push({ row: rowNum, errors: rowErrors });
      continue;
    }

    const classAcademicId = classMap.get(className);
    if (!classAcademicId) {
      errors.push({ row: rowNum, errors: [`Class "${className}" not found`] });
      continue;
    }

    valid.push({ classAcademicId, className, feeAmount });
  }

  return { valid, errors };
}
