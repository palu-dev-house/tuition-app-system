import type { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { createApiHandler } from "@/lib/api-adapter";
import { requireRole } from "@/lib/api-auth";
import { createFeeServiceTemplate } from "@/lib/excel-templates/fee-service-template";
import { prisma } from "@/lib/prisma";

async function GET(request: NextRequest) {
  const auth = await requireRole(request, ["ADMIN"]);
  if (auth instanceof Response) return auth;

  try {
    const academicYears = await prisma.academicYear.findMany({
      select: { id: true, year: true },
      orderBy: { year: "desc" },
    });

    const workbook = createFeeServiceTemplate(academicYears);
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    return new Response(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="fee-service-import-template.xlsx"',
      },
    });
  } catch (error) {
    console.error("Generate fee-service template error:", error);
    return new Response("Failed to generate template", { status: 500 });
  }
}

export default createApiHandler({ GET });
