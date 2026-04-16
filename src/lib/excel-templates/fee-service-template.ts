import * as XLSX from "xlsx";

export interface FeeServiceExcelRow {
  "Academic Year": string;
  Category: string;
  Name: string;
  Description: string;
}

export function createFeeServiceTemplate(
  academicYears: Array<{ id: string; year: string }>,
): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();

  const headers = ["Academic Year", "Category", "Name", "Description"];
  const wsData: string[][] = [headers];

  if (academicYears.length > 0) {
    wsData.push([
      academicYears[0].year,
      "TRANSPORT",
      "Bus Rute A",
      "Rute A kota",
    ]);
  }

  for (let i = 0; i < 99; i++) wsData.push(["", "", "", ""]);

  const worksheet = XLSX.utils.aoa_to_sheet(wsData);
  worksheet["!cols"] = [{ wch: 20 }, { wch: 18 }, { wch: 30 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(workbook, worksheet, "Fee Services");

  const refData = [["Academic Year"]];
  for (const ay of academicYears) refData.push([ay.year]);
  const refSheet = XLSX.utils.aoa_to_sheet(refData);
  refSheet["!cols"] = [{ wch: 20 }];
  XLSX.utils.book_append_sheet(workbook, refSheet, "Reference");

  const catData = [["Category"], ["TRANSPORT"], ["ACCOMMODATION"]];
  const catSheet = XLSX.utils.aoa_to_sheet(catData);
  catSheet["!cols"] = [{ wch: 18 }];
  XLSX.utils.book_append_sheet(workbook, catSheet, "Categories");

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
