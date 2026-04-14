# Student Exit Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow admins to record a student's mid-year exit, automatically VOID all unpaid tuitions for periods starting after the exit date, with a reversible undo.

**Architecture:** Add `exitedAt`/`exitReason`/`exitedBy` to `Student` and `voidedByExit` flag to `Tuition`. Pure-function business logic in `student-exit.ts` handles record/undo inside Prisma transactions. New REST endpoint pair (`POST`/`DELETE /api/v1/students/:nis/exit`) wraps the business logic. UI surfaces a Status section on the student detail page, a status filter on the student list, and a banner on the student portal.

**Tech Stack:** Next.js 14 (Pages Router), Prisma 7, PostgreSQL, Zod, Mantine UI, TanStack Query, next-intl, pnpm, Biome.

**Spec:** [docs/superpowers/specs/2026-04-14-student-exit-tracking-design.md](../specs/2026-04-14-student-exit-tracking-design.md)

**Conventions:**
- This project has **no automated test suite** (per project CLAUDE/spec). Each task uses `pnpm exec tsc --noEmit` and `pnpm exec biome check <files>` as gates instead of unit tests. Manual QA happens at the end (Task 14).
- Each task ends with a commit. Husky runs Biome on staged files automatically.
- All API handlers use `createApiHandler` + `requireRole(request, ["ADMIN"])`.
- All UI strings live in `src/messages/id.json` + `src/messages/en.json` under a new `student.exit.*` namespace.

---

## File map

**Create:**
- `src/lib/business-logic/student-exit.ts` — `recordStudentExit`, `undoStudentExit`, `getPeriodStart`, `isPeriodAfterExit` helpers
- `src/lib/validations/schemas/student-exit.schema.ts` — Zod schema for POST body
- `src/pages/api/v1/students/[nis]/exit/index.ts` — POST + DELETE handlers
- `src/hooks/api/useStudentExit.ts` — `useRecordStudentExit`, `useUndoStudentExit`
- `src/components/forms/StudentExitSection.tsx` — UI section reused on the student detail page

**Modify:**
- `prisma/schema.prisma` — add fields + index
- `src/lib/business-logic/tuition-generator.ts` — skip post-exit periods during generation
- `src/lib/query-keys.ts` — extend `StudentFilters` with `status`; add students.exit key (optional, lists invalidation is enough)
- `src/pages/api/v1/students/index.ts` — accept `status=active|exited|all` query
- `src/hooks/api/useStudents.ts` — extend `Student` type, extend `StudentFilters` consumer
- `src/pages/admin/students/[nis].tsx` — render `StudentExitSection`
- `src/pages/admin/students/index.tsx` — add status filter dropdown + row styling for exited students
- `src/pages/portal/dashboard.tsx` (and other portal pages with shared layout) — banner for exited students
- `src/messages/id.json`, `src/messages/en.json` — add `student.exit.*` keys

---

## Task 1: Schema migration

**Files:**
- Modify: `prisma/schema.prisma:91-128` (Student model), `prisma/schema.prisma:202-234` (Tuition model)
- Generated: `prisma/migrations/<timestamp>_add_student_exit_tracking/migration.sql`

- [ ] **Step 1: Add Student exit fields**

In `prisma/schema.prisma`, inside the `Student` model right before `// Account Soft Delete` (around line 111), add:

```prisma
  // ========== Exit Tracking ==========
  exitedAt    DateTime? @map("exited_at")
  exitReason  String?   @map("exit_reason")
  exitedBy    String?   @map("exited_by")
```

Then in the index block at the bottom of the Student model, add:

```prisma
  @@index([exitedAt])
```

- [ ] **Step 2: Add Tuition voidedByExit flag**

In `prisma/schema.prisma`, inside the `Tuition` model right after `generatedAt` (around line 216), add:

```prisma
  voidedByExit      Boolean       @default(false) @map("voided_by_exit")
```

- [ ] **Step 3: Generate the migration**

Run:

```bash
pnpm exec prisma migrate dev --name add_student_exit_tracking
```

Expected: migration created under `prisma/migrations/`, Prisma client regenerated into `src/generated/prisma`.

- [ ] **Step 4: Type-check**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: no errors (the new fields are nullable / have defaults so existing code keeps compiling).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(db): add student exit tracking fields"
```

---

## Task 2: Period-start helpers in business logic

**Files:**
- Create: `src/lib/business-logic/student-exit.ts` (helpers section only — full file built up across tasks 2, 4, 5)

- [ ] **Step 1: Create the file with period-start helper**

Create `src/lib/business-logic/student-exit.ts`:

```typescript
import type { PaymentFrequency } from "@/generated/prisma";

const MONTH_NUMBER: Record<string, number> = {
  JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4, MAY: 5, JUNE: 6,
  JULY: 7, AUGUST: 8, SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12,
};

const QUARTER_START_MONTH: Record<string, number> = {
  Q1: 7, // July
  Q2: 10, // October
  Q3: 1, // January
  Q4: 4, // April
};

const SEMESTER_START_MONTH: Record<string, number> = {
  SEM1: 7, // July
  SEM2: 1, // January
};

/**
 * First calendar day of a tuition period.
 * `year` is the calendar year stored on the Tuition row (Jan-Jun periods use academicYear.startYear+1).
 */
export function getPeriodStart(
  period: string,
  year: number,
  frequency: PaymentFrequency,
): Date {
  if (frequency === "MONTHLY") {
    const month = MONTH_NUMBER[period];
    if (!month) throw new Error(`Invalid monthly period: ${period}`);
    return new Date(year, month - 1, 1);
  }
  if (frequency === "QUARTERLY") {
    const month = QUARTER_START_MONTH[period];
    if (!month) throw new Error(`Invalid quarterly period: ${period}`);
    return new Date(year, month - 1, 1);
  }
  if (frequency === "SEMESTER") {
    const month = SEMESTER_START_MONTH[period];
    if (!month) throw new Error(`Invalid semester period: ${period}`);
    return new Date(year, month - 1, 1);
  }
  throw new Error(`Unknown frequency: ${frequency}`);
}

/**
 * True when the period begins strictly after the exit date.
 * Used to decide whether a tuition row should be auto-voided on exit.
 */
export function isPeriodAfterExit(
  period: string,
  year: number,
  frequency: PaymentFrequency,
  exitDate: Date,
): boolean {
  return getPeriodStart(period, year, frequency).getTime() > exitDate.getTime();
}
```

- [ ] **Step 2: Type-check and lint**

Run:

```bash
pnpm exec tsc --noEmit && pnpm exec biome check src/lib/business-logic/student-exit.ts
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/business-logic/student-exit.ts
git commit -m "feat(exit): add period-start helpers for student exit logic"
```

---

## Task 3: Zod schema for exit input

**Files:**
- Create: `src/lib/validations/schemas/student-exit.schema.ts`

- [ ] **Step 1: Create the schema**

```typescript
import { z } from "zod";

export const studentExitSchema = z.object({
  exitDate: z.coerce.date(),
  reason: z.string().min(1, "Reason is required").max(500),
});

export type StudentExitInput = z.infer<typeof studentExitSchema>;
```

- [ ] **Step 2: Type-check and lint**

```bash
pnpm exec tsc --noEmit && pnpm exec biome check src/lib/validations/schemas/student-exit.schema.ts
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/validations/schemas/student-exit.schema.ts
git commit -m "feat(exit): add zod schema for student exit input"
```

---

## Task 4: `recordStudentExit` business logic

**Files:**
- Modify: `src/lib/business-logic/student-exit.ts`

- [ ] **Step 1: Add types and the `recordStudentExit` function**

Append to `src/lib/business-logic/student-exit.ts`:

```typescript
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";

export interface RecordExitParams {
  nis: string;
  exitDate: Date;
  reason: string;
  employeeId: string;
}

export interface PartialWarning {
  tuitionId: string;
  period: string;
  year: number;
  paidAmount: string; // Decimal serialized
}

export interface RecordExitResult {
  voidedCount: number;
  partialWarnings: PartialWarning[];
}

export class StudentExitError extends Error {
  constructor(
    public code:
      | "NOT_FOUND"
      | "ALREADY_EXITED"
      | "DATE_BEFORE_JOIN"
      | "DATE_IN_FUTURE",
    message: string,
  ) {
    super(message);
    this.name = "StudentExitError";
  }
}

export async function recordStudentExit(
  params: RecordExitParams,
): Promise<RecordExitResult> {
  const { nis, exitDate, reason, employeeId } = params;

  const student = await prisma.student.findUnique({ where: { nis } });
  if (!student) {
    throw new StudentExitError("NOT_FOUND", `Student ${nis} not found`);
  }
  if (student.exitedAt) {
    throw new StudentExitError(
      "ALREADY_EXITED",
      `Student ${nis} is already exited`,
    );
  }
  if (exitDate < student.startJoinDate) {
    throw new StudentExitError(
      "DATE_BEFORE_JOIN",
      "Exit date cannot be before student's join date",
    );
  }
  // Compare only the date (ignore time) so "today" is allowed.
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (exitDate > today) {
    throw new StudentExitError(
      "DATE_IN_FUTURE",
      "Exit date cannot be in the future",
    );
  }

  return prisma.$transaction(async (tx) => {
    await tx.student.update({
      where: { nis },
      data: { exitedAt: exitDate, exitReason: reason, exitedBy: employeeId },
    });

    // Load all open (UNPAID or PARTIAL) tuitions with their class frequency.
    const candidates = await tx.tuition.findMany({
      where: {
        studentNis: nis,
        status: { in: ["UNPAID", "PARTIAL"] },
      },
      select: {
        id: true,
        period: true,
        year: true,
        status: true,
        paidAmount: true,
        classAcademic: { select: { paymentFrequency: true } },
      },
    });

    const toVoid: string[] = [];
    const partialWarnings: PartialWarning[] = [];

    for (const t of candidates) {
      if (
        !isPeriodAfterExit(
          t.period,
          t.year,
          t.classAcademic.paymentFrequency,
          exitDate,
        )
      ) {
        continue;
      }
      if (t.status === "PARTIAL") {
        partialWarnings.push({
          tuitionId: t.id,
          period: t.period,
          year: t.year,
          paidAmount: t.paidAmount.toString(),
        });
        continue;
      }
      toVoid.push(t.id);
    }

    if (toVoid.length > 0) {
      await tx.tuition.updateMany({
        where: { id: { in: toVoid } },
        data: {
          status: "VOID",
          voidedByExit: true,
          feeAmount: new Prisma.Decimal(0),
          paidAmount: new Prisma.Decimal(0),
        },
      });
    }

    return { voidedCount: toVoid.length, partialWarnings };
  });
}
```

- [ ] **Step 2: Type-check and lint**

```bash
pnpm exec tsc --noEmit && pnpm exec biome check src/lib/business-logic/student-exit.ts
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/business-logic/student-exit.ts
git commit -m "feat(exit): implement recordStudentExit business logic"
```

---

## Task 5: `undoStudentExit` business logic

**Files:**
- Modify: `src/lib/business-logic/student-exit.ts`

- [ ] **Step 1: Add the `undoStudentExit` function**

Append to `src/lib/business-logic/student-exit.ts`:

```typescript
export interface UndoExitParams {
  nis: string;
  employeeId: string; // reserved for future audit; not persisted today
}

export interface UndoExitResult {
  restoredCount: number;
}

export async function undoStudentExit(
  params: UndoExitParams,
): Promise<UndoExitResult> {
  const { nis } = params;

  const student = await prisma.student.findUnique({ where: { nis } });
  if (!student) {
    throw new StudentExitError("NOT_FOUND", `Student ${nis} not found`);
  }
  if (!student.exitedAt) {
    throw new StudentExitError(
      "ALREADY_EXITED", // re-using code: caller treats this as 400
      `Student ${nis} is not currently exited`,
    );
  }

  return prisma.$transaction(async (tx) => {
    // Find tuitions auto-voided by this exit, with their class fee config.
    const voided = await tx.tuition.findMany({
      where: { studentNis: nis, voidedByExit: true },
      select: {
        id: true,
        classAcademic: {
          select: {
            paymentFrequency: true,
            monthlyFee: true,
            quarterlyFee: true,
            semesterFee: true,
          },
        },
      },
    });

    let restoredCount = 0;
    for (const t of voided) {
      const c = t.classAcademic;
      const fee =
        c.paymentFrequency === "MONTHLY"
          ? c.monthlyFee
          : c.paymentFrequency === "QUARTERLY"
            ? c.quarterlyFee
            : c.semesterFee;
      if (fee == null) {
        // Class has no configured fee for its frequency — skip restore (data is inconsistent).
        continue;
      }
      await tx.tuition.update({
        where: { id: t.id },
        data: {
          status: "UNPAID",
          voidedByExit: false,
          feeAmount: fee,
        },
      });
      restoredCount += 1;
    }

    await tx.student.update({
      where: { nis },
      data: { exitedAt: null, exitReason: null, exitedBy: null },
    });

    return { restoredCount };
  });
}
```

- [ ] **Step 2: Type-check and lint**

```bash
pnpm exec tsc --noEmit && pnpm exec biome check src/lib/business-logic/student-exit.ts
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/business-logic/student-exit.ts
git commit -m "feat(exit): implement undoStudentExit business logic"
```

---

## Task 6: Skip post-exit periods during tuition generation

**Files:**
- Modify: `src/lib/business-logic/tuition-generator.ts:358-410` (the `generateTuitions` function and its `Student` type)

- [ ] **Step 1: Read the current Student type used in the generator**

Run:

```bash
pnpm exec grep -n "students:" src/lib/business-logic/tuition-generator.ts | head
```

Note the inline shape — it currently has `nis` and `startJoinDate`. We need to add `exitedAt`.

- [ ] **Step 2: Add `exitedAt` to the generator's student input type**

Open `src/lib/business-logic/tuition-generator.ts`. Find the `TuitionGenerationParams` interface (around line 25–40). Within the `students` array entry shape, add:

```typescript
exitedAt: Date | null;
```

So a typical entry becomes `{ nis: string; startJoinDate: Date; exitedAt: Date | null }`.

- [ ] **Step 3: Filter out post-exit periods inside `generateTuitions`**

Inside the inner loop in `generateTuitions` (around line 388), right after the existing `shouldIncludePeriod(...)` check passes, add the exit guard before constructing the tuition. Replace:

```typescript
    for (const period of periods) {
      if (shouldIncludePeriod(period, startPeriod, frequency)) {
        const year = getPeriodYear(period, academicYear);
```

with:

```typescript
    for (const period of periods) {
      if (shouldIncludePeriod(period, startPeriod, frequency)) {
        const year = getPeriodYear(period, academicYear);
        if (
          student.exitedAt &&
          new Date(year, getPeriodStartMonthIndex(period, frequency), 1).getTime() >
            student.exitedAt.getTime()
        ) {
          continue;
        }
```

- [ ] **Step 4: Add the `getPeriodStartMonthIndex` helper inside the file**

Add this helper near the other period helpers (right after `getSemesterForMonth` around line 298):

```typescript
function getPeriodStartMonthIndex(
  period: string,
  frequency: PaymentFrequency,
): number {
  // Returns 0-indexed month for new Date(year, monthIndex, 1).
  if (frequency === "MONTHLY") {
    return MONTH_TO_NUMBER[period as Month] - 1;
  }
  if (frequency === "QUARTERLY") {
    if (period === "Q1") return 6; // July
    if (period === "Q2") return 9; // October
    if (period === "Q3") return 0; // January
    if (period === "Q4") return 3; // April
  }
  if (frequency === "SEMESTER") {
    if (period === "SEM1") return 6; // July
    if (period === "SEM2") return 0; // January
  }
  throw new Error(`Unknown period ${period} for frequency ${frequency}`);
}
```

- [ ] **Step 5: Update callers that build the `students` array**

Run:

```bash
pnpm exec grep -rn "generateTuitions\|TuitionGenerationParams" src/ --files-with-matches
```

For every caller that constructs the `students: [{ nis, startJoinDate }]` array, also include `exitedAt: student.exitedAt`. Most likely callers live in `src/pages/api/v1/tuitions/generate/` and `src/lib/business-logic/` — make sure the underlying Prisma queries `select` `exitedAt` on the student.

- [ ] **Step 6: Type-check and lint**

```bash
pnpm exec tsc --noEmit && pnpm exec biome check src/lib/business-logic/tuition-generator.ts src/pages/api/v1/tuitions/
```

Expected: no errors. Fix any caller-side type errors by selecting `exitedAt` in the relevant `prisma.student.findMany` calls.

- [ ] **Step 7: Commit**

```bash
git add src/lib/business-logic/tuition-generator.ts src/pages/api/v1/tuitions/
git commit -m "feat(exit): skip post-exit periods during tuition generation"
```

---

## Task 7: API endpoint — POST + DELETE `/students/[nis]/exit`

**Files:**
- Create: `src/pages/api/v1/students/[nis]/exit/index.ts`

- [ ] **Step 1: Create the file**

```typescript
import type { NextRequest } from "next/server";
import { createApiHandler } from "@/lib/api-adapter";
import { requireRole } from "@/lib/api-auth";
import { errorResponse, successResponse } from "@/lib/api-response";
import { getServerT } from "@/lib/i18n-server";
import {
  StudentExitError,
  recordStudentExit,
  undoStudentExit,
} from "@/lib/business-logic/student-exit";
import { studentExitSchema } from "@/lib/validations/schemas/student-exit.schema";
import { parseWithLocale } from "@/lib/validations/parse-with-locale";

function mapErrorStatus(code: StudentExitError["code"]): number {
  return code === "NOT_FOUND" ? 404 : 400;
}

async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ nis: string }> },
) {
  const auth = await requireRole(request, ["ADMIN"]);
  if (auth instanceof Response) return auth;

  const t = await getServerT(request);
  const { nis } = await params;

  try {
    const body = await request.json();
    const parsed = await parseWithLocale(studentExitSchema, body, request);
    if (!parsed.success) return parsed.response;

    const result = await recordStudentExit({
      nis,
      exitDate: parsed.data.exitDate,
      reason: parsed.data.reason,
      employeeId: auth.employeeId,
    });

    return successResponse(result);
  } catch (error) {
    if (error instanceof StudentExitError) {
      return errorResponse(error.message, error.code, mapErrorStatus(error.code));
    }
    console.error("Record student exit error:", error);
    return errorResponse(t("api.internalError"), "SERVER_ERROR", 500);
  }
}

async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ nis: string }> },
) {
  const auth = await requireRole(request, ["ADMIN"]);
  if (auth instanceof Response) return auth;

  const t = await getServerT(request);
  const { nis } = await params;

  try {
    const result = await undoStudentExit({ nis, employeeId: auth.employeeId });
    return successResponse(result);
  } catch (error) {
    if (error instanceof StudentExitError) {
      return errorResponse(error.message, error.code, mapErrorStatus(error.code));
    }
    console.error("Undo student exit error:", error);
    return errorResponse(t("api.internalError"), "SERVER_ERROR", 500);
  }
}

export default createApiHandler({ POST, DELETE });
```

- [ ] **Step 2: Type-check and lint**

```bash
pnpm exec tsc --noEmit && pnpm exec biome check "src/pages/api/v1/students/[nis]/exit/index.ts"
```

Expected: no errors.

- [ ] **Step 3: Smoke test with curl (dev server running)**

Start the dev server in another terminal: `pnpm dev`. Then with a valid admin JWT in `$TOKEN`:

```bash
curl -s -X POST http://localhost:3000/api/v1/students/<NIS>/exit \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"exitDate":"2026-04-01","reason":"Pindah sekolah"}' | jq
```

Expected: `{ "success": true, "data": { "voidedCount": <n>, "partialWarnings": [] } }`.

Then undo:

```bash
curl -s -X DELETE http://localhost:3000/api/v1/students/<NIS>/exit \
  -H "Authorization: Bearer $TOKEN" | jq
```

Expected: `{ "success": true, "data": { "restoredCount": <n> } }`.

- [ ] **Step 4: Commit**

```bash
git add "src/pages/api/v1/students/[nis]/exit/index.ts"
git commit -m "feat(exit): add POST/DELETE student exit API endpoints"
```

---

## Task 8: Extend GET `/students` with status filter

**Files:**
- Modify: `src/pages/api/v1/students/index.ts:11-49`

- [ ] **Step 1: Add status filter to the GET handler**

In `src/pages/api/v1/students/index.ts`, replace the existing `GET` body with:

```typescript
async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const searchParams = request.nextUrl.searchParams;
  const page = Number(searchParams.get("page") || "1");
  const limit = Number(searchParams.get("limit") || "10");
  const search = searchParams.get("search") || undefined;
  const statusParam = searchParams.get("status") || "active";

  const where: Record<string, unknown> = {};

  if (search) {
    where.OR = [
      { nis: { contains: search, mode: "insensitive" } },
      { nik: { contains: search, mode: "insensitive" } },
      { name: { contains: search, mode: "insensitive" } },
    ];
  }

  if (statusParam === "active") {
    where.exitedAt = null;
  } else if (statusParam === "exited") {
    where.exitedAt = { not: null };
  }
  // "all" → no filter

  const [students, total] = await Promise.all([
    prisma.student.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.student.count({ where }),
  ]);

  return successResponse({
    students,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}
```

- [ ] **Step 2: Type-check and lint**

```bash
pnpm exec tsc --noEmit && pnpm exec biome check src/pages/api/v1/students/index.ts
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/v1/students/index.ts
git commit -m "feat(exit): support status filter on GET /students"
```

---

## Task 9: Frontend types, query keys, and exit hooks

**Files:**
- Modify: `src/lib/query-keys.ts:8-14` (extend `StudentFilters`)
- Modify: `src/hooks/api/useStudents.ts:7-27` (extend `Student` type)
- Create: `src/hooks/api/useStudentExit.ts`

- [ ] **Step 1: Extend `StudentFilters`**

In `src/lib/query-keys.ts`, replace the `StudentFilters` interface with:

```typescript
export interface StudentFilters {
  page?: number;
  limit?: number;
  search?: string;
  startJoinDateFrom?: string;
  startJoinDateTo?: string;
  status?: "active" | "exited" | "all";
}
```

- [ ] **Step 2: Extend the `Student` type in `useStudents.ts`**

In `src/hooks/api/useStudents.ts`, add to the `Student` interface (right after `accountDeletedReason`):

```typescript
  // Exit tracking
  exitedAt: string | null;
  exitReason: string | null;
  exitedBy: string | null;
```

- [ ] **Step 3: Create the exit hooks file**

Create `src/hooks/api/useStudentExit.ts`:

```typescript
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

interface PartialWarning {
  tuitionId: string;
  period: string;
  year: number;
  paidAmount: string;
}

interface RecordExitResponse {
  voidedCount: number;
  partialWarnings: PartialWarning[];
}

interface UndoExitResponse {
  restoredCount: number;
}

export function useRecordStudentExit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      nis,
      exitDate,
      reason,
    }: {
      nis: string;
      exitDate: string;
      reason: string;
    }) => {
      const { data } = await apiClient.post<{
        success: boolean;
        data: RecordExitResponse;
      }>(`/students/${nis}/exit`, { exitDate, reason });
      return data.data;
    },
    onSuccess: (_, { nis }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.students.lists() });
      queryClient.invalidateQueries({
        queryKey: queryKeys.students.detail(nis),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.tuitions.all });
    },
  });
}

export function useUndoStudentExit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (nis: string) => {
      const { data } = await apiClient.delete<{
        success: boolean;
        data: UndoExitResponse;
      }>(`/students/${nis}/exit`);
      return data.data;
    },
    onSuccess: (_, nis) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.students.lists() });
      queryClient.invalidateQueries({
        queryKey: queryKeys.students.detail(nis),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.tuitions.all });
    },
  });
}
```

- [ ] **Step 4: Type-check and lint**

```bash
pnpm exec tsc --noEmit && pnpm exec biome check src/lib/query-keys.ts src/hooks/api/useStudents.ts src/hooks/api/useStudentExit.ts
```

Expected: no errors. (Note: `apiClient.delete` may not currently support a typed generic — if tsc complains, fall back to `apiClient.delete(...)` and cast the response.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/query-keys.ts src/hooks/api/useStudents.ts src/hooks/api/useStudentExit.ts
git commit -m "feat(exit): add student exit hooks and types"
```

---

## Task 10: i18n strings

**Files:**
- Modify: `src/messages/id.json`, `src/messages/en.json`

- [ ] **Step 1: Add `student.exit.*` keys to id.json**

In `src/messages/id.json`, find the existing `student` namespace and add a nested `exit` block:

```json
"exit": {
  "sectionTitle": "Status Siswa",
  "statusActive": "Aktif",
  "statusExited": "Sudah Keluar",
  "markExitButton": "Tandai Keluar",
  "exitDateLabel": "Tanggal Keluar",
  "reasonLabel": "Alasan Keluar",
  "reasonPlaceholder": "Contoh: Pindah ke kota lain",
  "previewWillVoid": "{count} tagihan akan dibatalkan",
  "previewPartialWarning": "{count} tagihan dengan pembayaran sebagian perlu ditangani manual",
  "confirmExitButton": "Tandai Keluar",
  "exitedBanner": "Siswa keluar pada {date}. Alasan: {reason}",
  "exitedBannerByLine": "Dicatat oleh {name}",
  "undoButton": "Batalkan Status Keluar",
  "undoConfirm": "Akan memulihkan {count} tagihan ke status UNPAID. Lanjutkan?",
  "recordSuccess": "Status keluar berhasil dicatat. {count} tagihan dibatalkan.",
  "undoSuccess": "Status keluar dibatalkan. {count} tagihan dipulihkan.",
  "errorDateBeforeJoin": "Tanggal keluar tidak boleh sebelum tanggal masuk",
  "errorDateInFuture": "Tanggal keluar tidak boleh di masa depan",
  "errorAlreadyExited": "Siswa sudah berstatus keluar",
  "filterStatusLabel": "Status Siswa",
  "filterActive": "Aktif",
  "filterExited": "Sudah Keluar",
  "filterAll": "Semua",
  "rowBadgeExited": "Keluar",
  "portalBanner": "Akun ini berstatus keluar per {date}. Hanya tagihan tertunggak yang dapat dilihat."
}
```

- [ ] **Step 2: Add the same keys to en.json with English translations**

In `src/messages/en.json`, find the `student` namespace and add:

```json
"exit": {
  "sectionTitle": "Student Status",
  "statusActive": "Active",
  "statusExited": "Exited",
  "markExitButton": "Mark as Exited",
  "exitDateLabel": "Exit Date",
  "reasonLabel": "Exit Reason",
  "reasonPlaceholder": "e.g., Moved to another city",
  "previewWillVoid": "{count} tuitions will be voided",
  "previewPartialWarning": "{count} tuitions with partial payments require manual handling",
  "confirmExitButton": "Mark as Exited",
  "exitedBanner": "Student exited on {date}. Reason: {reason}",
  "exitedBannerByLine": "Recorded by {name}",
  "undoButton": "Undo Exit Status",
  "undoConfirm": "{count} tuitions will be restored to UNPAID. Continue?",
  "recordSuccess": "Exit recorded. {count} tuitions voided.",
  "undoSuccess": "Exit undone. {count} tuitions restored.",
  "errorDateBeforeJoin": "Exit date cannot be before the join date",
  "errorDateInFuture": "Exit date cannot be in the future",
  "errorAlreadyExited": "Student is already exited",
  "filterStatusLabel": "Student Status",
  "filterActive": "Active",
  "filterExited": "Exited",
  "filterAll": "All",
  "rowBadgeExited": "Exited",
  "portalBanner": "This account is in exited status as of {date}. Only outstanding tuitions are visible."
}
```

- [ ] **Step 3: Validate JSON**

```bash
pnpm exec biome check src/messages/id.json src/messages/en.json
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/messages/id.json src/messages/en.json
git commit -m "feat(exit): add i18n strings for student exit feature"
```

---

## Task 11: `StudentExitSection` component

**Files:**
- Create: `src/components/forms/StudentExitSection.tsx`

- [ ] **Step 1: Create the component**

```typescript
"use client";

import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  Stack,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconLogout } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  useRecordStudentExit,
  useUndoStudentExit,
} from "@/hooks/api/useStudentExit";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  nis: string;
  startJoinDate: string;
  exitedAt: string | null;
  exitReason: string | null;
  exitedBy: string | null;
  onChanged: () => void;
}

export default function StudentExitSection({
  nis,
  startJoinDate,
  exitedAt,
  exitReason,
  onChanged,
}: Props) {
  const t = useTranslations("student.exit");
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [exitModalOpened, { open: openExitModal, close: closeExitModal }] =
    useDisclosure(false);
  const [undoModalOpened, { open: openUndoModal, close: closeUndoModal }] =
    useDisclosure(false);

  const [exitDate, setExitDate] = useState<Date | null>(new Date());
  const [reason, setReason] = useState("");

  const recordExit = useRecordStudentExit();
  const undoExit = useUndoStudentExit();

  const handleSubmitExit = () => {
    if (!exitDate || !reason.trim()) return;
    recordExit.mutate(
      { nis, exitDate: exitDate.toISOString(), reason: reason.trim() },
      {
        onSuccess: (data) => {
          notifications.show({
            color: "green",
            title: t("recordSuccess", { count: data.voidedCount }),
            message:
              data.partialWarnings.length > 0
                ? t("previewPartialWarning", {
                    count: data.partialWarnings.length,
                  })
                : "",
          });
          closeExitModal();
          setReason("");
          onChanged();
        },
        onError: (err) => {
          notifications.show({
            color: "red",
            title: "Error",
            message: err instanceof Error ? err.message : "Failed",
          });
        },
      },
    );
  };

  const handleUndo = () => {
    undoExit.mutate(nis, {
      onSuccess: (data) => {
        notifications.show({
          color: "green",
          title: t("undoSuccess", { count: data.restoredCount }),
          message: "",
        });
        closeUndoModal();
        onChanged();
      },
      onError: (err) => {
        notifications.show({
          color: "red",
          title: "Error",
          message: err instanceof Error ? err.message : "Failed",
        });
      },
    });
  };

  return (
    <Card withBorder>
      <Stack gap="md">
        <Title order={5}>{t("sectionTitle")}</Title>

        {exitedAt ? (
          <>
            <Alert icon={<IconAlertTriangle size={18} />} color="yellow">
              <Text fw={500}>
                {t("exitedBanner", {
                  date: new Date(exitedAt).toLocaleDateString(),
                  reason: exitReason ?? "-",
                })}
              </Text>
            </Alert>
            {isAdmin && (
              <Button
                variant="outline"
                onClick={openUndoModal}
                loading={undoExit.isPending}
              >
                {t("undoButton")}
              </Button>
            )}
          </>
        ) : (
          <>
            <Badge color="green" variant="light">
              {t("statusActive")}
            </Badge>
            {isAdmin && (
              <Button
                color="red"
                variant="outline"
                leftSection={<IconLogout size={18} />}
                onClick={openExitModal}
              >
                {t("markExitButton")}
              </Button>
            )}
          </>
        )}
      </Stack>

      <Modal
        opened={exitModalOpened}
        onClose={closeExitModal}
        title={t("markExitButton")}
      >
        <Stack gap="md">
          <DatePickerInput
            label={t("exitDateLabel")}
            value={exitDate}
            onChange={(v) => setExitDate(v ? new Date(v) : null)}
            minDate={new Date(startJoinDate)}
            maxDate={new Date()}
            required
          />
          <Textarea
            label={t("reasonLabel")}
            placeholder={t("reasonPlaceholder")}
            value={reason}
            onChange={(e) => setReason(e.currentTarget.value)}
            minRows={3}
            required
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={closeExitModal}>
              Cancel
            </Button>
            <Button
              color="red"
              onClick={handleSubmitExit}
              loading={recordExit.isPending}
              disabled={!exitDate || !reason.trim()}
            >
              {t("confirmExitButton")}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={undoModalOpened}
        onClose={closeUndoModal}
        title={t("undoButton")}
      >
        <Stack gap="md">
          <Text>
            Tagihan yang dibatalkan oleh status keluar akan dipulihkan ke
            UNPAID.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={closeUndoModal}>
              Cancel
            </Button>
            <Button onClick={handleUndo} loading={undoExit.isPending}>
              {t("undoButton")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Card>
  );
}
```

- [ ] **Step 2: Type-check and lint**

```bash
pnpm exec tsc --noEmit && pnpm exec biome check src/components/forms/StudentExitSection.tsx
```

Expected: no errors. If `DatePickerInput` import fails, verify `@mantine/dates` is installed (`pnpm list @mantine/dates`); if missing, install with `pnpm add @mantine/dates` and add `import "@mantine/dates/styles.css"` to the global CSS entry.

- [ ] **Step 3: Commit**

```bash
git add src/components/forms/StudentExitSection.tsx
git commit -m "feat(exit): add StudentExitSection UI component"
```

---

## Task 12: Wire `StudentExitSection` into the student detail page

**Files:**
- Modify: `src/pages/admin/students/[nis].tsx`

- [ ] **Step 1: Import the component**

At the top of `src/pages/admin/students/[nis].tsx`, add:

```typescript
import StudentExitSection from "@/components/forms/StudentExitSection";
```

- [ ] **Step 2: Render the section between the form and account management**

Inside the `<Stack gap="lg">` block in the JSX (around line 202), insert the section between `</Paper>` (closing the StudentForm Paper) and the Account Management `<Card>`:

```typescript
<StudentExitSection
  nis={student.nis}
  startJoinDate={student.startJoinDate}
  exitedAt={student.exitedAt}
  exitReason={student.exitReason}
  exitedBy={student.exitedBy}
  onChanged={() => refetch()}
/>
```

- [ ] **Step 3: Type-check and lint**

```bash
pnpm exec tsc --noEmit && pnpm exec biome check "src/pages/admin/students/[nis].tsx"
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "src/pages/admin/students/[nis].tsx"
git commit -m "feat(exit): show exit section on student detail page"
```

---

## Task 13: Status filter on student list + row styling

**Files:**
- Modify: `src/pages/admin/students/index.tsx`
- Modify: any `StudentTable` component if rendering happens there (find with grep)

- [ ] **Step 1: Find where students are rendered**

```bash
pnpm exec grep -rn "useStudents(" src/pages/admin/students/ src/components/
```

Note the table component (likely `src/components/tables/StudentTable.tsx`).

- [ ] **Step 2: Add status filter state to the list page**

In `src/pages/admin/students/index.tsx`, add a `Select` for status filter wired into the `useStudents` filters object. Default value: `"active"`.

```typescript
import { Select } from "@mantine/core";

// inside component:
const [status, setStatus] = useState<"active" | "exited" | "all">("active");
const t = useTranslations("student.exit");

// pass status into useStudents filters:
const { data } = useStudents({ ...otherFilters, status });

// render the select alongside existing filters:
<Select
  label={t("filterStatusLabel")}
  value={status}
  onChange={(v) => setStatus((v as "active" | "exited" | "all") ?? "active")}
  data={[
    { value: "active", label: t("filterActive") },
    { value: "exited", label: t("filterExited") },
    { value: "all", label: t("filterAll") },
  ]}
/>
```

- [ ] **Step 3: Add muted styling and badge for exited rows**

In the table component that renders student rows, when `student.exitedAt` is truthy, render a Mantine `<Badge color="gray" variant="light">{t("rowBadgeExited")}</Badge>` next to the name and apply `c="dimmed"` to the row's text. Use the existing pattern in the file for conditional rendering.

- [ ] **Step 4: Type-check and lint**

```bash
pnpm exec tsc --noEmit && pnpm exec biome check src/pages/admin/students/ src/components/tables/
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/students/index.tsx src/components/tables/
git commit -m "feat(exit): add status filter and exited badge on student list"
```

---

## Task 14: Portal banner for exited students

**Files:**
- Identify and modify the portal layout (likely `src/components/layouts/PortalLayout.tsx` or top-level portal page)

- [ ] **Step 1: Identify the portal layout**

```bash
pnpm exec grep -rn "useStudentAuth\|portal" src/components/layouts/ src/pages/portal/ --files-with-matches | head
```

Locate the layout component that wraps portal pages. Inspect the auth hook used (likely `useStudentAuth` returning the logged-in student object).

- [ ] **Step 2: Add the banner above page content**

In the portal layout, add an `Alert` rendered when the logged-in student has `exitedAt`:

```typescript
import { Alert } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

// inside the layout, after fetching the session student:
const t = useTranslations("student.exit");
{session?.student?.exitedAt && (
  <Alert
    icon={<IconAlertTriangle size={18} />}
    color="yellow"
    mb="md"
  >
    {t("portalBanner", {
      date: new Date(session.student.exitedAt).toLocaleDateString(),
    })}
  </Alert>
)}
```

If `session.student` doesn't currently expose `exitedAt`, update its type and the corresponding `prisma.student.findUnique` `select` (likely in `src/lib/student-auth.ts`) to include `exitedAt`.

- [ ] **Step 3: Type-check and lint**

```bash
pnpm exec tsc --noEmit && pnpm exec biome check src/components/layouts/ src/lib/student-auth.ts src/pages/portal/
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/layouts/ src/lib/student-auth.ts src/pages/portal/
git commit -m "feat(exit): show banner to exited students in portal"
```

---

## Task 15: Manual QA pass

**Files:** none — this is a verification pass against the running app.

- [ ] **Step 1: Start the dev server**

```bash
pnpm dev
```

Open the admin panel at `http://localhost:3000/admin` and log in as ADMIN.

- [ ] **Step 2: Run the spec QA checklist**

For each item, observe the actual behavior and check it off:

1. Pick an active student on monthly billing. Mark exited at mid-month. Confirm: current month tuition kept, future months show as VOID in the tuition list.
2. Pick a student on quarterly billing. Mark exited mid-quarter. Confirm: current quarter kept, future quarters voided.
3. Pick a student on semester billing. Mark exited mid-semester. Confirm: current semester kept, SEM2 voided if exit was in SEM1.
4. Try to set exit date before student's `startJoinDate` → modal should reject (server returns 400 with `DATE_BEFORE_JOIN`).
5. Try to set exit date in the future → modal should reject (date picker `maxDate` already prevents this; server returns 400 if bypassed).
6. Click "Undo Exit" on an exited student → confirm voided rows restored to UNPAID with correct fee (verify against the class's monthly/quarterly/semester fee).
7. Manually VOID a tuition row first, then mark exit covering that row's period. Undo exit → that manually-voided row should remain VOID.
8. Set up a PARTIAL-status tuition (make a partial payment). Mark exit covering its period. Confirm: row stays PARTIAL; banner/notification mentions partial warning count.
9. Log in as CASHIER → student detail page should not show the "Mark as Exited" button. Direct API call (curl) with cashier token returns 403.
10. On student list, switch the Status filter between Active / Exited / All — list updates correctly. Exited rows render with muted text and "Keluar" badge.
11. Log into the portal as an exited student → yellow banner visible at top of dashboard. Outstanding (PAID/PARTIAL) tuitions remain visible; VOID rows hidden as before.
12. Trigger tuition generation (admin → tuitions → generate) for a class containing an exited student → no new tuition rows for periods after that student's exit date.

- [ ] **Step 3: If issues found, fix them with focused commits**

Each fix gets its own commit (`fix(exit): ...`). Re-run the failing QA item.

- [ ] **Step 4: Final commit if any docs touched**

If you updated docs as part of QA fixes:

```bash
git add docs/
git commit -m "docs(exit): update notes from QA"
```

---

## Done

All tasks complete when:
- All 15 tasks checked off
- `pnpm exec tsc --noEmit` clean
- `pnpm exec biome check .` clean
- All QA items in Task 15 pass
- Branch ready for PR with the spec linked in the description
