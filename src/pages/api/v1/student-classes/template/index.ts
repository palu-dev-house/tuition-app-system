import type { NextRequest } from "next/server";
import { createApiHandler } from "@/lib/api-adapter";
import { requireAuth } from "@/lib/api-auth";
import { generateStudentClassTemplate } from "@/lib/excel-templates/student-class-template";
import { exceljsToBuffer } from "@/lib/exceljs-utils";
import { prisma } from "@/lib/prisma";

async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const searchParams = request.nextUrl.searchParams;
  const academicYearId = searchParams.get("academicYearId") || undefined;

  const students = await prisma.student.findMany({
    select: { nis: true, name: true },
    orderBy: { name: "asc" },
  });

  const classWhere: Record<string, unknown> = {};
  if (academicYearId) {
    classWhere.academicYearId = academicYearId;
  } else {
    const activeYear = await prisma.academicYear.findFirst({
      where: { isActive: true },
    });
    if (activeYear) {
      classWhere.academicYearId = activeYear.id;
    }
  }

  const classes = await prisma.classAcademic.findMany({
    where: classWhere,
    select: { id: true, className: true },
    orderBy: [{ grade: "asc" }, { section: "asc" }],
  });

  const workbook = generateStudentClassTemplate(students, classes);
  const buffer = await exceljsToBuffer(workbook);

  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="student-class-assignment-template.xlsx"',
    },
  });
}

export default createApiHandler({ GET });
