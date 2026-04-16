import type { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import type { Month } from "@/generated/prisma/client";
import { createApiHandler } from "@/lib/api-adapter";
import { requireRole } from "@/lib/api-auth";
import { errorResponse, successResponse } from "@/lib/api-response";
import {
  type ServiceFeeExcelRow,
  validateServiceFeeData,
} from "@/lib/excel-templates/service-fee-template";
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
    const data = XLSX.utils.sheet_to_json<ServiceFeeExcelRow>(firstSheet);

    if (data.length === 0) {
      return errorResponse(t("api.excelEmpty"), "VALIDATION_ERROR", 400);
    }

    const classes = await prisma.classAcademic.findMany({
      select: { id: true, className: true },
    });
    const classMap = new Map(classes.map((c) => [c.className, c.id]));

    const { valid, errors } = validateServiceFeeData(data, classMap);

    if (valid.length === 0) {
      return successResponse({ imported: 0, skipped: 0, errors });
    }

    let imported = 0;
    let skipped = 0;
    const importErrors: Array<{ row: number; error: string }> = [];

    for (const row of valid) {
      try {
        const existing = await prisma.serviceFee.findFirst({
          where: {
            classAcademicId: row.classAcademicId,
            name: row.name,
          },
        });

        if (existing) {
          skipped++;
          continue;
        }

        await prisma.serviceFee.create({
          data: {
            classAcademicId: row.classAcademicId,
            name: row.name,
            amount: row.amount,
            billingMonths: row.billingMonths as Month[],
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
    console.error("Import service-fees error:", error);
    return errorResponse(
      t("api.importFailed", { resource: "service fees" }),
      "SERVER_ERROR",
      500,
    );
  }
}

export default createApiHandler({ POST });
