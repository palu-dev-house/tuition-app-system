import type { PrismaClient } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";

export interface ServiceFeeSummaryFilters {
  academicYearId?: string;
  category?: "TRANSPORT" | "ACCOMMODATION";
  feeServiceId?: string;
  billStatus?: "UNPAID" | "PARTIAL" | "PAID" | "VOID";
  classId?: string;
  monthFrom?: string; // "YYYY-MM"
  monthTo?: string; // "YYYY-MM"
  search?: string;
  page?: number;
  limit?: number;
}

export interface ServiceFeeSummaryRow {
  feeServiceId: string;
  feeServiceName: string;
  category: "TRANSPORT" | "ACCOMMODATION";
  activeStudents: number;
  totalBilled: string;
  totalPaid: string;
  outstanding: string;
  overdueBills: number;
}

export interface ServiceFeeSummaryResult {
  data: ServiceFeeSummaryRow[];
  total: number;
  totalPages: number;
  page: number;
  limit: number;
  totals: { billed: string; paid: string; outstanding: string };
}

function monthToDate(ym: string, end = false): Date {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return new Date(Number.NaN);
  return end ? new Date(y, m, 0, 23, 59, 59, 999) : new Date(y, m - 1, 1);
}

export async function getServiceFeeSummary(
  filters: ServiceFeeSummaryFilters,
  prisma: PrismaClient,
): Promise<ServiceFeeSummaryResult> {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 20));

  // FeeBill has no academicYearId column — we scope via feeService relation.
  // FeeBill has no billingDate column — we approximate month range via dueDate.
  // FeeBill has no currentClass path on student — we walk studentClasses.
  const billWhere: Prisma.FeeBillWhereInput = {};
  if (filters.academicYearId) {
    billWhere.feeService = { is: { academicYearId: filters.academicYearId } };
  }
  if (filters.billStatus) billWhere.status = filters.billStatus;
  if (filters.monthFrom || filters.monthTo) {
    const dueDateFilter: Prisma.DateTimeFilter = {};
    if (filters.monthFrom) dueDateFilter.gte = monthToDate(filters.monthFrom);
    if (filters.monthTo) dueDateFilter.lte = monthToDate(filters.monthTo, true);
    billWhere.dueDate = dueDateFilter;
  }
  if (filters.classId) {
    billWhere.student = {
      is: {
        studentClasses: {
          some: { classAcademicId: filters.classId },
        },
      },
    };
  }

  const serviceWhere: Prisma.FeeServiceWhereInput = {};
  if (filters.category) serviceWhere.category = filters.category;
  if (filters.feeServiceId) serviceWhere.id = filters.feeServiceId;
  if (filters.search)
    serviceWhere.name = { contains: filters.search, mode: "insensitive" };
  // Academic year scoping applies to the fee service itself too.
  if (filters.academicYearId)
    serviceWhere.academicYearId = filters.academicYearId;

  const totalServices = await prisma.feeService.count({ where: serviceWhere });

  const services = await prisma.feeService.findMany({
    where: serviceWhere,
    orderBy: [{ category: "asc" }, { name: "asc" }],
    skip: (page - 1) * limit,
    take: limit,
  });

  const today = new Date();
  const rows: ServiceFeeSummaryRow[] = [];
  let grandBilled = new Prisma.Decimal(0);
  let grandPaid = new Prisma.Decimal(0);

  for (const svc of services) {
    const scopedWhere: Prisma.FeeBillWhereInput = {
      ...billWhere,
      feeServiceId: svc.id,
    };

    // "Active" subscription = not yet ended (endDate null or in the future).
    // FeeSubscription has no isActive/active flag and no academicYearId.
    // We scope to the fee service, which itself is scoped by academic year.
    const [agg, overdueCount, activeStudents] = await Promise.all([
      prisma.feeBill.aggregate({
        where: scopedWhere,
        _sum: { amount: true, paidAmount: true },
      }),
      prisma.feeBill.count({
        where: {
          ...scopedWhere,
          status: { in: ["UNPAID", "PARTIAL"] },
          dueDate: { lt: today },
        },
      }),
      prisma.feeSubscription.count({
        where: {
          feeServiceId: svc.id,
          OR: [{ endDate: null }, { endDate: { gte: today } }],
        },
      }),
    ]);

    const billed = agg._sum.amount ?? new Prisma.Decimal(0);
    const paid = agg._sum.paidAmount ?? new Prisma.Decimal(0);
    grandBilled = grandBilled.plus(billed);
    grandPaid = grandPaid.plus(paid);
    rows.push({
      feeServiceId: svc.id,
      feeServiceName: svc.name,
      category: svc.category as "TRANSPORT" | "ACCOMMODATION",
      activeStudents,
      totalBilled: billed.toString(),
      totalPaid: paid.toString(),
      outstanding: billed.minus(paid).toString(),
      overdueBills: overdueCount,
    });
  }

  return {
    data: rows,
    total: totalServices,
    totalPages: Math.max(1, Math.ceil(totalServices / limit)),
    page,
    limit,
    totals: {
      billed: grandBilled.toString(),
      paid: grandPaid.toString(),
      outstanding: grandBilled.minus(grandPaid).toString(),
    },
  };
}
