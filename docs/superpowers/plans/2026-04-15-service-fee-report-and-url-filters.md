# Service Fee Report + URL-Persisted Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a unified Service Fee Summary report (with category filter for transport/accommodation) and a reusable `useQueryFilters` hook that makes URL query params the source of truth for filters + pagination across every admin list and report page.

**Architecture:**
- One typed hook (`useQueryFilters`) backed by `next/router` shallow `replace` + Zod validation, auto-resets `page=1` on filter change.
- New Service Fee Summary report page + API route + business-logic function, grouped by `FeeService`, honoring all filters in URL.
- Mechanical migration of 12 table components and 6 admin pages from local `useState` filters → the new hook.

**Tech Stack:** Next.js 14 Pages Router, React 18, TanStack Query v5, Mantine UI v8, Zod, Prisma 7, next-intl, ExcelJS.

**Spec:** `docs/superpowers/specs/2026-04-15-service-fee-report-and-url-filters-design.md`

**Testing note:** This codebase has no unit-test runner. Verification uses `pnpm type-check`, `pnpm lint`, and manual browser QA. Each task defines an explicit verification step.

**Commit style (repo convention):**
```
<type>(<scope>): <summary>
```
Types: `feat`, `fix`, `refactor`, `docs`, `chore`. Example: `feat(reports): add service fee summary page`.

---

## Phase 1 — Reusable Hook

### Task 1: Create `useQueryFilters` hook

**Files:**
- Create: `src/hooks/useQueryFilters.ts`

- [ ] **Step 1: Create the hook file**

Write `src/hooks/useQueryFilters.ts`:

```ts
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ZodObject, ZodRawShape, z } from "zod";

type Query = Record<string, string | string[] | undefined>;

function toQueryValue(value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (Array.isArray(value)) {
    if (value.length === 0) return undefined;
    return value.map(String).join(",");
  }
  if (typeof value === "boolean") return value ? "true" : undefined;
  return String(value);
}

function pruneQuery(query: Query): Query {
  const out: Query = {};
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    out[k] = v;
  }
  return out;
}

export interface UseQueryFiltersOptions<TShape extends ZodRawShape> {
  schema: ZodObject<TShape>;
  defaultPage?: number;
  defaultLimit?: number;
  pageResetKeys?: Array<keyof z.infer<ZodObject<TShape>>>;
  debounceKeys?: Array<keyof z.infer<ZodObject<TShape>>>;
  debounceMs?: number;
}

export function useQueryFilters<TShape extends ZodRawShape>(
  options: UseQueryFiltersOptions<TShape>,
) {
  type Filters = z.infer<ZodObject<TShape>>;
  const {
    schema,
    defaultPage = 1,
    defaultLimit = 20,
    pageResetKeys,
    debounceKeys,
    debounceMs = 300,
  } = options;

  const router = useRouter();
  const filterKeys = useMemo(() => Object.keys(schema.shape) as (keyof Filters)[], [schema]);
  const debouncedSet = useMemo(
    () => new Set<string>(
      (debounceKeys as string[] | undefined) ??
        filterKeys.filter((k) => k === "search" || k === "q").map(String),
    ),
    [debounceKeys, filterKeys],
  );
  const resetSet = useMemo(
    () => new Set<string>(
      (pageResetKeys as string[] | undefined) ?? filterKeys.map(String),
    ),
    [pageResetKeys, filterKeys],
  );

  const parseFromQuery = useCallback(
    (raw: Query): Filters => {
      const candidate: Record<string, unknown> = {};
      for (const key of filterKeys) {
        const v = raw[key as string];
        if (v === undefined) continue;
        const shape = (schema.shape as Record<string, { _def: { typeName?: string } }>)[key as string];
        const isArray = shape?._def?.typeName === "ZodArray";
        if (isArray && typeof v === "string") candidate[key as string] = v.split(",").filter(Boolean);
        else candidate[key as string] = Array.isArray(v) ? v[0] : v;
      }
      const parsed = schema.safeParse(candidate);
      return parsed.success ? (parsed.data as Filters) : (schema.parse({}) as Filters);
    },
    [filterKeys, schema],
  );

  const filters = useMemo(() => parseFromQuery(router.query as Query), [router.query, parseFromQuery]);
  const page = Number.parseInt((router.query.page as string) ?? "", 10) || defaultPage;
  const limit = Number.parseInt((router.query.limit as string) ?? "", 10) || defaultLimit;

  const [searchDrafts, setSearchDrafts] = useState<Record<string, string>>({});
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Flush drafts back to URL on debounce timer fire.
  useEffect(
    () => () => {
      for (const t of Object.values(debounceTimers.current)) clearTimeout(t);
    },
    [],
  );

  const writeQuery = useCallback(
    (patch: Query, resetPage: boolean) => {
      if (!router.isReady) return;
      const next: Query = { ...(router.query as Query), ...patch };
      if (resetPage) next.page = String(defaultPage);
      const pruned = pruneQuery(next);
      if (String(pruned.page ?? "") === String(defaultPage)) delete pruned.page;
      if (String(pruned.limit ?? "") === String(defaultLimit)) delete pruned.limit;
      router.replace({ pathname: router.pathname, query: pruned }, undefined, {
        shallow: true,
      });
    },
    [router, defaultPage, defaultLimit],
  );

  const setFilter = useCallback(
    <K extends keyof Filters>(key: K, value: Filters[K] | null) => {
      const keyStr = String(key);
      const serialized = toQueryValue(value);
      const shouldResetPage = resetSet.has(keyStr);
      if (debouncedSet.has(keyStr)) {
        setSearchDrafts((d) => ({ ...d, [keyStr]: (value as string) ?? "" }));
        if (debounceTimers.current[keyStr]) clearTimeout(debounceTimers.current[keyStr]);
        debounceTimers.current[keyStr] = setTimeout(() => {
          writeQuery({ [keyStr]: serialized }, shouldResetPage);
        }, debounceMs);
      } else {
        writeQuery({ [keyStr]: serialized }, shouldResetPage);
      }
    },
    [debouncedSet, resetSet, writeQuery, debounceMs],
  );

  const setFilters = useCallback(
    (patch: Partial<Filters>) => {
      const out: Query = {};
      let shouldResetPage = false;
      for (const [k, v] of Object.entries(patch)) {
        out[k] = toQueryValue(v);
        if (resetSet.has(k)) shouldResetPage = true;
      }
      writeQuery(out, shouldResetPage);
    },
    [resetSet, writeQuery],
  );

  const setPage = useCallback(
    (nextPage: number) => {
      writeQuery({ page: nextPage === defaultPage ? undefined : String(nextPage) }, false);
    },
    [writeQuery, defaultPage],
  );

  const setLimit = useCallback(
    (nextLimit: number) => {
      writeQuery(
        { limit: nextLimit === defaultLimit ? undefined : String(nextLimit) },
        true,
      );
    },
    [writeQuery, defaultLimit],
  );

  const reset = useCallback(() => {
    if (!router.isReady) return;
    const current = { ...(router.query as Query) };
    for (const k of filterKeys) delete current[k as string];
    delete current.page;
    delete current.limit;
    router.replace({ pathname: router.pathname, query: current }, undefined, {
      shallow: true,
    });
  }, [router, filterKeys]);

  // Expose draft values for debounced inputs (controlled components).
  const drafts = useMemo(() => {
    const out: Record<string, string> = {};
    for (const key of debouncedSet) {
      out[key] = key in searchDrafts ? searchDrafts[key] : ((filters as Record<string, unknown>)[key] as string) ?? "";
    }
    return out;
  }, [debouncedSet, searchDrafts, filters]);

  return {
    filters,
    page,
    limit,
    isReady: router.isReady,
    drafts,
    setFilter,
    setFilters,
    setPage,
    setLimit,
    reset,
  };
}
```

- [ ] **Step 2: Verify compile**

Run: `pnpm type-check`
Expected: clean (no errors from the new file).

- [ ] **Step 3: Lint**

Run: `pnpm lint src/hooks/useQueryFilters.ts`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useQueryFilters.ts
git commit -m "feat(hooks): add useQueryFilters for URL-persisted filters"
```

---

## Phase 2 — Service Fee Summary Report

### Task 2: Add business-logic function `getFeeServiceSummary`

**Files:**
- Create: `src/lib/business-logic/fee-service-summary.ts`

- [ ] **Step 1: Inspect neighbor logic for conventions**

Read `src/lib/business-logic/overdue-calculator.ts` (source for `getClassSummary`) to reuse Prisma shapes and decimal handling conventions. Match its import style and return-shape style.

- [ ] **Step 2: Write the module**

Create `src/lib/business-logic/fee-service-summary.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";

export interface FeeServiceSummaryFilters {
  academicYearId?: string;
  category?: "TRANSPORT" | "ACCOMMODATION";
  feeServiceId?: string;
  billStatus?: "UNPAID" | "PARTIAL" | "PAID" | "VOID";
  classId?: string;
  monthFrom?: string; // "YYYY-MM"
  monthTo?: string;   // "YYYY-MM"
  search?: string;
  page?: number;
  limit?: number;
}

export interface FeeServiceSummaryRow {
  feeServiceId: string;
  feeServiceName: string;
  category: "TRANSPORT" | "ACCOMMODATION";
  activeStudents: number;
  totalBilled: string;
  totalPaid: string;
  outstanding: string;
  overdueBills: number;
}

export interface FeeServiceSummaryResult {
  data: FeeServiceSummaryRow[];
  total: number;
  totalPages: number;
  page: number;
  limit: number;
  totals: { billed: string; paid: string; outstanding: string };
}

function monthToDate(ym: string, end = false): Date {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return new Date(NaN);
  return end ? new Date(y, m, 0, 23, 59, 59, 999) : new Date(y, m - 1, 1);
}

export async function getFeeServiceSummary(
  filters: FeeServiceSummaryFilters,
  prisma: PrismaClient,
): Promise<FeeServiceSummaryResult> {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 20));

  const billWhere: Prisma.ServiceFeeBillWhereInput = {};
  if (filters.academicYearId) billWhere.academicYearId = filters.academicYearId;
  if (filters.billStatus) billWhere.status = filters.billStatus;
  if (filters.monthFrom || filters.monthTo) {
    billWhere.billingDate = {};
    if (filters.monthFrom)
      (billWhere.billingDate as Prisma.DateTimeFilter).gte = monthToDate(filters.monthFrom);
    if (filters.monthTo)
      (billWhere.billingDate as Prisma.DateTimeFilter).lte = monthToDate(filters.monthTo, true);
  }
  if (filters.classId) {
    billWhere.student = { is: { currentClass: { is: { classId: filters.classId } } } };
  }

  const serviceWhere: Prisma.FeeServiceWhereInput = {};
  if (filters.category) serviceWhere.category = filters.category;
  if (filters.feeServiceId) serviceWhere.feeServiceId = filters.feeServiceId;
  if (filters.search) serviceWhere.name = { contains: filters.search, mode: "insensitive" };

  const totalServices = await prisma.feeService.count({ where: serviceWhere });

  const services = await prisma.feeService.findMany({
    where: serviceWhere,
    orderBy: [{ category: "asc" }, { name: "asc" }],
    skip: (page - 1) * limit,
    take: limit,
  });

  const today = new Date();
  const rows: FeeServiceSummaryRow[] = [];
  let grandBilled = new Prisma.Decimal(0);
  let grandPaid = new Prisma.Decimal(0);

  for (const svc of services) {
    const scopedWhere: Prisma.ServiceFeeBillWhereInput = {
      ...billWhere,
      feeServiceId: svc.feeServiceId,
    };
    const [agg, overdueCount, activeStudents] = await Promise.all([
      prisma.serviceFeeBill.aggregate({
        where: scopedWhere,
        _sum: { amount: true, amountPaid: true },
      }),
      prisma.serviceFeeBill.count({
        where: {
          ...scopedWhere,
          status: { in: ["UNPAID", "PARTIAL"] },
          dueDate: { lt: today },
        },
      }),
      prisma.feeSubscription.count({
        where: {
          feeServiceId: svc.feeServiceId,
          active: true,
          ...(filters.academicYearId
            ? { academicYearId: filters.academicYearId }
            : {}),
        },
      }),
    ]);
    const billed = agg._sum.amount ?? new Prisma.Decimal(0);
    const paid = agg._sum.amountPaid ?? new Prisma.Decimal(0);
    grandBilled = grandBilled.plus(billed);
    grandPaid = grandPaid.plus(paid);
    rows.push({
      feeServiceId: svc.feeServiceId,
      feeServiceName: svc.name,
      category: svc.category,
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
```

- [ ] **Step 3: Verify against actual Prisma model names**

Run: `pnpm type-check`
If any field name is wrong (e.g. `feeSubscription.active` vs `isActive`), fix to match the schema and re-run. Do **not** move on until `pnpm type-check` passes.

- [ ] **Step 4: Commit**

```bash
git add src/lib/business-logic/fee-service-summary.ts
git commit -m "feat(reports): add service fee summary business logic"
```

---

### Task 3: Add API route `GET /api/v1/reports/fee-service-summary`

**Files:**
- Create: `src/pages/api/v1/reports/fee-service-summary/index.ts`

- [ ] **Step 1: Write the route**

```ts
import type { NextRequest } from "next/server";
import { createApiHandler } from "@/lib/api-adapter";
import { requireAuth } from "@/lib/api-auth";
import { errorResponse, successResponse } from "@/lib/api-response";
import { getFeeServiceSummary } from "@/lib/business-logic/fee-service-summary";
import { getServerT } from "@/lib/i18n-server";
import { prisma } from "@/lib/prisma";

async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const t = await getServerT(request);
  try {
    const sp = request.nextUrl.searchParams;
    const category = sp.get("category");
    const billStatus = sp.get("billStatus");
    const result = await getFeeServiceSummary(
      {
        academicYearId: sp.get("academicYearId") ?? undefined,
        category:
          category === "TRANSPORT" || category === "ACCOMMODATION"
            ? category
            : undefined,
        feeServiceId: sp.get("feeServiceId") ?? undefined,
        billStatus:
          billStatus === "UNPAID" ||
          billStatus === "PARTIAL" ||
          billStatus === "PAID" ||
          billStatus === "VOID"
            ? billStatus
            : undefined,
        classId: sp.get("classId") ?? undefined,
        monthFrom: sp.get("monthFrom") ?? undefined,
        monthTo: sp.get("monthTo") ?? undefined,
        search: sp.get("search") ?? undefined,
        page: Number.parseInt(sp.get("page") ?? "1", 10) || 1,
        limit: Number.parseInt(sp.get("limit") ?? "20", 10) || 20,
      },
      prisma,
    );
    return successResponse(result);
  } catch (error) {
    console.error("Service fee summary error:", error);
    return errorResponse(t("api.internalError"), "SERVER_ERROR", 500);
  }
}

export default createApiHandler({ GET });
```

- [ ] **Step 2: Smoke-test in dev**

Start dev server: `pnpm dev`
In another terminal, curl (replace cookie with a real admin session cookie or use the browser):
```bash
curl "http://localhost:3000/api/v1/reports/fee-service-summary?category=TRANSPORT&page=1&limit=5"
```
Expected: JSON with `data`, `totals`, `page`, `totalPages`.

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/v1/reports/fee-service-summary/index.ts
git commit -m "feat(api): add service fee summary report endpoint"
```

---

### Task 4: Add Excel export route

**Files:**
- Read first: `src/pages/api/v1/reports/class-summary/export/index.ts` (copy the ExcelJS pattern)
- Create: `src/pages/api/v1/reports/fee-service-summary/export/index.ts`

- [ ] **Step 1: Read the neighbor export**

Open `src/pages/api/v1/reports/class-summary/export/index.ts` and note how it builds the workbook, sets headers, and streams the file.

- [ ] **Step 2: Write the export route**

```ts
import ExcelJS from "exceljs";
import type { NextRequest } from "next/server";
import { createApiHandler } from "@/lib/api-adapter";
import { requireAuth } from "@/lib/api-auth";
import { errorResponse } from "@/lib/api-response";
import { getFeeServiceSummary } from "@/lib/business-logic/fee-service-summary";
import { getServerT } from "@/lib/i18n-server";
import { prisma } from "@/lib/prisma";

async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const t = await getServerT(request);
  try {
    const sp = request.nextUrl.searchParams;
    const category = sp.get("category");
    const billStatus = sp.get("billStatus");
    // Export: no pagination — request a large limit.
    const result = await getFeeServiceSummary(
      {
        academicYearId: sp.get("academicYearId") ?? undefined,
        category:
          category === "TRANSPORT" || category === "ACCOMMODATION"
            ? category
            : undefined,
        feeServiceId: sp.get("feeServiceId") ?? undefined,
        billStatus:
          billStatus === "UNPAID" ||
          billStatus === "PARTIAL" ||
          billStatus === "PAID" ||
          billStatus === "VOID"
            ? billStatus
            : undefined,
        classId: sp.get("classId") ?? undefined,
        monthFrom: sp.get("monthFrom") ?? undefined,
        monthTo: sp.get("monthTo") ?? undefined,
        search: sp.get("search") ?? undefined,
        page: 1,
        limit: 10000,
      },
      prisma,
    );

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Service Fee Summary");
    ws.columns = [
      { header: "Fee Service", key: "name", width: 32 },
      { header: "Category", key: "category", width: 16 },
      { header: "Active Students", key: "students", width: 16 },
      { header: "Total Billed", key: "billed", width: 18 },
      { header: "Total Paid", key: "paid", width: 18 },
      { header: "Outstanding", key: "outstanding", width: 18 },
      { header: "Overdue Bills", key: "overdue", width: 16 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const r of result.data) {
      ws.addRow({
        name: r.feeServiceName,
        category: r.category,
        students: r.activeStudents,
        billed: Number(r.totalBilled),
        paid: Number(r.totalPaid),
        outstanding: Number(r.outstanding),
        overdue: r.overdueBills,
      });
    }
    ws.addRow({});
    ws.addRow({
      name: "TOTAL",
      billed: Number(result.totals.billed),
      paid: Number(result.totals.paid),
      outstanding: Number(result.totals.outstanding),
    }).font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="fee-service-summary.xlsx"',
      },
    });
  } catch (error) {
    console.error("Service fee summary export error:", error);
    return errorResponse(t("api.internalError"), "SERVER_ERROR", 500);
  }
}

export default createApiHandler({ GET });
```

- [ ] **Step 2: Verify**

Run: `pnpm type-check`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/v1/reports/fee-service-summary/export/index.ts
git commit -m "feat(api): add service fee summary xlsx export"
```

---

### Task 5: Add React Query hooks

**Files:**
- Modify: `src/hooks/api/useReports.ts`
- Modify: `src/lib/query-keys.ts`

- [ ] **Step 1: Extend query-keys**

Open `src/lib/query-keys.ts`. Inside the `reports` namespace, add:

```ts
feeServiceSummary: (filters: Record<string, unknown>) =>
  [...queryKeys.reports.all, "fee-service-summary", filters] as const,
```

If the `reports` namespace does not exist yet, add it next to the other namespaces, following the existing factory style in the file. The `all` tuple should be `["reports"] as const`.

- [ ] **Step 2: Add the query + export hook**

Open `src/hooks/api/useReports.ts`. Read the existing `useExportClassSummary` and follow its conventions exactly. Add:

```ts
import type { FeeServiceSummaryFilters, FeeServiceSummaryResult } from "@/lib/business-logic/fee-service-summary";

export function useFeeServiceSummary(filters: FeeServiceSummaryFilters) {
  return useQuery({
    queryKey: queryKeys.reports.feeServiceSummary(filters as Record<string, unknown>),
    queryFn: async () => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(filters)) {
        if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
      }
      const res = await apiClient.get<{ data: FeeServiceSummaryResult }>(
        `/api/v1/reports/fee-service-summary?${params.toString()}`,
      );
      return res.data;
    },
    placeholderData: (previous) => previous,
  });
}

export function useExportFeeServiceSummary() {
  async function exportReport(filters: FeeServiceSummaryFilters) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) {
      if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
    }
    const response = await fetch(
      `/api/v1/reports/fee-service-summary/export?${params.toString()}`,
    );
    if (!response.ok) throw new Error("Export failed");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fee-service-summary.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }
  return { exportReport };
}
```

Match the existing import set in the file; if `apiClient` or the exact response wrapper differs, mirror what `useExportClassSummary` / `useClassSummary` do.

- [ ] **Step 3: Verify**

Run: `pnpm type-check`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/api/useReports.ts src/lib/query-keys.ts
git commit -m "feat(hooks): add useFeeServiceSummary query + export hooks"
```

---

### Task 6: Add i18n keys

**Files:**
- Modify: `src/messages/id.json`
- Modify: `src/messages/en.json`

- [ ] **Step 1: Add keys under `report.feeServiceSummary`**

Mirror the shape of `report.classSummary`. Add these keys in both files (translate IDs):

```json
"feeServiceSummary": {
  "title": "Laporan Iuran Layanan",
  "description": "Ringkasan iuran transportasi & akomodasi per layanan",
  "exportExcel": "Ekspor Excel",
  "category": "Kategori",
  "categoryAll": "Semua",
  "categoryTransport": "Transportasi",
  "categoryAccommodation": "Akomodasi",
  "feeService": "Layanan",
  "billStatus": "Status Tagihan",
  "activeStudents": "Siswa Aktif",
  "totalBilled": "Total Ditagih",
  "totalPaid": "Total Dibayar",
  "outstanding": "Tunggakan",
  "overdueBills": "Tagihan Terlambat",
  "monthFrom": "Bulan Mulai",
  "monthTo": "Bulan Akhir",
  "searchPlaceholder": "Cari layanan..."
}
```

English (`en.json`) uses the same keys with English strings.

- [ ] **Step 2: Regenerate i18n types if the project does this**

Check `package.json` for an `i18n` script. If `i18next-cli` generates types, run whichever script the repo uses (often `pnpm i18n` or equivalent). If no such script exists, skip.

- [ ] **Step 3: Commit**

```bash
git add src/messages/id.json src/messages/en.json
git commit -m "feat(i18n): add service fee summary translations"
```

---

### Task 7: Build the filter bar component

**Files:**
- Create: `src/components/reports/FeeServiceSummaryFilters.tsx`

- [ ] **Step 1: Write the component**

```tsx
import {
  Grid,
  Group,
  Paper,
  Select,
  TextInput,
} from "@mantine/core";
import { MonthPickerInput } from "@mantine/dates";
import { IconSearch } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useAcademicYears } from "@/hooks/api/useAcademicYears";
import { useClasses } from "@/hooks/api/useClasses";
import { useFeeServices } from "@/hooks/api/useFeeServices";
import type { FeeServiceSummaryFilters as Filters } from "@/lib/business-logic/fee-service-summary";

interface Props {
  filters: Filters;
  searchDraft: string;
  onChange: <K extends keyof Filters>(key: K, value: Filters[K] | null) => void;
}

export function FeeServiceSummaryFilters({ filters, searchDraft, onChange }: Props) {
  const t = useTranslations();
  const { data: years } = useAcademicYears();
  const { data: classes } = useClasses();
  const { data: services } = useFeeServices({ category: filters.category });

  return (
    <Paper p="md" radius="md" withBorder>
      <Grid gutter="sm">
        <Grid.Col span={{ base: 12, md: 3 }}>
          <Select
            label={t("report.feeServiceSummary.category")}
            data={[
              { value: "", label: t("report.feeServiceSummary.categoryAll") },
              { value: "TRANSPORT", label: t("report.feeServiceSummary.categoryTransport") },
              { value: "ACCOMMODATION", label: t("report.feeServiceSummary.categoryAccommodation") },
            ]}
            value={filters.category ?? ""}
            onChange={(v) => onChange("category", (v as Filters["category"]) || null)}
            clearable
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 3 }}>
          <Select
            label={t("academicYear.title")}
            data={(years ?? []).map((y: { academicYearId: string; year: string }) => ({
              value: y.academicYearId,
              label: y.year,
            }))}
            value={filters.academicYearId ?? ""}
            onChange={(v) => onChange("academicYearId", v || null)}
            clearable
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 3 }}>
          <Select
            label={t("report.feeServiceSummary.feeService")}
            data={(services ?? []).map((s: { feeServiceId: string; name: string }) => ({
              value: s.feeServiceId,
              label: s.name,
            }))}
            value={filters.feeServiceId ?? ""}
            onChange={(v) => onChange("feeServiceId", v || null)}
            clearable
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 3 }}>
          <Select
            label={t("report.feeServiceSummary.billStatus")}
            data={[
              { value: "UNPAID", label: "UNPAID" },
              { value: "PARTIAL", label: "PARTIAL" },
              { value: "PAID", label: "PAID" },
              { value: "VOID", label: "VOID" },
            ]}
            value={filters.billStatus ?? ""}
            onChange={(v) => onChange("billStatus", (v as Filters["billStatus"]) || null)}
            clearable
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 3 }}>
          <Select
            label={t("class.title")}
            data={(classes ?? []).map((c: { classId: string; name: string }) => ({
              value: c.classId,
              label: c.name,
            }))}
            value={filters.classId ?? ""}
            onChange={(v) => onChange("classId", v || null)}
            clearable
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 3 }}>
          <MonthPickerInput
            label={t("report.feeServiceSummary.monthFrom")}
            value={filters.monthFrom ? new Date(`${filters.monthFrom}-01`) : null}
            onChange={(d) =>
              onChange(
                "monthFrom",
                d ? `${new Date(d).getFullYear()}-${String(new Date(d).getMonth() + 1).padStart(2, "0")}` : null,
              )
            }
            clearable
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 3 }}>
          <MonthPickerInput
            label={t("report.feeServiceSummary.monthTo")}
            value={filters.monthTo ? new Date(`${filters.monthTo}-01`) : null}
            onChange={(d) =>
              onChange(
                "monthTo",
                d ? `${new Date(d).getFullYear()}-${String(new Date(d).getMonth() + 1).padStart(2, "0")}` : null,
              )
            }
            clearable
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 3 }}>
          <TextInput
            label={t("common.search")}
            leftSection={<IconSearch size={16} />}
            placeholder={t("report.feeServiceSummary.searchPlaceholder")}
            value={searchDraft}
            onChange={(e) => onChange("search", e.currentTarget.value || null)}
          />
        </Grid.Col>
      </Grid>
    </Paper>
  );
}
```

If `useFeeServices` or `useClasses` hook signatures differ, adapt the calls. Read each hook file quickly to confirm parameter names before wiring.

- [ ] **Step 2: Type-check**

Run: `pnpm type-check`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/reports/FeeServiceSummaryFilters.tsx
git commit -m "feat(reports): add service fee summary filter bar"
```

---

### Task 8: Build the table + totals component

**Files:**
- Create: `src/components/reports/FeeServiceSummaryTable.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { Badge, Card, Grid, Loader, Paper, Table, Text } from "@mantine/core";
import { useTranslations } from "next-intl";
import TablePagination from "@/components/ui/TablePagination";
import { useFeeServiceSummary } from "@/hooks/api/useReports";
import type { FeeServiceSummaryFilters } from "@/lib/business-logic/fee-service-summary";

function formatRp(v: string | number) {
  const n = typeof v === "string" ? Number.parseFloat(v) : v;
  return `Rp ${(Number.isFinite(n) ? n : 0).toLocaleString("id-ID")}`;
}

interface Props {
  filters: FeeServiceSummaryFilters;
  page: number;
  limit: number;
  onPageChange: (p: number) => void;
}

export function FeeServiceSummaryTable({ filters, page, limit, onPageChange }: Props) {
  const t = useTranslations();
  const { data, isLoading } = useFeeServiceSummary({ ...filters, page, limit });

  if (isLoading || !data) return <Loader />;

  return (
    <>
      <Grid>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Card withBorder>
            <Text size="sm" c="dimmed">{t("report.feeServiceSummary.totalBilled")}</Text>
            <Text fw={700} size="xl">{formatRp(data.totals.billed)}</Text>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Card withBorder>
            <Text size="sm" c="dimmed">{t("report.feeServiceSummary.totalPaid")}</Text>
            <Text fw={700} size="xl" c="green">{formatRp(data.totals.paid)}</Text>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Card withBorder>
            <Text size="sm" c="dimmed">{t("report.feeServiceSummary.outstanding")}</Text>
            <Text fw={700} size="xl" c="red">{formatRp(data.totals.outstanding)}</Text>
          </Card>
        </Grid.Col>
      </Grid>
      <Paper withBorder mt="md">
        <Table striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("report.feeServiceSummary.feeService")}</Table.Th>
              <Table.Th>{t("report.feeServiceSummary.category")}</Table.Th>
              <Table.Th>{t("report.feeServiceSummary.activeStudents")}</Table.Th>
              <Table.Th>{t("report.feeServiceSummary.totalBilled")}</Table.Th>
              <Table.Th>{t("report.feeServiceSummary.totalPaid")}</Table.Th>
              <Table.Th>{t("report.feeServiceSummary.outstanding")}</Table.Th>
              <Table.Th>{t("report.feeServiceSummary.overdueBills")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.data.map((r) => (
              <Table.Tr key={r.feeServiceId}>
                <Table.Td>{r.feeServiceName}</Table.Td>
                <Table.Td>
                  <Badge color={r.category === "TRANSPORT" ? "blue" : "grape"}>
                    {r.category}
                  </Badge>
                </Table.Td>
                <Table.Td>{r.activeStudents}</Table.Td>
                <Table.Td>{formatRp(r.totalBilled)}</Table.Td>
                <Table.Td>{formatRp(r.totalPaid)}</Table.Td>
                <Table.Td>{formatRp(r.outstanding)}</Table.Td>
                <Table.Td>
                  {r.overdueBills > 0 ? (
                    <Badge color="red">{r.overdueBills}</Badge>
                  ) : (
                    0
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>
      <TablePagination
        page={page}
        totalPages={data.totalPages}
        onPageChange={onPageChange}
      />
    </>
  );
}
```

Confirm `TablePagination` prop names by reading `src/components/ui/TablePagination.tsx` and adjust if needed.

- [ ] **Step 2: Type-check**

Run: `pnpm type-check`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/reports/FeeServiceSummaryTable.tsx
git commit -m "feat(reports): add service fee summary table"
```

---

### Task 9: Wire the report page with `useQueryFilters`

**Files:**
- Create: `src/pages/admin/reports/fee-services.tsx`

- [ ] **Step 1: Write the page**

```tsx
import { Button, Group, Stack } from "@mantine/core";
import { IconFileSpreadsheet } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { z } from "zod";
import AdminLayout from "@/components/layouts/AdminLayout";
import { FeeServiceSummaryFilters } from "@/components/reports/FeeServiceSummaryFilters";
import { FeeServiceSummaryTable } from "@/components/reports/FeeServiceSummaryTable";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { useExportFeeServiceSummary } from "@/hooks/api/useReports";
import { useQueryFilters } from "@/hooks/useQueryFilters";
import type { NextPageWithLayout } from "@/lib/page-types";

const schema = z.object({
  academicYearId: z.string().optional(),
  category: z.enum(["TRANSPORT", "ACCOMMODATION"]).optional(),
  feeServiceId: z.string().optional(),
  billStatus: z.enum(["UNPAID", "PARTIAL", "PAID", "VOID"]).optional(),
  classId: z.string().optional(),
  monthFrom: z.string().optional(),
  monthTo: z.string().optional(),
  search: z.string().optional(),
});

const ServiceFeeReportPage: NextPageWithLayout = function ServiceFeeReportPage() {
  const t = useTranslations();
  const { filters, page, limit, drafts, setFilter, setPage } = useQueryFilters({ schema });
  const { exportReport } = useExportFeeServiceSummary();

  return (
    <>
      <PageHeader
        title={t("report.feeServiceSummary.title")}
        description={t("report.feeServiceSummary.description")}
        actions={
          <Group gap="sm">
            <Button
              variant="light"
              leftSection={<IconFileSpreadsheet size={18} />}
              onClick={() => exportReport(filters)}
            >
              {t("report.feeServiceSummary.exportExcel")}
            </Button>
          </Group>
        }
      />
      <Stack gap="md">
        <FeeServiceSummaryFilters
          filters={filters}
          searchDraft={drafts.search ?? ""}
          onChange={setFilter}
        />
        <FeeServiceSummaryTable
          filters={filters}
          page={page}
          limit={limit}
          onPageChange={setPage}
        />
      </Stack>
    </>
  );
};

ServiceFeeReportPage.getLayout = (page: ReactElement) => (
  <AdminLayout>{page}</AdminLayout>
);

export default ServiceFeeReportPage;
```

- [ ] **Step 2: Add link from class-summary page**

Edit `src/pages/admin/reports/class-summary.tsx`: inside the `actions` `Group`, add a button before the Overdue one:

```tsx
<Button
  variant="light"
  leftSection={<IconFileSpreadsheet size={18} />}
  onClick={() => router.push("/admin/reports/fee-services")}
>
  {t("report.feeServiceSummary.title")}
</Button>
```

- [ ] **Step 3: Add sidebar link**

Edit `src/components/layouts/AdminLayout.tsx` (or whichever file defines the admin nav — grep for `/admin/reports/class-summary`). Add the new entry `/admin/reports/fee-services` under the Reports group, matching the existing link style.

- [ ] **Step 4: Manual verify**

Run: `pnpm dev`
- Navigate to `/admin/reports/fee-services`.
- Confirm filters render, data loads, totals display.
- Change category — URL updates, `page` drops, table refetches.
- Set `?page=2` manually, change any filter — URL should return to `page=1`.
- Click Export Excel — xlsx downloads with current filters applied.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/reports/fee-services.tsx src/pages/admin/reports/class-summary.tsx src/components/layouts/AdminLayout.tsx
git commit -m "feat(reports): add service fee summary page and nav links"
```

---

## Phase 3 — Retrofit Existing Pages

**Migration recipe** (apply to every Task 10–22):

1. Read the target file. Identify every `useState` that holds a filter, `search`, `status`, `page`, or `limit`.
2. Add a Zod schema matching those filters.
3. Replace the `useState` calls with a single `useQueryFilters({ schema })` call.
4. Replace `onChange={(v) => setSearch(v)}` with `onChange={(v) => setFilter("search", v || null)}`. Use `drafts.search` for the `value` of the search input (so typing feels instant despite debouncing).
5. Replace non-search filter setters with `setFilter("<key>", value || null)`.
6. Replace `setPage(p)` with the hook's `setPage(p)`.
7. Keep the React Query hook call's filter inputs exactly the same shape as today (it already keys on these values).
8. Verify: `pnpm type-check`, then `pnpm dev` — load the page, change each filter, confirm URL updates and page resets to 1; change page, confirm only `page` changes.
9. Commit: `refactor(<scope>): persist <page> filters in URL`.

For table components that accept no props today (own their state), keep that API; the hook lives inside the table component. For table components that take `filters` as a prop from their parent page, the parent page owns the hook.

---

### Task 10: Retrofit `StudentTable.tsx`

**Files:** `src/components/tables/StudentTable.tsx`

- [ ] **Step 1: Read the file** and list every filter state variable.
- [ ] **Step 2: Apply the migration recipe.** Example schema:
```ts
const schema = z.object({
  search: z.string().optional(),
  classId: z.string().optional(),
  academicYearId: z.string().optional(),
  status: z.enum(["ACTIVE", "EXITED"]).optional(),
});
```
Adjust fields to match the actual filters present.
- [ ] **Step 3: Verify** — `pnpm type-check`; `pnpm dev` → navigate to `/admin/students`, exercise each filter.
- [ ] **Step 4: Commit** — `refactor(students): persist list filters in URL`.

### Task 11: Retrofit `PaymentTable.tsx`

**Files:** `src/components/tables/PaymentTable.tsx`

- [ ] Apply the migration recipe. Verify on `/admin/payments`. Commit `refactor(payments): persist list filters in URL`.

### Task 12: Retrofit `EmployeeTable.tsx`

**Files:** `src/components/tables/EmployeeTable.tsx`

- [ ] Apply the migration recipe. Verify on `/admin/employees`. Commit `refactor(employees): persist list filters in URL`.

### Task 13: Retrofit `TuitionTable.tsx`

**Files:** `src/components/tables/TuitionTable.tsx`

- [ ] Apply the migration recipe. Verify on `/admin/tuitions`. Commit `refactor(tuitions): persist list filters in URL`.

### Task 14: Retrofit `DiscountTable.tsx`

**Files:** `src/components/tables/DiscountTable.tsx`

- [ ] Apply the migration recipe. Verify on `/admin/discounts`. Commit `refactor(discounts): persist list filters in URL`.

### Task 15: Retrofit `ScholarshipTable.tsx`

**Files:** `src/components/tables/ScholarshipTable.tsx`

- [ ] Apply the migration recipe. Verify on `/admin/scholarships`. Commit `refactor(scholarships): persist list filters in URL`.

### Task 16: Retrofit `StudentAccountTable.tsx`

**Files:** `src/components/tables/StudentAccountTable.tsx`

- [ ] Apply the migration recipe. Verify on `/admin/student-accounts`. Commit `refactor(student-accounts): persist list filters in URL`.

### Task 17: Retrofit `AcademicYearTable.tsx` & `ClassAcademicTable.tsx`

**Files:**
- `src/components/tables/AcademicYearTable.tsx`
- `src/components/tables/ClassAcademicTable.tsx`

- [ ] Apply the migration recipe to both. Verify on `/admin/academic-years` and `/admin/classes`. Commit `refactor(classes): persist list filters in URL`.

### Task 18: Retrofit overdue report tables

**Files:**
- `src/components/tables/OverdueReportTable.tsx`
- `src/components/tables/OverdueFeeBillReportTable.tsx`
- `src/components/tables/OverdueServiceFeeBillReportTable.tsx`

- [ ] Apply the migration recipe to all three. Verify on `/admin/reports/overdue`. Commit `refactor(reports): persist overdue report filters in URL`.

### Task 19: Retrofit `admin/fee-bills/index.tsx` (tabbed)

**Files:** `src/pages/admin/fee-bills/index.tsx`

- [ ] **Step 1:** Add `tab` to the schema:
```ts
const schema = z.object({
  tab: z.enum(["fee-bills", "service-fee-bills"]).optional().default("fee-bills"),
  search: z.string().optional(),
  status: z.enum(["UNPAID", "PARTIAL", "PAID", "VOID"]).optional(),
  academicYearId: z.string().optional(),
  period: z.string().optional(),
});
```
- [ ] **Step 2:** Drive `Tabs` `value` from `filters.tab`, `onChange` from `setFilter("tab", value)`. Switching tabs also resets `page` (already covered by the hook since `tab` is in the filter keys).
- [ ] **Step 3:** Verify on `/admin/fee-bills` — both tabs keep filters in URL; switching tabs resets `page`. Commit `refactor(fee-bills): persist tab and filters in URL`.

### Task 20: Retrofit `admin/service-fees/index.tsx`

**Files:** `src/pages/admin/service-fees/index.tsx`

- [ ] Apply the migration recipe. Verify on `/admin/service-fees`. Commit `refactor(service-fees): persist list filters in URL`.

### Task 21: Retrofit `admin/fee-services/index.tsx`

**Files:** `src/pages/admin/fee-services/index.tsx`

- [ ] Apply the migration recipe. Verify on `/admin/fee-services`. Commit `refactor(fee-services): persist list filters in URL`.

### Task 22: Retrofit `admin/online-payments.tsx`

**Files:** `src/pages/admin/online-payments.tsx`

- [ ] Apply the migration recipe. Verify on `/admin/online-payments`. Commit `refactor(online-payments): persist list filters in URL`.

### Task 23: Retrofit `admin/reports/class-summary.tsx` and `admin/reports/overdue.tsx`

**Files:**
- `src/pages/admin/reports/class-summary.tsx`
- `src/pages/admin/reports/overdue.tsx`

- [ ] **Step 1:** Replace `const [academicYearId, setAcademicYearId] = useState(...)` with `useQueryFilters({ schema: z.object({ academicYearId: z.string().optional() }) })`. Pass `filters.academicYearId` into `ClassSummaryCards` and `exportReport`.
- [ ] **Step 2:** Do the same for `overdue.tsx` — read the file, add a schema for whichever filters exist, migrate.
- [ ] **Step 3:** Verify in browser.
- [ ] **Step 4:** Commit `refactor(reports): persist report filters in URL`.

---

## Phase 4 — Docs

### Task 24: Update documentation

**Files:**
- Modify: `docs/03-API-ENDPOINTS.md`
- Modify: `docs/04-FRONTEND-STRUCTURE.md`

- [ ] **Step 1:** Add `GET /api/v1/reports/fee-service-summary` and `/export` entries to `docs/03-API-ENDPOINTS.md`, mirroring the existing class-summary entries (query params table + response shape).
- [ ] **Step 2:** Add a "URL-persisted filters" section to `docs/04-FRONTEND-STRUCTURE.md` describing when to use `useQueryFilters`, including the schema + import snippet.
- [ ] **Step 3:** Commit `docs: document service fee report and useQueryFilters`.

---

## Phase 5 — Final Verification

### Task 25: Full repo verification

- [ ] `pnpm type-check` — must pass.
- [ ] `pnpm lint` — must pass.
- [ ] Spot-check in browser:
  - Load `/admin/students?search=foo&page=3`. Hit refresh. Filters persist, data matches.
  - On same page, clear search — URL drops both `search` and `page`.
  - Back button restores previous state.
  - Service Fee report: filter by `category=TRANSPORT`, export — xlsx contains only transport rows.
- [ ] If any regression is found, open a new task and resolve before closing this plan.
- [ ] Final commit only if doc/config tweaks happened during verification.

---

## Self-Review Summary

- ✅ Spec coverage: hook (Task 1), report business logic (Task 2), API (Tasks 3–4), hooks + keys (Task 5), i18n (Task 6), UI (Tasks 7–9), retrofits (Tasks 10–23), docs (Task 24), verification (Task 25).
- ✅ No placeholders; every code-producing step has complete code or a clear recipe grounded in an existing file.
- ✅ Type consistency: `FeeServiceSummaryFilters`/`FeeServiceSummaryResult` used identically across business logic, API, and hook layers.
- ✅ Testing matches project reality (no test runner → type-check + lint + manual browser QA).
