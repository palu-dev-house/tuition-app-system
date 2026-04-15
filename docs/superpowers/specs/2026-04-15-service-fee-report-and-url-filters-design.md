# Service Fee Report + URL-Persisted Filters — Design

**Date:** 2026-04-15
**Status:** Draft (awaiting user review)

## Problem

1. The admin panel currently has reports for tuition (`class-summary`) and overdue bills, but no equivalent report for **service fees** (transport + accommodation). Admins cannot see an aggregated view of how each fee-service is performing.
2. Across the entire admin panel, list filters and pagination state live in component-level `useState`. Consequences:
   - URLs are not shareable or bookmarkable.
   - Refreshing the page drops all filters.
   - Browser back/forward does not restore prior filter state.
   - When a filter changes, some pages forget to reset pagination to page 1, leaving users on an empty page (e.g., filtering to a status with only 3 results while on page 4).

## Goals

- Add a **Service Fee Summary** report that mirrors `class-summary` in shape but aggregates by `FeeService`, with a category filter so "transportation" is a filtered view of the same page.
- Introduce a reusable, typed `useQueryFilters` hook that makes URL query params the source of truth for filters + pagination.
- Retrofit every admin list/report page (12 table components + 6 pages) to use the hook.
- Guarantee: changing any filter resets `page` to 1; changing `page` does not touch filters.

## Non-Goals

- No redesign of existing filter UIs or API contracts.
- No changes to detail pages (`[id].tsx`, `[nis].tsx`), modal dialogs, or import wizards.
- No new third-party dependency (no `nuqs`).
- No schema changes.

## Architecture

### 1. `useQueryFilters` hook

**Location:** `src/hooks/useQueryFilters.ts`

**Signature:**

```ts
function useQueryFilters<TSchema extends z.ZodObject<any>>(options: {
  schema: TSchema;
  defaultPage?: number;           // default 1
  defaultLimit?: number;          // default 20
  pageResetKeys?: Array<keyof z.infer<TSchema>>; // default: all filter keys
  debounceKeys?: Array<keyof z.infer<TSchema>>;  // default: keys named "search" or "q"
  debounceMs?: number;            // default 300
}): {
  filters: z.infer<TSchema>;
  page: number;
  limit: number;
  isReady: boolean;               // mirrors router.isReady
  setFilter<K extends keyof Filters>(key: K, value: Filters[K] | null): void;
  setFilters(patch: Partial<Filters>): void;
  setPage(page: number): void;
  setLimit(limit: number): void;
  reset(): void;
};
```

**Behavior:**

- Reads from `router.query`, validates through the Zod schema, falls back to defaults.
- Writes via `router.replace({ query }, undefined, { shallow: true })` — no reload, no extra navigation entry per keystroke.
- Removes keys equal to their default/`null`/empty-string value from the URL (keeps URLs clean).
- Arrays → comma-separated strings (`?categories=TRANSPORT,ACCOMMODATION`).
- `setFilter` / `setFilters` / `setLimit` reset `page` to 1 (unless the key is excluded via `pageResetKeys`).
- `setPage` does not reset any filter.
- Preserves unknown query keys on the URL (so routes that share params — e.g., `?tab=` — don't fight).
- Returns defaults (and `isReady: false`) until `router.isReady` to avoid SSR hydration mismatch.
- Debounces keys listed in `debounceKeys` (default: any key named `search` or `q`) by `debounceMs` before writing to URL; local state still updates synchronously for controlled inputs.

**Unit tests:** cover default fallback, clean-URL serialization, array serialization, page-reset on filter change, no-reset on `setPage`, SSR safety, unknown-key preservation, debounced writes.

### 2. Service Fee Summary report

**Page:** `src/pages/admin/reports/service-fees.tsx`

**Component:** `src/components/reports/ServiceFeeSummaryTable.tsx` (new; follows the structure of `ClassSummaryCards.tsx` but as a paginated table).

**API route:** `src/pages/api/v1/reports/service-fee-summary/index.ts`
- Method: GET
- Query schema (Zod, shared with frontend):
  ```ts
  {
    academicYearId?: string,
    category?: "TRANSPORT" | "ACCOMMODATION",
    feeServiceId?: string,
    billStatus?: "UNPAID" | "PARTIAL" | "PAID" | "VOID",
    classId?: string,
    monthFrom?: string, // "YYYY-MM"
    monthTo?: string,   // "YYYY-MM"
    search?: string,
    page?: number,      // default 1
    limit?: number,     // default 20
  }
  ```
- Response:
  ```ts
  {
    data: Array<{
      feeServiceId: string,
      feeServiceName: string,
      category: "TRANSPORT" | "ACCOMMODATION",
      activeStudents: number,
      totalBilled: string,   // Decimal as string
      totalPaid: string,
      outstanding: string,
      overdueBills: number,
    }>,
    total: number,
    totalPages: number,
    page: number,
    limit: number,
    totals: { billed: string, paid: string, outstanding: string }
  }
  ```

**Business logic:** `src/lib/business-logic/service-fee-summary.ts`
- `getServiceFeeSummary(filters)` — aggregates from `ServiceFeeBill` joined to `FeeService`, `FeeSubscription`, `Student`, `StudentClass`.
- Returns both per-row aggregates and the grand totals used by summary cards.

**Excel export:** `src/pages/api/v1/reports/service-fee-summary/export/index.ts`
- Same query schema (no `page`/`limit`).
- Honors the filters currently applied (Option A).
- Streams an xlsx using the existing `exceljs` helper pattern from `export-class-summary`.

**Frontend hook:** `src/hooks/api/useReports.ts` gains:
- `useServiceFeeSummary(filters)` — React Query, key: `queryKeys.reports.serviceFeeSummary(filters)`.
- `useExportServiceFeeSummary()` — mirrors `useExportClassSummary`.

**Query keys:** extend `src/lib/query-keys.ts` with `reports.serviceFeeSummary(filters)`.

**UI layout (top → bottom):**
1. `PageHeader` — title, description, actions: "Export Excel" button, back-to-class-summary link.
2. Filter bar (card) — all 8 filter controls in a responsive grid.
3. Summary totals — three cards (Billed / Paid / Outstanding) reflecting current filtered totals.
4. Paginated table — columns as listed above; row click navigates to filtered service-fee-bills page if useful (nice-to-have, not required).
5. `TablePagination` footer.

**Navigation:** add a button on `class-summary.tsx` next to the existing "Overdue" button: "Service Fees" → `/admin/reports/service-fees`. Add a matching link in the admin sidebar under the Reports group.

**i18n:** new keys under `report.serviceFeeSummary.*` in `src/messages/id.json` and `src/messages/en.json`.

### 3. Retrofit existing pages

**Rule of thumb per file:**
1. Define a Zod filter schema that exactly matches the existing API contract for the page.
2. Replace each `useState` for a filter / `page` / `limit` / `search` with `useQueryFilters({ schema })`.
3. Replace `onChange={(v) => setSearch(v)}` with `onChange={(v) => setFilter("search", v || null)}`.
4. Replace `setPage(p)` with the hook's `setPage(p)` (page-only update, no filter reset).
5. Ensure the React Query hook's key includes all filter values (many already do).

**Files to migrate:**

Table components (filter state lives inside):
- `StudentTable.tsx`
- `PaymentTable.tsx`
- `EmployeeTable.tsx`
- `TuitionTable.tsx`
- `DiscountTable.tsx`
- `ScholarshipTable.tsx`
- `StudentAccountTable.tsx`
- `AcademicYearTable.tsx`
- `ClassAcademicTable.tsx`
- `OverdueFeeBillReportTable.tsx`
- `OverdueServiceFeeBillReportTable.tsx`
- `OverdueReportTable.tsx`

Pages (filter state at page level):
- `admin/fee-bills/index.tsx` (uses tabs — see tab rules below)
- `admin/service-fees/index.tsx`
- `admin/fee-services/index.tsx`
- `admin/online-payments.tsx`
- `admin/reports/class-summary.tsx`
- `admin/reports/overdue.tsx`

**Tab pages rule:**
- `tab` is stored in URL as its own key.
- Each tab has its own filter namespace; schema covers the union. Keys relevant only to the inactive tab are dropped when switching tabs (except shared keys like `academicYearId`).
- Switching tabs resets `page` to 1.

## Edge Cases & Invariants

- **Invalid URL values** (e.g., `?page=abc`, `?status=FOO`): Zod parse fails gracefully → fall back to default, optionally strip the bad key on next write.
- **Decimal values in totals:** API serializes as strings to preserve precision; frontend formats with `Rp` locale.
- **Back/forward navigation:** clicking back restores the previous URL and therefore previous filter state; React Query refetches against the new key automatically.
- **Multiple rapid filter changes:** only the final state is written to URL (via the debounce for search; other filters write immediately but are coalesced by React batching).
- **Excel export with no matching rows:** returns an xlsx with header row only (existing helper already does this).
- **Permissions:** service-fee-summary endpoint requires the same auth scope as existing `class-summary` (admin/cashier). Reuse `requireAuth` pattern.

## Testing Strategy

- **Hook unit tests:** exhaustive as listed above.
- **Report page integration test:** render with `?academicYearId=X&category=TRANSPORT&page=2`, assert request query and rendered filter values match; change category, assert URL updates and `page=1`.
- **Retrofit smoke tests:** one per migrated page — load with a filter + `page=2`, assert filter applied; change the filter, assert `page=1` in URL.
- **API tests:** service-fee-summary route with each filter combination + pagination + export.

## Rollout

Single merged PR:
1. Hook + unit tests.
2. Service Fee Summary API + business logic + tests.
3. Service Fee Summary page + component + i18n.
4. Retrofit each file (one commit per page/table for easy review).
5. Update docs: `docs/03-API-ENDPOINTS.md` and `docs/04-FRONTEND-STRUCTURE.md`.

## Open Questions

None — all decisions captured above.
