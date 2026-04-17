import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { addRefColumn, applyListValidation } from "../exceljs-utils";

const LAST_ROW = 1000;

export function generateStudentClassTemplate(
  students: Array<{ nis: string; name: string }>,
  classes: Array<{ id: string; className: string }>,
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();

  // Instructions sheet
  const instructions = workbook.addWorksheet("Instructions");
  const instructionRows = [
    ["Student Class Assignment Import Template"],
    [""],
    ["Instructions:"],
    ["1. Fill in the Student NIS and Class Name columns"],
    ["2. Student NIS must match an existing student"],
    ["3. Class Name must match an existing class exactly"],
    ["4. You can copy data from the reference sheets"],
    [""],
    ["Columns:"],
    ["- Student NIS: The student's NIS number (required)"],
    ["- Student Name: For reference only (not imported)"],
    ["- Class Name: The class to assign the student to (required)"],
  ];
  for (const row of instructionRows) instructions.addRow(row);
  instructions.getColumn(1).width = 60;

  // Data entry sheet
  const dataSheet = workbook.addWorksheet("Import Data");
  dataSheet.addRow(["Student NIS", "Student Name (Reference)", "Class Name"]);
  [15, 30, 25].forEach((w, i) => {
    dataSheet.getColumn(i + 1).width = w;
  });

  // Visible reference sheets preserved.
  const studentsSheet = workbook.addWorksheet("Students List");
  studentsSheet.addRow(["Student NIS", "Student Name"]);
  for (const s of students) studentsSheet.addRow([s.nis, s.name]);
  studentsSheet.getColumn(1).width = 15;
  studentsSheet.getColumn(2).width = 30;

  const classesSheet = workbook.addWorksheet("Classes List");
  classesSheet.addRow(["Class ID", "Class Name"]);
  for (const c of classes) classesSheet.addRow([c.id, c.className]);
  classesSheet.getColumn(1).width = 40;
  classesSheet.getColumn(2).width = 25;

  // Dropdowns on the Import Data sheet.
  const nisRange = addRefColumn(
    workbook,
    "NIS",
    students.map((s) => s.nis),
  );
  if (nisRange) {
    applyListValidation(dataSheet, "A", 2, LAST_ROW, [`=${nisRange}`], {
      promptTitle: "Student NIS",
      prompt: "Pick a student NIS.",
    });
  }

  const classRange = addRefColumn(
    workbook,
    "Class",
    classes.map((c) => c.className),
  );
  if (classRange) {
    applyListValidation(dataSheet, "C", 2, LAST_ROW, [`=${classRange}`], {
      promptTitle: "Class Name",
      prompt: "Pick a class name.",
    });
  }

  return workbook;
}

export interface StudentClassImportRow {
  studentId: string;
  className: string;
  rowNumber: number;
}

export function parseStudentClassImport(buffer: ArrayBuffer): {
  rows: StudentClassImportRow[];
  errors: string[];
} {
  const workbook = XLSX.read(buffer, { type: "array" });

  // Find the data sheet
  const sheetName =
    workbook.SheetNames.find(
      (name) =>
        name.toLowerCase().includes("import") ||
        name.toLowerCase().includes("data"),
    ) || workbook.SheetNames[0];

  const worksheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: "",
  });

  const rows: StudentClassImportRow[] = [];
  const errors: string[] = [];

  // Skip header row
  for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i] as unknown[];
    const rowNumber = i + 1;

    if (!row || row.length === 0 || (!row[0] && !row[2])) {
      continue; // Skip empty rows
    }

    const studentId = String(row[0] || "").trim();
    const className = String(row[2] || "").trim();

    if (!studentId) {
      errors.push(`Row ${rowNumber}: Student NIS is required`);
      continue;
    }

    if (!className) {
      errors.push(`Row ${rowNumber}: Class Name is required`);
      continue;
    }

    rows.push({
      studentId,
      className,
      rowNumber,
    });
  }

  return { rows, errors };
}
