"use client";

import {
  Button,
  Card,
  Checkbox,
  Group,
  Loader,
  Paper,
  SegmentedControl,
  Stack,
  Text,
} from "@mantine/core";
import { IconPrinter } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { usePaymentCard } from "@/hooks/api/usePaymentCard";

type PrintMode = "header" | "selected" | "all";

function formatRp(value: number): string {
  if (!value) return "-";
  return value.toLocaleString("id-ID", { minimumFractionDigits: 0 });
}

interface Props {
  studentId: string;
  academicYearId: string;
}

export default function PaymentCardView({ studentId, academicYearId }: Props) {
  const t = useTranslations();
  const [mode, setMode] = useState<PrintMode>("header");
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set());

  const { data: card, isLoading } = usePaymentCard(studentId, academicYearId);

  // Autofill: when data arrives, pre-select all months that have any paid amount.
  useEffect(() => {
    if (!card) return;
    setSelectedMonths(
      new Set(
        card.months
          .filter((m) => m.totalPaid > 0)
          .map((m) => `${m.period}-${m.year}`),
      ),
    );
  }, [card]);

  // Inject A4 @page for this route only.
  useEffect(() => {
    const style = document.createElement("style");
    style.setAttribute("data-pc-page", "1");
    style.textContent = "@page { size: A4 portrait; margin: 0; }";
    document.head.appendChild(style);
    return () => {
      style.remove();
    };
  }, []);

  const toggleMonth = (key: string) => {
    setSelectedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const monthIsVisible = (monthKey: string) => {
    if (mode === "all") return true;
    if (mode === "selected") return selectedMonths.has(monthKey);
    return false; // header mode: no data cells rendered
  };

  const selectAllPaid = () => {
    if (!card) return;
    setSelectedMonths(
      new Set(
        card.months
          .filter((m) => m.totalPaid > 0)
          .map((m) => `${m.period}-${m.year}`),
      ),
    );
  };

  const selectAllMonths = () => {
    if (!card) return;
    setSelectedMonths(new Set(card.months.map((m) => `${m.period}-${m.year}`)));
  };

  const clearSelection = () => setSelectedMonths(new Set());

  const totalsRow = useMemo(() => {
    if (!card) return { tuition: 0, fee: 0, svc: 0, grand: 0 };
    const visible = card.months.filter((m) => {
      if (mode === "all") return true;
      if (mode === "selected")
        return selectedMonths.has(`${m.period}-${m.year}`);
      return false;
    });
    return {
      tuition: visible.reduce((s, m) => s + (m.tuition?.paidAmount ?? 0), 0),
      fee: visible.reduce((s, m) => s + m.feeBills.paidAmount, 0),
      svc: visible.reduce((s, m) => s + m.serviceFeeBills.paidAmount, 0),
      grand: visible.reduce((s, m) => s + m.totalPaid, 0),
    };
  }, [card, mode, selectedMonths]);

  return (
    <>
      <div className="print-controls">
        <Card withBorder mb="md">
          <Stack gap="md">
            <Group gap="md" align="flex-end" wrap="wrap">
              <Stack gap={4}>
                <Text size="sm" fw={500}>
                  {t("paymentCard.mode")}
                </Text>
                <SegmentedControl
                  data={[
                    { value: "header", label: t("paymentCard.modeHeader") },
                    {
                      value: "selected",
                      label: t("paymentCard.modeSelected"),
                    },
                    { value: "all", label: t("paymentCard.modeAll") },
                  ]}
                  value={mode}
                  onChange={(v) => setMode(v as PrintMode)}
                />
              </Stack>
              <Button
                leftSection={<IconPrinter size={18} />}
                onClick={() => window.print()}
                disabled={!card}
              >
                {t("paymentCard.print")}
              </Button>
            </Group>

            {mode === "selected" && card && (
              <Stack gap={6}>
                <Group gap="xs">
                  <Text size="sm" fw={500}>
                    {t("paymentCard.pickMonths")}
                  </Text>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    onClick={selectAllPaid}
                  >
                    {t("paymentCard.selectPaid")}
                  </Button>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    onClick={selectAllMonths}
                  >
                    {t("paymentCard.selectAll")}
                  </Button>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color="gray"
                    onClick={clearSelection}
                  >
                    {t("paymentCard.clearSelection")}
                  </Button>
                </Group>
                <div className="pc-select-bar">
                  {card.months.map((m) => {
                    const key = `${m.period}-${m.year}`;
                    const hasData = m.totalPaid > 0;
                    return (
                      <Checkbox
                        key={key}
                        label={`${m.periodLabel} ${m.year % 100}${hasData ? " \u2713" : ""}`}
                        checked={selectedMonths.has(key)}
                        onChange={() => toggleMonth(key)}
                        size="xs"
                      />
                    );
                  })}
                </div>
              </Stack>
            )}
          </Stack>
        </Card>

        {isLoading && (
          <Stack align="center" py="xl">
            <Loader />
          </Stack>
        )}

        {!isLoading && !card && (
          <Paper withBorder p="xl">
            <Text ta="center" c="dimmed">
              {t("paymentCard.notFound")}
            </Text>
          </Paper>
        )}
      </div>

      {card && (
        <div className={`pc-page pc-mode-${mode}`}>
          {mode !== "selected" && (
            <>
              <div className="pc-title">{t("paymentCard.cardTitle")}</div>

              <div className="pc-student">
                <div className="pc-student-label">NIS</div>
                <div>: {card.student.nis}</div>
                <div className="pc-student-label">{t("paymentCard.name")}</div>
                <div>: {card.student.name}</div>
                <div className="pc-student-label">{t("paymentCard.class")}</div>
                <div>: {card.class?.className ?? "-"}</div>
              </div>
            </>
          )}

          {mode === "header" && <div className="pc-spacer" />}

          {mode === "selected" && <div className="pc-header-gap" />}

          {mode !== "header" && (
            <table className="pc-table">
              <colgroup>
                <col style={{ width: "9mm" }} />
                <col style={{ width: "24mm" }} />
                <col style={{ width: "20mm" }} />
                <col style={{ width: "20mm" }} />
                <col style={{ width: "20mm" }} />
                <col style={{ width: "20mm" }} />
                <col style={{ width: "19mm" }} />
                <col style={{ width: "24mm" }} />
                <col style={{ width: "30mm" }} />
              </colgroup>
              {mode !== "selected" && (
                <thead>
                  <tr>
                    <th>No</th>
                    <th>{t("paymentCard.month")}</th>
                    <th>{t("paymentCard.tuition")}</th>
                    <th>{t("paymentCard.transport")}</th>
                    <th>{t("paymentCard.service")}</th>
                    <th>{t("paymentCard.total")}</th>
                    <th>{t("paymentCard.payDate")}</th>
                    <th>{t("paymentCard.receiptNo")}</th>
                    <th>{t("paymentCard.cashier")}</th>
                  </tr>
                </thead>
              )}
              <tbody>
                {card.months.map((m) => {
                  const key = `${m.period}-${m.year}`;
                  const visible = monthIsVisible(key);
                  return (
                    <tr
                      key={key}
                      className={visible ? undefined : "pc-row-empty"}
                    >
                      <td className="center pc-label-col">{m.index}</td>
                      <td className="pc-label-col">{m.periodLabel}</td>
                      <td className="num">
                        {visible && m.tuition
                          ? formatRp(m.tuition.paidAmount)
                          : ""}
                      </td>
                      <td className="num">
                        {visible ? formatRp(m.feeBills.paidAmount) : ""}
                      </td>
                      <td className="num">
                        {visible ? formatRp(m.serviceFeeBills.paidAmount) : ""}
                      </td>
                      <td className="num">
                        {visible ? formatRp(m.totalPaid) : ""}
                      </td>
                      <td className="center">
                        {visible && m.lastPaymentDate
                          ? dayjs(m.lastPaymentDate).format("DD/MM/YY")
                          : ""}
                      </td>
                      <td className="center">
                        {visible ? (m.receiptNos[0] ?? "") : ""}
                      </td>
                      <td className="pc-cashier">
                        {visible ? (m.cashierName ?? "") : ""}
                      </td>
                    </tr>
                  );
                })}
                {mode === "all" && (
                  <tr>
                    <td className="center pc-label-col" colSpan={2}>
                      {t("paymentCard.totalRow")}
                    </td>
                    <td className="num">{formatRp(totalsRow.tuition)}</td>
                    <td className="num">{formatRp(totalsRow.fee)}</td>
                    <td className="num">{formatRp(totalsRow.svc)}</td>
                    <td className="num">{formatRp(totalsRow.grand)}</td>
                    <td />
                    <td />
                    <td />
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {mode === "all" && <div className="pc-spacer" />}

          {mode !== "selected" && (
            <div className="pc-notes">
              <div className="pc-notes-title">{t("paymentCard.notes")}:</div>
              <div>1. {t("paymentCard.note1")}</div>
              <div>2. {t("paymentCard.note2")}</div>
              <div>3. {t("paymentCard.note3")}</div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
