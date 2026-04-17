"use client";

import { Button, Card, Group, Select, Stack } from "@mantine/core";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/layouts/AdminLayout";
import PaymentCardView from "@/components/payment-card/PaymentCardView";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { useAcademicYears } from "@/hooks/api/useAcademicYears";
import { useClassAcademics } from "@/hooks/api/useClassAcademics";
import { useStudentClasses } from "@/hooks/api/useStudentClasses";
import type { NextPageWithLayout } from "@/lib/page-types";

const PaymentCardPage: NextPageWithLayout = function PaymentCardPage() {
  const router = useRouter();
  const t = useTranslations();

  const { studentId: queryStudentId } = router.query as {
    studentId?: string;
  };

  const [academicYearId, setAcademicYearId] = useState<string | null>(null);
  const [classAcademicId, setClassAcademicId] = useState<string | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);

  // Academic years
  const { data: academicYearsData } = useAcademicYears({ limit: 100 });
  const years = academicYearsData?.academicYears ?? [];
  const activeYear = years.find((ay) => ay.isActive);

  // Default to active academic year when none chosen
  useEffect(() => {
    if (!academicYearId && activeYear?.id) {
      setAcademicYearId(activeYear.id);
    }
  }, [academicYearId, activeYear?.id]);

  // Classes for selected academic year
  const { data: classesData } = useClassAcademics({
    limit: 200,
    academicYearId: academicYearId || undefined,
  });
  const classes = classesData?.classes ?? [];

  // Students (filtered by class if chosen, else by academic year)
  const { data: studentClassesData } = useStudentClasses({
    limit: 500,
    academicYearId: academicYearId || undefined,
    classAcademicId: classAcademicId || undefined,
  });

  // Prefill studentId from URL
  useEffect(() => {
    if (queryStudentId && !studentId) {
      setStudentId(queryStudentId);
    }
  }, [queryStudentId, studentId]);

  const yearOptions = useMemo(
    () =>
      years.map((ay) => ({
        value: ay.id,
        label: `${ay.year}${ay.isActive ? ` (${t("common.active")})` : ""}`,
      })),
    [years, t],
  );

  const classOptions = useMemo(
    () => classes.map((c) => ({ value: c.id, label: c.className })),
    [classes],
  );

  const studentOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { value: string; label: string }[] = [];
    for (const sc of studentClassesData?.studentClasses ?? []) {
      const id = sc.student.id;
      if (seen.has(id)) continue;
      seen.add(id);
      opts.push({
        value: id,
        label: `${sc.student.nis} - ${sc.student.name} (${sc.student.schoolLevel})`,
      });
    }
    return opts;
  }, [studentClassesData]);

  // Reset dependent filters when parents change
  const handleYearChange = (value: string | null) => {
    setAcademicYearId(value);
    setClassAcademicId(null);
    setStudentId(null);
  };

  const handleClassChange = (value: string | null) => {
    setClassAcademicId(value);
    setStudentId(null);
  };

  const ready = !!academicYearId && !!studentId;

  return (
    <>
      <div className="print-controls">
        <PageHeader
          title={t("paymentCard.title")}
          actions={
            <Button variant="subtle" onClick={() => router.back()}>
              {t("common.back")}
            </Button>
          }
        />

        <Card withBorder mb="md">
          <Stack gap="md">
            <Group gap="md" align="flex-end" wrap="wrap">
              <Select
                label={t("paymentCard.academicYear")}
                placeholder={t("paymentCard.selectYear")}
                data={yearOptions}
                value={academicYearId}
                onChange={handleYearChange}
                w={240}
                required
                allowDeselect={false}
              />
              <Select
                label={t("paymentCard.class")}
                placeholder={t("paymentCard.selectClass")}
                data={classOptions}
                value={classAcademicId}
                onChange={handleClassChange}
                w={240}
                clearable
                searchable
                disabled={!academicYearId}
              />
              <Select
                label={t("paymentCard.student")}
                placeholder={t("paymentCard.searchStudent")}
                data={studentOptions}
                value={studentId}
                onChange={setStudentId}
                w={360}
                required
                searchable
                disabled={!academicYearId}
                nothingFoundMessage={t("common.noResults")}
              />
            </Group>
          </Stack>
        </Card>
      </div>

      {ready && academicYearId && studentId && (
        <PaymentCardView
          studentId={studentId}
          academicYearId={academicYearId}
        />
      )}
    </>
  );
};

PaymentCardPage.getLayout = (page: ReactElement) => (
  <AdminLayout>{page}</AdminLayout>
);

export default PaymentCardPage;
