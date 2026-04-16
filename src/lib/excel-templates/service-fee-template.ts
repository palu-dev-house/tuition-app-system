import * as XLSX from "xlsx";

export interface ServiceFeeExcelRow {
  Class: string;
  Name: string;
  Amount: number;
  "Billing Months": string;
}

export function createServiceFeeTemplate(
  classes: Array<{ id: string; className: string }>,
): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();

  const headers = ["Class", "Name", "Amount", "Billing Months"];
  const wsData: (string | number)[][] = [headers];

  if (classes.length > 0) {
    wsData.push([
      classes[0].className,
      "Uang Perlengkapan",
      750000,
      "JULY,JANUARY",
    ]);
  }

  for (let i = 0; i < 99; i++) wsData.push(["", "", "", ""]);

  const worksheet = XLSX.utils.aoa_to_sheet(wsData);
  worksheet["!cols"] = [{ wch: 25 }, { wch: 30 }, { wch: 15 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(workbook, worksheet, "Service Fees");

  const classData = [["Class Name"]];
  for (const c of classes) classData.push([c.className]);
  const classSheet = XLSX.utils.aoa_to_sheet(classData);
  classSheet["!cols"] = [{ wch: 25 }];
  XLSX.utils.book_append_sheet(workbook, classSheet, "Classes Reference");

  const monthData = [
    ["Month"],
    ["JULY"],
    ["AUGUST"],
    ["SEPTEMBER"],
    ["OCTOBER"],
    ["NOVEMBER"],
    ["DECEMBER"],
    ["JANUARY"],
    ["FEBRUARY"],
    ["MARCH"],
    ["APRIL"],
    ["MAY"],
    ["JUNE"],
  ];
  const monthSheet = XLSX.utils.aoa_to_sheet(monthData);
  monthSheet["!cols"] = [{ wch: 15 }];
  XLSX.utils.book_append_sheet(workbook, monthSheet, "Months Reference");

  return workbook;
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
