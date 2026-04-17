import type ExcelJS from "exceljs";

export async function exceljsToBuffer(
  workbook: ExcelJS.Workbook,
): Promise<ArrayBuffer> {
  const buf = (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
  // exceljs returns a Node Buffer, which is a Uint8Array view over an
  // ArrayBuffer. Return a plain ArrayBuffer slice so it is directly
  // assignable to the Fetch `BodyInit` type used by the Web `Response`.
  return buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength,
  ) as ArrayBuffer;
}

/**
 * Apply a list data validation to every cell in a column for a given row range.
 * Uses an inline formula (comma-separated) when `inline` is provided, otherwise
 * uses a sheet reference formula (e.g. `_refs!$A$2:$A$100`).
 */
export function applyListValidation(
  worksheet: ExcelJS.Worksheet,
  columnLetter: string,
  firstRow: number,
  lastRow: number,
  formulae: string[],
  options: { allowBlank?: boolean; promptTitle?: string; prompt?: string } = {},
): void {
  for (let r = firstRow; r <= lastRow; r++) {
    const cell = worksheet.getCell(`${columnLetter}${r}`);
    cell.dataValidation = {
      type: "list",
      allowBlank: options.allowBlank ?? true,
      formulae,
      showErrorMessage: true,
      errorStyle: "error",
      errorTitle: "Invalid value",
      error: "Please pick a value from the dropdown.",
      ...(options.promptTitle || options.prompt
        ? {
            showInputMessage: true,
            promptTitle: options.promptTitle,
            prompt: options.prompt,
          }
        : {}),
    };
  }
}

/**
 * Convert zero-based column index to Excel letter (0 -> A, 25 -> Z, 26 -> AA).
 */
export function columnLetter(index: number): string {
  let n = index;
  let s = "";
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

/**
 * Build an inline list-validation formula. Excel requires the entire list to
 * be wrapped in double quotes, so embedded quotes must be doubled.
 */
export function inlineListFormula(values: string[]): string {
  const escaped = values.map((v) => v.replace(/"/g, '""')).join(",");
  return `"${escaped}"`;
}

/**
 * Add (or reuse) a hidden reference sheet and append a column of values
 * under a header. Returns the absolute formula range of the value cells
 * (e.g. `_refs!$A$2:$A$11`) suitable for data validation.
 *
 * If `values` is empty the function returns null so callers can fall back.
 */
export function addRefColumn(
  workbook: ExcelJS.Workbook,
  header: string,
  values: string[],
  sheetName = "_refs",
): string | null {
  if (values.length === 0) return null;

  let sheet = workbook.getWorksheet(sheetName);
  if (!sheet) {
    sheet = workbook.addWorksheet(sheetName, { state: "hidden" });
  }

  // Find next free column.
  const nextColIndex = sheet.columnCount; // 0 when empty, else last used
  const colLetter = columnLetter(nextColIndex);

  sheet.getCell(`${colLetter}1`).value = header;
  for (let i = 0; i < values.length; i++) {
    sheet.getCell(`${colLetter}${i + 2}`).value = values[i];
  }

  return `${sheetName}!$${colLetter}$2:$${colLetter}$${values.length + 1}`;
}
