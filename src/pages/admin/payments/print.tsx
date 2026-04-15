import {
  Alert,
  Button,
  Card,
  Checkbox,
  Group,
  Loader,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconFilter,
  IconPrinter,
  IconReceipt,
  IconSearch,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";
import { flushSync } from "react-dom";
import AdminLayout from "@/components/layouts/AdminLayout";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { useAcademicYears } from "@/hooks/api/useAcademicYears";
import {
  type PrintPayment,
  usePrintPayments,
} from "@/hooks/api/usePrintPayments";
import { useStudents } from "@/hooks/api/useStudents";
import type { NextPageWithLayout } from "@/lib/page-types";

type PrintMode = "today" | "all" | "student";
type LayoutMode = "compact" | "full";

const MAX_ITEMS_PER_SLIP = 6;
const SLIPS_PER_PAGE = 8;

function formatRp(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return `Rp ${num.toLocaleString("id-ID", { minimumFractionDigits: 0 })}`;
}

interface StudentGroup {
  nis: string;
  name: string;
  className: string;
  academicYear: string;
  payments: PrintPayment[];
  total: number;
  latestDate: string;
  kasirName: string | null;
}

function getStudentRef(p: PrintPayment) {
  return (
    p.tuition?.student ??
    p.feeBill?.student ??
    p.serviceFeeBill?.student ??
    null
  );
}

function getClassRef(p: PrintPayment) {
  return (
    p.tuition?.classAcademic ??
    p.feeBill?.classAcademic ??
    p.serviceFeeBill?.classAcademic ??
    null
  );
}

function groupByStudent(payments: PrintPayment[]): StudentGroup[] {
  const groups = new Map<string, StudentGroup>();
  for (const p of payments) {
    const s = getStudentRef(p);
    const c = getClassRef(p);
    if (!s) continue;
    const nis = s.nis;
    const existing = groups.get(nis);
    const amount = parseFloat(p.amount);
    if (existing) {
      existing.payments.push(p);
      existing.total += amount;
      if (p.paymentDate > existing.latestDate) {
        existing.latestDate = p.paymentDate;
        existing.kasirName = p.employee?.name ?? existing.kasirName;
      }
    } else {
      groups.set(nis, {
        nis,
        name: s.name,
        className: c?.className ?? "",
        academicYear: c?.academicYear.year ?? "",
        payments: [p],
        total: amount,
        latestDate: p.paymentDate,
        kasirName: p.employee?.name ?? null,
      });
    }
  }
  return Array.from(groups.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

function buildLineLabel(
  p: PrintPayment,
  formatPeriod: (period: string) => string,
  t: ReturnType<typeof useTranslations>,
): string {
  if (p.tuition) {
    return `${t("invoice.tuitionShort")} ${formatPeriod(p.tuition.period)}`;
  }
  if (p.feeBill) {
    return `${p.feeBill.feeService.name} ${formatPeriod(p.feeBill.period)}`;
  }
  if (p.serviceFeeBill) {
    return `${p.serviceFeeBill.serviceFee.name} ${formatPeriod(p.serviceFeeBill.period)}`;
  }
  return "-";
}

function CompactSlip({
  group,
  formatPeriod,
  t,
  selected,
  onToggle,
}: {
  group: StudentGroup;
  formatPeriod: (period: string) => string;
  t: ReturnType<typeof useTranslations>;
  selected: boolean;
  onToggle: (nis: string) => void;
}) {
  const visibleItems = group.payments.slice(0, MAX_ITEMS_PER_SLIP);
  const overflow = group.payments.length - visibleItems.length;

  return (
    <div className="slip-compact">
      <div className="slip-select">
        <Checkbox
          size="xs"
          checked={selected}
          onChange={() => onToggle(group.nis)}
          aria-label={group.name}
        />
      </div>
      <div className="slip-header">
        <div className="slip-name">{group.name}</div>
        <div className="slip-class">{group.className}</div>
      </div>
      <div className="slip-sub">
        <span>NIS: {group.nis}</span>
        <span>{group.academicYear}</span>
      </div>

      <div className="slip-items">
        {visibleItems.map((p) => (
          <div className="slip-item-row" key={p.id}>
            <span className="slip-item-label">
              {buildLineLabel(p, formatPeriod, t)}
            </span>
            <span className="slip-item-amount">
              {formatRp(parseFloat(p.amount))}
            </span>
          </div>
        ))}
        {overflow > 0 && (
          <div className="slip-more">
            +{overflow} {t("invoice.moreItems")}
          </div>
        )}
      </div>

      <div className="slip-footer">
        <span className="slip-total-label">{t("invoice.total")}</span>
        <span className="slip-total-value">{formatRp(group.total)}</span>
      </div>
      <div className="slip-meta">
        <span>{dayjs(group.latestDate).format("DD/MM/YYYY")}</span>
        <span>{group.kasirName ?? t("invoice.admin")}</span>
      </div>
    </div>
  );
}

function FullInvoice({
  payment,
  selected,
  onToggle,
}: {
  payment: PrintPayment;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  const t = useTranslations();
  const student = getStudentRef(payment);
  const klass = getClassRef(payment);

  const formatPeriodLocal = (period: string): string => {
    const monthKey = `months.${period}` as const;
    const monthTranslation = t.raw(monthKey);
    if (monthTranslation !== monthKey) {
      return (monthTranslation as string).slice(0, 3);
    }
    return period;
  };

  let feeAmount = 0;
  let deduction = 0;
  let stampVisible = false;
  let description = "-";

  if (payment.tuition) {
    const fee = parseFloat(payment.tuition.feeAmount);
    const scholarship = parseFloat(payment.tuition.scholarshipAmount);
    const discount = parseFloat(payment.tuition.discountAmount);
    feeAmount = fee;
    deduction = scholarship + discount;
    stampVisible = payment.tuition.status === "PAID";
    description = `${t("invoice.tuitionFee")} - ${formatPeriodLocal(payment.tuition.period)} ${payment.tuition.year}`;
  } else if (payment.feeBill) {
    feeAmount = parseFloat(payment.feeBill.amount);
    stampVisible = payment.feeBill.status === "PAID";
    description = `${payment.feeBill.feeService.name} - ${formatPeriodLocal(payment.feeBill.period)} ${payment.feeBill.year}`;
  } else if (payment.serviceFeeBill) {
    feeAmount = parseFloat(payment.serviceFeeBill.amount);
    stampVisible = payment.serviceFeeBill.status === "PAID";
    description = `${payment.serviceFeeBill.serviceFee.name} - ${formatPeriodLocal(payment.serviceFeeBill.period)} ${payment.serviceFeeBill.year}`;
  }

  const effectiveFee = feeAmount - deduction;
  const paidAmount = parseFloat(payment.amount);

  return (
    <div className="invoice-slot">
      <div className="slip-select">
        <Checkbox
          size="xs"
          checked={selected}
          onChange={() => onToggle(payment.id)}
          aria-label={student?.name ?? ""}
        />
      </div>
      {stampVisible && <div className="inv-stamp">{t("invoice.paid")}</div>}
      <div className="inv-header">
        <div>
          <div className="inv-school">{t("invoice.schoolName")}</div>
          <div className="inv-school-sub">{t("invoice.schoolAddress")}</div>
        </div>
        <div className="inv-receipt-label">
          <div className="label">{t("invoice.receipt")}</div>
          <div className="receipt-no">
            {payment.id.slice(0, 8).toUpperCase()}
          </div>
          <div className="receipt-date">
            {dayjs(payment.paymentDate).format("DD/MM/YYYY HH:mm")}
          </div>
        </div>
      </div>

      <div className="inv-student-row">
        <div className="inv-field">
          <span className="inv-field-label">{t("invoice.studentName")}</span>
          <span className="inv-field-value">{student?.name ?? "-"}</span>
        </div>
        <div className="inv-field">
          <span className="inv-field-label">{t("invoice.class")}</span>
          <span className="inv-field-value">{klass?.className ?? "-"}</span>
        </div>
        <div className="inv-field">
          <span className="inv-field-label">{t("invoice.nis")}</span>
          <span className="inv-field-value">{student?.nis ?? "-"}</span>
        </div>
        <div className="inv-field">
          <span className="inv-field-label">{t("invoice.academicYear")}</span>
          <span className="inv-field-value">
            {klass?.academicYear.year ?? "-"}
          </span>
        </div>
      </div>

      <table className="inv-table">
        <thead>
          <tr>
            <th style={{ width: "35%" }}>{t("invoice.description")}</th>
            <th style={{ width: "22%" }} className="num">
              {t("invoice.amount")}
            </th>
            <th style={{ width: "22%" }} className="num">
              {t("invoice.deduction")}
            </th>
            <th style={{ width: "21%" }} className="num">
              {t("invoice.total")}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{description}</td>
            <td className="num">{formatRp(feeAmount)}</td>
            <td className="num">{deduction > 0 ? formatRp(deduction) : "-"}</td>
            <td className="num">{formatRp(effectiveFee)}</td>
          </tr>
          <tr className="total-row">
            <td colSpan={2}>{t("invoice.paymentReceived")}</td>
            <td className="num" colSpan={2}>
              {formatRp(paidAmount)}
            </td>
          </tr>
        </tbody>
      </table>

      <div className="inv-footer">
        <div className="inv-footer-left">
          {payment.notes && (
            <div>
              {t("invoice.notes")}: {payment.notes}
            </div>
          )}
          <div>{t("invoice.thankYou")}</div>
        </div>
        <div className="inv-footer-right">
          <div className="inv-signature-line" />
          <div className="inv-signature-name">
            {payment.employee?.name || t("invoice.admin")}
          </div>
        </div>
      </div>
    </div>
  );
}

const PrintInvoicePage: NextPageWithLayout = function PrintInvoicePage() {
  const t = useTranslations();
  const [academicYearId, setAcademicYearId] = useState<string | null>(null);
  const [mode, setMode] = useState<PrintMode>("today");
  const [layout, setLayout] = useState<LayoutMode>("compact");
  const [studentNis, setStudentNis] = useState<string | null>(null);
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const router = useRouter();
  const transactionId =
    (router.query.transactionId as string | undefined) ?? undefined;

  const { data: academicYearsData } = useAcademicYears({ limit: 100 });
  const activeYear = academicYearsData?.academicYears.find((ay) => ay.isActive);
  const effectiveYearId = academicYearId || activeYear?.id;

  const { data: studentsData } = useStudents({
    search: studentSearch,
    limit: 20,
    status: "all",
  });

  const { data: payments, isLoading } = usePrintPayments({
    academicYearId: mode === "student" ? undefined : effectiveYearId,
    mode,
    studentNis: mode === "student" ? (studentNis ?? undefined) : undefined,
    transactionId,
    enabled: mode === "student" ? !!studentNis : !!effectiveYearId,
  });

  const formatPeriod = (period: string): string => {
    const monthKey = `months.${period}` as const;
    const monthTranslation = t.raw(monthKey);
    if (monthTranslation !== monthKey) {
      return (monthTranslation as string).slice(0, 3);
    }
    const periodKey = `periods.${period}` as const;
    const periodTranslation = t.raw(periodKey);
    if (periodTranslation !== periodKey) {
      return periodTranslation as string;
    }
    return period;
  };

  const academicYearOptions =
    academicYearsData?.academicYears.map((ay) => ({
      value: ay.id,
      label: `${ay.year}${ay.isActive ? ` (${t("common.active")})` : ""}`,
    })) || [];

  const studentOptions = useMemo(
    () =>
      studentsData?.students.map((s) => ({
        value: s.nis,
        label: `${s.nis} — ${s.name}`,
      })) || [],
    [studentsData],
  );

  const selectedStudentName = useMemo(() => {
    if (!studentNis) return null;
    const found = studentsData?.students.find((s) => s.nis === studentNis);
    return found?.name ?? null;
  }, [studentNis, studentsData]);

  // Group payments by student for compact layout
  const studentGroups = useMemo(
    () => (payments ? groupByStudent(payments) : []),
    [payments],
  );

  const [isPrintingSelected, setIsPrintingSelected] = useState(false);
  const hasSelection = selectedIds.size > 0;

  // Filter for print when "Cetak Terpilih" is active
  const renderedGroups = useMemo(() => {
    if (isPrintingSelected && hasSelection) {
      return studentGroups.filter((g) => selectedIds.has(g.nis));
    }
    return studentGroups;
  }, [isPrintingSelected, hasSelection, studentGroups, selectedIds]);

  const renderedPayments = useMemo(() => {
    if (!payments) return [];
    if (isPrintingSelected && hasSelection) {
      return payments.filter((p) => selectedIds.has(p.id));
    }
    return payments;
  }, [isPrintingSelected, hasSelection, payments, selectedIds]);

  // Chunk slips into pages
  const slipPages: StudentGroup[][] = useMemo(() => {
    const pages: StudentGroup[][] = [];
    for (let i = 0; i < renderedGroups.length; i += SLIPS_PER_PAGE) {
      pages.push(renderedGroups.slice(i, i + SLIPS_PER_PAGE));
    }
    return pages;
  }, [renderedGroups]);

  // Chunk full invoices 3 per page (existing layout)
  const fullPages: PrintPayment[][] = useMemo(() => {
    const pages: PrintPayment[][] = [];
    for (let i = 0; i < renderedPayments.length; i += 3) {
      pages.push(renderedPayments.slice(i, i + 3));
    }
    return pages;
  }, [renderedPayments]);

  const handlePrintAll = () => {
    setSelectedIds(new Set());
    window.print();
  };

  const handlePrintSelected = () => {
    flushSync(() => setIsPrintingSelected(true));
    window.print();
    setIsPrintingSelected(false);
  };

  const handleSelectAll = () => {
    if (layout === "compact") {
      setSelectedIds(new Set(studentGroups.map((g) => g.nis)));
    } else {
      setSelectedIds(new Set((payments ?? []).map((p) => p.id)));
    }
  };

  const handleClearSelection = () => setSelectedIds(new Set());

  const totalCount =
    layout === "compact" ? studentGroups.length : payments?.length || 0;
  const selectedCount = selectedIds.size;

  return (
    <>
      {/* Controls - hidden on print */}
      <div className="print-controls">
        <PageHeader
          title={t("invoice.printTitle")}
          description={t("invoice.printDescription")}
        />

        <Card withBorder mb="md">
          <Stack gap="md">
            <Group gap="md" align="flex-end" wrap="wrap">
              <Stack gap={4}>
                <Text size="sm" fw={500}>
                  {t("invoice.layoutMode")}
                </Text>
                <SegmentedControl
                  data={[
                    { value: "compact", label: t("invoice.layoutCompact") },
                    { value: "full", label: t("invoice.layoutFull") },
                  ]}
                  value={layout}
                  onChange={(v) => setLayout(v as LayoutMode)}
                />
              </Stack>

              <Stack gap={4}>
                <Text size="sm" fw={500}>
                  {t("invoice.printMode")}
                </Text>
                <SegmentedControl
                  data={[
                    { value: "today", label: t("invoice.today") },
                    { value: "all", label: t("invoice.allPaid") },
                    { value: "student", label: t("invoice.perStudent") },
                  ]}
                  value={mode}
                  onChange={(v) => {
                    setMode(v as PrintMode);
                    if (v !== "student") setStudentNis(null);
                  }}
                />
              </Stack>
            </Group>

            <Group gap="md" align="flex-end" wrap="wrap">
              {mode !== "student" && (
                <Select
                  label={t("invoice.academicYear")}
                  placeholder={t("invoice.selectYear")}
                  leftSection={<IconFilter size={16} />}
                  data={academicYearOptions}
                  value={academicYearId}
                  onChange={setAcademicYearId}
                  clearable
                  w={250}
                />
              )}

              {mode === "student" && (
                <>
                  <TextInput
                    label={t("invoice.searchStudent")}
                    placeholder={t("invoice.searchStudentPlaceholder")}
                    leftSection={<IconSearch size={16} />}
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.currentTarget.value)}
                    w={260}
                  />
                  <Select
                    label={t("invoice.selectStudent")}
                    placeholder={t("invoice.selectStudentPlaceholder")}
                    data={studentOptions}
                    value={studentNis}
                    onChange={setStudentNis}
                    searchable
                    clearable
                    w={320}
                    nothingFoundMessage={t("invoice.noStudentFound")}
                  />
                </>
              )}

              <Button
                leftSection={<IconPrinter size={18} />}
                onClick={handlePrintAll}
                disabled={!payments || payments.length === 0}
              >
                {t("invoice.printAll")} ({totalCount})
              </Button>

              <Button
                leftSection={<IconPrinter size={18} />}
                variant="light"
                onClick={handlePrintSelected}
                disabled={selectedCount === 0}
              >
                {t("invoice.printSelected")} ({selectedCount})
              </Button>

              <Button
                variant="subtle"
                onClick={handleSelectAll}
                disabled={totalCount === 0}
              >
                {t("invoice.selectAll")}
              </Button>

              <Button
                variant="subtle"
                color="gray"
                onClick={handleClearSelection}
                disabled={selectedCount === 0}
              >
                {t("invoice.clearSelection")}
              </Button>
            </Group>

            {mode === "student" && selectedStudentName && (
              <Alert
                color="blue"
                variant="light"
                icon={<IconReceipt size={16} />}
              >
                {t("invoice.reprintingFor", { name: selectedStudentName })}
              </Alert>
            )}
          </Stack>
        </Card>

        {isLoading && (
          <Stack align="center" py="xl">
            <Loader />
          </Stack>
        )}

        {!isLoading && mode === "student" && !studentNis && (
          <Alert color="gray" variant="light" icon={<IconSearch size={18} />}>
            {t("invoice.selectStudentFirst")}
          </Alert>
        )}

        {!isLoading &&
          (mode !== "student" || studentNis) &&
          payments &&
          payments.length === 0 && (
            <Alert
              icon={<IconAlertCircle size={18} />}
              color="gray"
              variant="light"
            >
              {mode === "today"
                ? t("invoice.noPaymentsToday")
                : mode === "student"
                  ? t("invoice.noPaymentsForStudent")
                  : t("invoice.noPayments")}
            </Alert>
          )}
      </div>

      {/* Compact Layout (grouped by student) */}
      {layout === "compact" && renderedGroups.length > 0 && (
        <div className={`print-area${hasSelection ? " has-selection" : ""}`}>
          {slipPages.map((pageGroups, pageIdx) => (
            <div className="slip-page" key={`slip-${pageIdx}`}>
              {pageGroups.map((group) => (
                <CompactSlip
                  key={group.nis}
                  group={group}
                  formatPeriod={formatPeriod}
                  t={t}
                  selected={selectedIds.has(group.nis)}
                  onToggle={toggleSelected}
                />
              ))}
              {Array.from({ length: SLIPS_PER_PAGE - pageGroups.length }).map(
                (_, i) => (
                  <div
                    key={`empty-${i}`}
                    className="slip-compact"
                    style={{ visibility: "hidden" }}
                  />
                ),
              )}
            </div>
          ))}
        </div>
      )}

      {/* Full Invoice Layout (1 per slot, 3 per page) */}
      {layout === "full" && renderedPayments.length > 0 && (
        <div className={`print-area${hasSelection ? " has-selection" : ""}`}>
          {fullPages.map((pagePayments, pageIdx) => (
            <div className="print-page" key={`full-${pageIdx}`}>
              {pagePayments.map((payment) => (
                <FullInvoice
                  key={payment.id}
                  payment={payment}
                  selected={selectedIds.has(payment.id)}
                  onToggle={toggleSelected}
                />
              ))}
              {Array.from({ length: 3 - pagePayments.length }).map((_, i) => (
                <div
                  className="invoice-slot"
                  key={`empty-${i}`}
                  style={{ opacity: 0 }}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Screen-only summary */}
      {payments && payments.length > 0 && (
        <div className="print-controls">
          <Group justify="center" py="md">
            <IconReceipt size={16} color="gray" />
            <Text size="sm" c="dimmed">
              {layout === "compact"
                ? t("invoice.totalSlips", {
                    count: studentGroups.length,
                    pages: slipPages.length,
                  })
                : `${t("invoice.totalInvoices", { count: payments.length })} · ${t("invoice.totalPages", { count: fullPages.length })}`}
            </Text>
          </Group>
        </div>
      )}
    </>
  );
};
PrintInvoicePage.getLayout = (page: ReactElement) => (
  <AdminLayout>{page}</AdminLayout>
);

export default PrintInvoicePage;
