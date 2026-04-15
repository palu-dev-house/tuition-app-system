import type { NextRequest } from "next/server";
import { createApiHandler } from "@/lib/api-adapter";
import { requireAuth } from "@/lib/api-auth";
import { errorResponse, successResponse } from "@/lib/api-response";
import {
  type FeeServiceSummaryFilters,
  getFeeServiceSummary,
} from "@/lib/business-logic/fee-service-summary";
import { getServerT } from "@/lib/i18n-server";
import { prisma } from "@/lib/prisma";

async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const t = await getServerT(request);
  try {
    const searchParams = request.nextUrl.searchParams;

    const category = searchParams.get("category") || undefined;
    const billStatus = searchParams.get("billStatus") || undefined;

    const filters: FeeServiceSummaryFilters = {
      academicYearId: searchParams.get("academicYearId") || undefined,
      category:
        category === "TRANSPORT" || category === "ACCOMMODATION"
          ? category
          : undefined,
      feeServiceId: searchParams.get("feeServiceId") || undefined,
      billStatus:
        billStatus === "UNPAID" ||
        billStatus === "PARTIAL" ||
        billStatus === "PAID" ||
        billStatus === "VOID"
          ? billStatus
          : undefined,
      classId: searchParams.get("classId") || undefined,
      monthFrom: searchParams.get("monthFrom") || undefined,
      monthTo: searchParams.get("monthTo") || undefined,
      search: searchParams.get("search") || undefined,
      page: searchParams.get("page")
        ? Number(searchParams.get("page"))
        : undefined,
      limit: searchParams.get("limit")
        ? Number(searchParams.get("limit"))
        : undefined,
    };

    const result = await getFeeServiceSummary(filters, prisma);
    return successResponse(result);
  } catch (error) {
    console.error("Fee service summary error:", error);
    return errorResponse(t("api.internalError"), "SERVER_ERROR", 500);
  }
}

export default createApiHandler({ GET });
