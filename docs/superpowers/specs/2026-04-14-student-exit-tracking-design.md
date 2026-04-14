# Student Exit Tracking — Design

**Date:** 2026-04-14
**Status:** Approved for implementation planning

## Problem

Students sometimes leave the school mid-academic year (move cities, transfer, etc.). The system currently has no way to record this. Tuitions for the entire academic year are generated upfront, so an exited student continues to accumulate "unpaid" tuition rows for periods they will never attend. This pollutes reports, the student portal, and outstanding-balance figures.

## Goal

Allow admins to mark a student as exited on a specific date. Automatically void unpaid tuitions for periods that start after the exit date. Preserve audit trail. Allow undo.

## Non-goals

- **Per-class exits / mid-year class transfers.** Out of scope; this design treats exit as school-wide. A separate "class transfer" workflow can be added later if needed.
- **Prorated billing for the exit period.** Period containing the exit date is charged in full, matching standard Indonesian school billing.
- **Bulk exit operations.** One student at a time via the detail page.
- **Cashier-initiated exits.** ADMIN role only.

---

## Schema changes

### `Student` — add 3 nullable fields

```prisma
exitedAt    DateTime? @map("exited_at")
exitReason  String?   @map("exit_reason")
exitedBy    String?   @map("exited_by")  // employeeId

@@index([exitedAt])
```

### `Tuition` — add 1 boolean

```prisma
voidedByExit Boolean @default(false) @map("voided_by_exit")
```

Distinguishes auto-voids (from exit) from manual VOIDs (from `mass-update`). Only auto-voids are restored on undo.

### Migration

Single Prisma migration: `add_student_exit_tracking`. No data backfill required (defaults handle existing rows).

---

## Voiding rule

**Void any UNPAID tuition whose period-start date is strictly after `exitedAt`.**

The period-start is derived from `period` + `year` + `classAcademic.paymentFrequency`:

| Frequency | Period values | Period-start |
|-----------|---------------|--------------|
| MONTHLY   | `JULY`, `AUGUST`, ... `JUNE` | First day of that month in the academic-year-anchored year |
| QUARTERLY | `Q1`, `Q2`, `Q3`, `Q4` | Q1=July 1, Q2=Oct 1, Q3=Jan 1, Q4=Apr 1 |
| SEMESTER  | `SEM1`, `SEM2` | SEM1=July 1, SEM2=Jan 1 |

For monthly periods spanning a calendar-year boundary (Jan-Jun), `year` is the calendar year of that month.

**Examples (academic year 2025/2026, exit date 2026-03-15):**
- March 2026 monthly tuition (period-start Mar 1) — kept (period-start ≤ exitDate).
- April 2026 monthly tuition (period-start Apr 1) — voided.
- Q3 quarterly (Jan-Mar, period-start Jan 1) — kept.
- Q4 quarterly (Apr-Jun, period-start Apr 1) — voided.
- SEM2 (Jan-Jun, period-start Jan 1) — kept.

**PARTIAL-status tuitions are never auto-voided**, even if their period starts after the exit date. They surface in the confirmation modal as a warning so admin handles them manually (refund or leave for collection).

---

## Business logic — `src/lib/business-logic/student-exit.ts` (new)

### `recordStudentExit({ nis, exitDate, reason, employeeId })`

1. Load student. Reject if `exitedAt` already set.
2. Validate: `exitDate >= startJoinDate` and `exitDate <= today`.
3. In a transaction:
   - Update `Student`: set `exitedAt`, `exitReason`, `exitedBy`.
   - Find all `Tuition` rows where `studentNis = nis`, `status = UNPAID`, joined with `classAcademic` for frequency.
   - For each, compute period-start. If period-start > exitDate, update: `status = VOID`, `voidedByExit = true`, `feeAmount = 0`, `paidAmount = 0` (mirroring `mass-update` semantics).
   - Collect PARTIAL-status tuitions with period-start > exitDate (do not modify; return for caller to surface).
4. Return `{ student, voidedCount, partialWarnings }`.

### `undoStudentExit({ nis, employeeId })`

1. Load student. Reject if not currently exited.
2. In a transaction:
   - Find all `Tuition` rows where `studentNis = nis`, `voidedByExit = true`. Join `classAcademic` to get original fee.
   - Restore each: `status = UNPAID`, `voidedByExit = false`, `feeAmount` = original fee for that frequency (`monthlyFee` / `quarterlyFee` / `semesterFee`). `paidAmount` stays 0.
   - Note: original scholarship/discount amounts on the row are preserved through the void cycle (we only zero `feeAmount` and `paidAmount`).
   - Clear `Student.exitedAt`, `exitReason`, `exitedBy`.
3. Return `{ student, restoredCount }`.

### Tuition generator update — `src/lib/business-logic/tuition-generator.ts`

In `generateTuitions`: if `student.exitedAt` is set, after computing the period list, filter out periods whose period-start > `exitedAt`. Prevents regenerating future periods if generation is re-run for an exited student.

---

## API — `src/pages/api/v1/students/[nis]/exit/index.ts` (new)

Both handlers use `createApiHandler`, `requireAuth` with ADMIN-only check.

### `POST /api/v1/students/:nis/exit`

**Body:** `{ exitDate: string (ISO date), reason: string }`
**Response:** `{ student, voidedCount, partialWarnings: Array<{ tuitionId, period, year, paidAmount }> }`

Errors:
- 400: validation failure (date out of range, already exited, missing reason)
- 403: caller is not ADMIN
- 404: student not found

### `DELETE /api/v1/students/:nis/exit`

**Response:** `{ student, restoredCount }`

Errors:
- 400: student not currently exited
- 403: caller is not ADMIN
- 404: student not found

---

## Frontend

### Query keys — `src/lib/query-keys.ts`

Add under existing `students` factory: `students.exit(nis)` for invalidation targeting.

### Hooks — `src/hooks/api/useStudentExit.ts` (new)

- `useRecordStudentExit()` — mutation, invalidates `students.detail(nis)`, `students.lists()`, `tuitions.lists()`.
- `useUndoStudentExit()` — mutation, same invalidations.

### Student detail page — `src/pages/admin/students/[nis].tsx`

Add a **Status section** between the existing student info and account management sections.

**When `student.exitedAt` is null:**
- Section title: "Status Siswa"
- Current status badge: "Aktif"
- Button: "Tandai Keluar" (ADMIN only; hidden for cashiers)
- On click → modal:
  - Date picker: "Tanggal Keluar" (default: today, min: `startJoinDate`, max: today)
  - Textarea: "Alasan" (required)
  - Preview area: after date is picked, compute counts client-side from the already-loaded tuition list for this student. Show "X tagihan akan dibatalkan, Y tagihan dengan pembayaran sebagian perlu ditangani manual". (Server still re-validates and re-counts on POST — preview is UX only.)
  - Confirm button: "Tandai Keluar"
  - Cancel button

**When `student.exitedAt` is set:**
- Banner (yellow/muted): "Siswa keluar pada [date] · Alasan: [reason] · Dicatat oleh [employee name]"
- Button: "Batalkan Status Keluar"
- On click → confirmation modal: "Akan memulihkan X tagihan ke status UNPAID. Lanjutkan?"

### Student list — `src/pages/admin/students/index.tsx`

- Add filter dropdown: "Status" with options "Aktif" (default) / "Sudah Keluar" / "Semua".
- Backend: extend `GET /api/v1/students` to accept `status=active|exited|all`.
- Exited rows render with muted text and a "Keluar" badge in the name column.

### Portal — `src/pages/portal/dashboard.tsx` (and other portal pages)

- If `session.student.exitedAt` is set, render a yellow banner at top of portal pages: "Akun ini berstatus keluar per [tanggal]. Hanya tagihan tertunggak yang dapat dilihat."
- Tuition lists naturally hide VOID rows (existing behavior); no extra filtering needed.
- Login is not blocked — exited students need to settle outstanding balances.

---

## Edge cases

| Case | Handling |
|------|----------|
| Exit date before `startJoinDate` | Reject with 400 |
| Exit date in future | Reject with 400 |
| Student already exited | Reject with 400 (must undo first) |
| Tuition is PARTIAL with period-start > exitDate | Not auto-voided. Returned in `partialWarnings` for admin review. |
| Tuition is PAID with period-start > exitDate | Left untouched. (Refund flow is separate.) |
| Re-running tuition generator for exited student | Skips periods past exit date |
| Manual VOID on a tuition before exit | Stays VOID with `voidedByExit = false`. Undo exit will not touch it. |
| Cashier attempts exit via direct API call | 403 |
| Online payment in PENDING for a now-voided tuition | Out of scope for this design — Midtrans flow already handles tuition validation server-side; pending payments will fail when settling against a voided tuition. Worth a follow-up but not blocking. |

---

## Localization

All UI strings added to `src/messages/id.json` and `src/messages/en.json` under a new `student.exit.*` key namespace.

---

## Testing

Manual QA checklist (no automated tests in this project per CLAUDE.md):
1. Mark active student exited mid-month (monthly billing) → current month kept, future months voided.
2. Mark exited (quarterly billing) → current quarter kept, future quarters voided.
3. Mark exited (semester billing) → current semester kept.
4. Exit date before join date → error shown.
5. Exit date in future → error shown.
6. Undo exit → voided rows restored to UNPAID with correct fee amount.
7. Manual VOID before exit → undo exit does not restore that row.
8. PARTIAL-status future tuition → warning shown, not auto-voided.
9. Cashier role → exit button hidden in UI; direct API call returns 403.
10. Student list filter switches between Aktif / Keluar / Semua correctly.
11. Exited student logs into portal → banner visible, can still pay outstanding rows.
12. Re-run tuition generation after exit → no new tuitions created for periods past exit.

---

## Out of scope (future work)

- Per-class exit / class transfer workflow.
- Prorated billing for the exit period.
- Bulk exit (e.g., end-of-year graduating class).
- Notification to parent when exit is recorded.
- Restricting portal login for exited students after a grace period.
