import ExcelJS from "exceljs";
import {
  addRefColumn,
  applyListValidation,
  inlineListFormula,
} from "../exceljs-utils";

const LAST_ROW = 1000;
const GRADES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

export function createClassTemplate(academicYears: string[]): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Classes");

  const columns: Array<{ header: string; width: number }> = [
    { header: "Academic Year", width: 20 },
    { header: "Grade", width: 10 },
    { header: "Section", width: 15 },
  ];
  sheet.addRow(columns.map((c) => c.header));
  sheet.columns.forEach((col, i) => {
    col.width = columns[i].width;
  });

  sheet.addRow([academicYears[0] || "2024/2025", 12, "IPA"]);
  sheet.addRow([academicYears[0] || "2024/2025", 12, "IPS"]);

  // Academic Year dropdown (col A) — backed by hidden _refs sheet.
  const yearRange = addRefColumn(workbook, "Academic Year", academicYears);
  if (yearRange) {
    applyListValidation(sheet, "A", 2, LAST_ROW, [`=${yearRange}`], {
      promptTitle: "Academic Year",
      prompt: "Select an academic year.",
    });
  }

  // Grade dropdown (col B) — inline list 1..12.
  applyListValidation(sheet, "B", 2, LAST_ROW, [inlineListFormula(GRADES)], {
    promptTitle: "Grade",
    prompt: "SD: 1-6, SMP: 7-9, SMA: 10-12.",
  });

  return workbook;
}
