import ExcelJS from "exceljs";
import { addRefColumn, applyListValidation } from "../exceljs-utils";

const LAST_ROW = 1000;

export interface ScholarshipExcelRow {
  "Student NIS": string;
  "Student Name": string;
  Class: string;
  Nominal: number;
}

export function createScholarshipTemplate(
  students: Array<{ nis: string; name: string }>,
  classes: Array<{ id: string; className: string }>,
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Scholarships");

  sheet.addRow(["Student NIS", "Student Name", "Class", "Nominal"]);
  [15, 30, 25, 15].forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  if (students.length > 0 && classes.length > 0) {
    sheet.addRow([
      students[0].nis,
      students[0].name,
      classes[0].className,
      500000,
    ]);
  }

  // Visible reference sheets preserved.
  const studentSheet = workbook.addWorksheet("Students Reference");
  studentSheet.addRow(["NIS", "Name"]);
  for (const s of students) studentSheet.addRow([s.nis, s.name]);
  studentSheet.getColumn(1).width = 15;
  studentSheet.getColumn(2).width = 30;

  const classSheet = workbook.addWorksheet("Classes Reference");
  classSheet.addRow(["Class Name"]);
  for (const c of classes) classSheet.addRow([c.className]);
  classSheet.getColumn(1).width = 25;

  // Dropdowns.
  const nisRange = addRefColumn(
    workbook,
    "NIS",
    students.map((s) => s.nis),
  );
  if (nisRange) {
    applyListValidation(sheet, "A", 2, LAST_ROW, [`=${nisRange}`], {
      promptTitle: "Student NIS",
      prompt: "Select a student NIS.",
    });
  }

  const classRange = addRefColumn(
    workbook,
    "Class",
    classes.map((c) => c.className),
  );
  if (classRange) {
    applyListValidation(sheet, "C", 2, LAST_ROW, [`=${classRange}`], {
      promptTitle: "Class",
      prompt: "Select a class.",
    });
  }

  return workbook;
}

export interface ValidatedScholarshipRow {
  studentId: string;
  studentName: string;
  className: string;
  nominal: number;
}

export function validateScholarshipData(
  data: ScholarshipExcelRow[],
  validStudentNis: string[],
  validClassNames: string[],
): {
  valid: ValidatedScholarshipRow[];
  errors: Array<{ row: number; errors: string[] }>;
} {
  const valid: ValidatedScholarshipRow[] = [];
  const errors: Array<{ row: number; errors: string[] }> = [];

  data.forEach((row, index) => {
    const rowErrors: string[] = [];
    const rowNum = index + 2;

    if (!row["Student NIS"] && !row.Class && !row.Nominal) {
      return;
    }

    const nis = String(row["Student NIS"]).trim();
    if (!nis) {
      rowErrors.push("Student NIS is required");
    } else if (!validStudentNis.includes(nis)) {
      rowErrors.push(`Student NIS "${nis}" not found`);
    }

    const className = String(row.Class).trim();
    if (!className) {
      rowErrors.push("Class is required");
    } else if (!validClassNames.includes(className)) {
      rowErrors.push(`Class "${className}" not found`);
    }

    const nominal = Number(row.Nominal);
    if (!row.Nominal && row.Nominal !== 0) {
      rowErrors.push("Nominal is required");
    } else if (Number.isNaN(nominal) || nominal < 0) {
      rowErrors.push("Nominal must be a positive number");
    }

    if (rowErrors.length > 0) {
      errors.push({ row: rowNum, errors: rowErrors });
    } else {
      valid.push({
        studentId: nis,
        studentName: String(row["Student Name"] || "").trim(),
        className,
        nominal,
      });
    }
  });

  return { valid, errors };
}
