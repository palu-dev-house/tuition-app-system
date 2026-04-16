import type { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { createApiHandler } from "@/lib/api-adapter";
import { requireRole } from "@/lib/api-auth";
import { errorResponse, successResponse } from "@/lib/api-response";
import {
  type FeeServiceExcelRow,
  validateFeeServiceData,
} from "@/lib/excel-templates/fee-service-template";
import { getServerT } from "@/lib/i18n-server";
import { prisma } from "@/lib/prisma";

async function POST(request: NextRequest) {
  const auth = await requireRole(request, ["ADMIN"]);
  if (auth instanceof Response) return auth;

  const t = await getServerT(request);
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return errorResponse(t("api.fileRequired"), "VALIDATION_ERROR", 400);
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json<FeeServiceExcelRow>(firstSheet);

    if (data.length === 0) {
      return errorResponse(t("api.excelEmpty"), "VALIDATION_ERROR", 400);
    }

    const academicYears = await prisma.academicYear.findMany({
      select: { id: true, year: true },
    });
    const yearMap = new Map(academicYears.map((ay) => [ay.year, ay.id]));

    const { valid, errors } = validateFeeServiceData(data, yearMap);

    if (valid.length === 0) {
      return successResponse({ imported: 0, skipped: 0, errors });
    }

    let imported = 0;
    let skipped = 0;
    const importErrors: Array<{ row: number; error: string }> = [];

    for (const row of valid) {
      try {
        const existing = await prisma.feeService.findFirst({
          where: {
            academicYearId: row.academicYearId,
            category: row.category,
            name: row.name,
          },
        });

        if (existing) {
          skipped++;
          continue;
        }

        await prisma.feeService.create({
          data: {
            academicYearId: row.academicYearId,
            category: row.category,
            name: row.name,
            description: row.description,
          },
        });
        imported++;
      } catch (error) {
        importErrors.push({
          row: valid.indexOf(row) + 2,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return successResponse({
      imported,
      skipped,
      errors: [...errors, ...importErrors],
    });
  } catch (error) {
    console.error("Import fee-services error:", error);
    return errorResponse(
      t("api.importFailed", { resource: "fee services" }),
      "SERVER_ERROR",
      500,
    );
  }
}

export default createApiHandler({ POST });
