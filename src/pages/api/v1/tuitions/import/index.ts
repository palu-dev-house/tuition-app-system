import type { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { createApiHandler } from "@/lib/api-adapter";
import { requireRole } from "@/lib/api-auth";
import { errorResponse, successResponse } from "@/lib/api-response";
import {
  calculatePeriodDiscount,
  getApplicableDiscounts,
} from "@/lib/business-logic/discount-processor";
import { generateTuitions } from "@/lib/business-logic/tuition-generator";
import { mapWithConcurrency } from "@/lib/concurrency";
import {
  type TuitionExcelRow,
  validateTuitionData,
} from "@/lib/excel-templates/tuition-template";
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
    const data = XLSX.utils.sheet_to_json<TuitionExcelRow>(firstSheet);

    if (data.length === 0) {
      return errorResponse(t("api.excelEmpty"), "VALIDATION_ERROR", 400);
    }

    const classes = await prisma.classAcademic.findMany({
      include: { academicYear: true },
    });
    const classMap = new Map(classes.map((c) => [c.className, c.id]));

    const { valid, errors } = validateTuitionData(data, classMap);

    if (valid.length === 0) {
      return successResponse({
        generated: 0,
        skipped: 0,
        feesSaved: 0,
        errors,
      });
    }

    // Save fees to the class master first, so classes without enrolled
    // students keep their fee and tuitions generate automatically when
    // students are assigned later. Batched: one updateMany per distinct fee.
    const classIdsByFee = new Map<number, string[]>();
    for (const row of valid) {
      const ids = classIdsByFee.get(row.feeAmount) ?? [];
      ids.push(row.classAcademicId);
      classIdsByFee.set(row.feeAmount, ids);
    }
    await prisma.$transaction(
      [...classIdsByFee.entries()].map(([feeAmount, ids]) =>
        prisma.classAcademic.updateMany({
          where: { id: { in: ids } },
          data: { monthlyFee: feeAmount },
        }),
      ),
    );

    // Process classes in parallel (bounded below the pg pool of 10) with the
    // per-class reads batched via Promise.all.
    const rowResults = await mapWithConcurrency(valid, 5, async (row, i) => {
      try {
        const classAcademic = classes.find((c) => c.id === row.classAcademicId);
        if (!classAcademic) {
          return { generated: 0, skipped: 0, pending: 0 };
        }

        const [studentClasses, applicableDiscounts] = await Promise.all([
          prisma.studentClass.findMany({
            where: { classAcademicId: row.classAcademicId },
            include: {
              student: {
                select: { id: true, startJoinDate: true, exitedAt: true },
              },
            },
          }),
          getApplicableDiscounts(
            row.classAcademicId,
            classAcademic.academicYearId,
            prisma,
          ),
        ]);
        const students = studentClasses.map((sc) => sc.student);

        if (students.length === 0) {
          // Fee is saved on the class; tuitions will be generated when
          // students are assigned.
          return { generated: 0, skipped: 0, pending: 1 };
        }

        // Generate tuition records (MONTHLY)
        const tuitionsToCreate = generateTuitions({
          classAcademicId: row.classAcademicId,
          frequency: "MONTHLY",
          feeAmount: row.feeAmount,
          students: students.map((s) => ({
            id: s.id,
            startJoinDate: s.startJoinDate,
            exitedAt: s.exitedAt,
          })),
          academicYear: {
            startDate: classAcademic.academicYear.startDate,
            endDate: classAcademic.academicYear.endDate,
          },
        });

        // Check for existing tuitions
        const existingTuitions = await prisma.tuition.findMany({
          where: {
            classAcademicId: row.classAcademicId,
            studentId: { in: students.map((s) => s.id) },
          },
          select: { studentId: true, period: true, year: true },
        });

        const existingKeys = new Set(
          existingTuitions.map((t) => `${t.studentId}-${t.period}-${t.year}`),
        );

        const newTuitions = tuitionsToCreate.filter(
          (t) => !existingKeys.has(`${t.studentId}-${t.period}-${t.year}`),
        );

        if (newTuitions.length > 0) {
          await prisma.tuition.createMany({
            data: newTuitions.map((t) => {
              const { discountAmount, discountId } = calculatePeriodDiscount(
                t.period,
                applicableDiscounts,
                row.classAcademicId,
              );

              return {
                classAcademicId: t.classAcademicId,
                studentId: t.studentId,
                period: t.period,
                month: t.month,
                year: t.year,
                feeAmount: t.feeAmount,
                dueDate: t.dueDate,
                status: t.status,
                discountAmount,
                discountId,
              };
            }),
            skipDuplicates: true,
          });
        }

        return {
          generated: newTuitions.length,
          skipped: tuitionsToCreate.length - newTuitions.length,
          pending: 0,
        };
      } catch (error) {
        return {
          generated: 0,
          skipped: 0,
          pending: 0,
          error: {
            row: i + 2,
            error: error instanceof Error ? error.message : "Unknown error",
          },
        };
      }
    });

    let totalGenerated = 0;
    let totalSkipped = 0;
    let pendingClasses = 0;
    const importErrors: Array<{ row: number; error: string }> = [];
    for (const r of rowResults) {
      totalGenerated += r.generated;
      totalSkipped += r.skipped;
      pendingClasses += r.pending;
      if ("error" in r && r.error) importErrors.push(r.error);
    }

    return successResponse({
      generated: totalGenerated,
      skipped: totalSkipped,
      feesSaved: valid.length,
      pendingClasses,
      errors: [...errors, ...importErrors],
    });
  } catch (error) {
    console.error("Import tuitions error:", error);
    return errorResponse(
      t("api.importFailed", { resource: "tuitions" }),
      "SERVER_ERROR",
      500,
    );
  }
}

export default createApiHandler({ POST });

export const config = { api: { bodyParser: false } };
