import type { NextRequest } from "next/server";
import { createApiHandler } from "@/lib/api-adapter";
import { requireRole } from "@/lib/api-auth";
import { createServiceFeeTemplate } from "@/lib/excel-templates/service-fee-template";
import { exceljsToBuffer } from "@/lib/exceljs-utils";
import { prisma } from "@/lib/prisma";

async function GET(request: NextRequest) {
  const auth = await requireRole(request, ["ADMIN"]);
  if (auth instanceof Response) return auth;

  try {
    const classes = await prisma.classAcademic.findMany({
      select: { id: true, className: true },
      orderBy: { className: "asc" },
    });

    const workbook = createServiceFeeTemplate(classes);
    const buffer = await exceljsToBuffer(workbook);

    return new Response(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="service-fee-import-template.xlsx"',
      },
    });
  } catch (error) {
    console.error("Generate service-fee template error:", error);
    return new Response("Failed to generate template", { status: 500 });
  }
}

export default createApiHandler({ GET });
