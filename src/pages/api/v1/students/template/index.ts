import type { NextRequest } from "next/server";
import { createApiHandler } from "@/lib/api-adapter";
import { requireRole } from "@/lib/api-auth";
import { createStudentTemplate } from "@/lib/excel-templates/student-template";
import { exceljsToBuffer } from "@/lib/exceljs-utils";

async function GET(request: NextRequest) {
  const auth = await requireRole(request, ["ADMIN"]);
  if (auth instanceof Response) return auth;

  const workbook = createStudentTemplate();
  const buffer = await exceljsToBuffer(workbook);

  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="student-import-template.xlsx"',
    },
  });
}

export default createApiHandler({ GET });
