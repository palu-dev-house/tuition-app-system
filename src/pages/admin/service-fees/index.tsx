"use client";

import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  MultiSelect,
  NumberInput,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconEdit, IconFileUpload, IconPlus } from "@tabler/icons-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { z } from "zod";
import AdminLayout from "@/components/layouts/AdminLayout";
import ImportModal, {
  type ImportResult,
} from "@/components/shared/ImportModal";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import TablePagination from "@/components/ui/TablePagination";
import { useAcademicYears } from "@/hooks/api/useAcademicYears";
import { useClassAcademics } from "@/hooks/api/useClassAcademics";
import {
  useCreateServiceFee,
  useImportServiceFees,
  useServiceFees,
} from "@/hooks/api/useServiceFees";
import { useQueryFilters } from "@/hooks/useQueryFilters";
import { PERIODS } from "@/lib/business-logic/tuition-generator";
import { downloadFileFromApi } from "@/lib/download";
import type { NextPageWithLayout } from "@/lib/page-types";

const filterSchema = z.object({
  academicYearId: z.string().optional(),
  classAcademicId: z.string().optional(),
  activeOnly: z.enum(["true", "false"]).optional(),
});

function formatRp(v: string | number) {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return `Rp ${n.toLocaleString("id-ID")}`;
}

const ServiceFeesPage: NextPageWithLayout = function ServiceFeesPage() {
  const t = useTranslations();
  const { filters, page, setFilter, setPage } = useQueryFilters({
    schema: filterSchema,
    defaultLimit: 10,
  });
  const academicYearId = filters.academicYearId ?? null;
  const classAcademicId = filters.classAcademicId ?? null;
  const activeOnly = filters.activeOnly !== "false";

  const { data: ayData } = useAcademicYears({ limit: 100 });
  const activeYear = ayData?.academicYears.find((ay) => ay.isActive);
  const effectiveYearId = academicYearId ?? activeYear?.id;

  const { data: classesData } = useClassAcademics({
    limit: 100,
    academicYearId: effectiveYearId,
  });

  const { data, isLoading } = useServiceFees({
    page,
    limit: 10,
    classAcademicId: classAcademicId ?? undefined,
    isActive: activeOnly ? true : undefined,
  });

  const createMutation = useCreateServiceFee();
  const importMutation = useImportServiceFees();
  const [createOpened, { open: openCreate, close: closeCreate }] =
    useDisclosure(false);
  const [importOpened, { open: openImport, close: closeImport }] =
    useDisclosure(false);

  const handleImport = async (file: File): Promise<ImportResult> => {
    try {
      const data = await importMutation.mutateAsync(file);
      notifications.show({
        color: "green",
        title: t("common.success"),
        message: t("import.completeMessage", {
          imported: data.imported,
          skipped: data.skipped,
        }),
      });
      return {
        success: data.imported,
        skipped: data.skipped,
        errors: (data.errors ?? []).map(
          (e: { row: number; error?: string; errors?: string[] }) => ({
            row: e.row,
            message: e.error ?? e.errors?.join(", ") ?? "Unknown",
          }),
        ),
      };
    } catch (error) {
      notifications.show({
        color: "red",
        title: t("common.error"),
        message: (error as Error).message,
      });
      throw error;
    }
  };

  const form = useForm({
    initialValues: {
      classAcademicId: "",
      name: "Uang Perlengkapan",
      amount: 0 as number,
      billingMonths: ["JULY", "JANUARY"] as string[],
    },
    validate: {
      classAcademicId: (v) => (v ? null : t("common.required")),
      name: (v) => (v.trim() ? null : t("common.required")),
      amount: (v) => (v > 0 ? null : t("common.required")),
      billingMonths: (v) => (v.length > 0 ? null : t("common.required")),
    },
  });

  const handleCreate = form.onSubmit((values) => {
    createMutation.mutate(
      {
        classAcademicId: values.classAcademicId,
        name: values.name,
        amount: String(values.amount),
        billingMonths: values.billingMonths,
      },
      {
        onSuccess: () => {
          notifications.show({
            color: "green",
            title: t("common.success"),
            message: t("serviceFee.created"),
          });
          form.reset();
          closeCreate();
        },
        onError: (err) =>
          notifications.show({
            color: "red",
            title: t("common.error"),
            message: err.message,
          }),
      },
    );
  });

  const yearOptions =
    ayData?.academicYears.map((ay) => ({
      value: ay.id,
      label: `${ay.year}${ay.isActive ? ` (${t("common.active")})` : ""}`,
    })) ?? [];

  const classOptions =
    classesData?.classes.map((c) => ({
      value: c.id,
      label: c.className,
    })) ?? [];

  return (
    <>
      <PageHeader
        title={t("serviceFee.title")}
        description={t("serviceFee.description")}
        actions={
          <Group gap="sm">
            <Button
              variant="light"
              leftSection={<IconFileUpload size={18} />}
              onClick={openImport}
            >
              {t("common.import")}
            </Button>
            <Button leftSection={<IconPlus size={18} />} onClick={openCreate}>
              {t("serviceFee.create")}
            </Button>
          </Group>
        }
      />

      <Paper withBorder p="md" mb="md">
        <Group gap="md" wrap="wrap">
          <Select
            placeholder={t("feeService.academicYear")}
            data={yearOptions}
            value={academicYearId}
            onChange={(v) => setFilter("academicYearId", v || null)}
            clearable
            w={220}
          />
          <Select
            placeholder={t("class.title")}
            data={classOptions}
            value={classAcademicId}
            onChange={(v) => setFilter("classAcademicId", v || null)}
            clearable
            searchable
            w={240}
          />
          <Switch
            label={t("feeService.activeOnly")}
            checked={activeOnly}
            onChange={(e) =>
              setFilter("activeOnly", e.currentTarget.checked ? null : "false")
            }
          />
        </Group>
      </Paper>

      <Paper withBorder>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("serviceFee.name")}</Table.Th>
              <Table.Th>{t("class.title")}</Table.Th>
              <Table.Th>{t("serviceFee.amount")}</Table.Th>
              <Table.Th>{t("serviceFee.billingMonths")}</Table.Th>
              <Table.Th>{t("common.status")}</Table.Th>
              <Table.Th style={{ width: 80 }}>{t("common.actions")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {isLoading ? (
              <Table.Tr>
                <Table.Td colSpan={6}>
                  <Text ta="center" c="dimmed" py="md">
                    {t("common.loading")}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : !data?.serviceFees.length ? (
              <Table.Tr>
                <Table.Td colSpan={6}>
                  <Text ta="center" c="dimmed" py="md">
                    {t("common.noData")}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              data.serviceFees.map((sf) => (
                <Table.Tr key={sf.id}>
                  <Table.Td>
                    <Link
                      href={`/admin/service-fees/${sf.id}`}
                      style={{ textDecoration: "none", color: "inherit" }}
                    >
                      <Text fw={500}>{sf.name}</Text>
                    </Link>
                  </Table.Td>
                  <Table.Td>{sf.classAcademic?.className ?? "-"}</Table.Td>
                  <Table.Td>{formatRp(sf.amount)}</Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      {sf.billingMonths.map((m) => (
                        <Badge key={m} variant="light" size="sm">
                          {t(`months.${m}`)}
                        </Badge>
                      ))}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={sf.isActive ? "green" : "gray"}>
                      {sf.isActive ? t("common.active") : t("common.inactive")}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Tooltip label={t("common.edit")}>
                      <ActionIcon
                        variant="subtle"
                        component={Link}
                        href={`/admin/service-fees/${sf.id}`}
                      >
                        <IconEdit size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Table.Td>
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
        </Table>
        {data && (
          <Stack p="md">
            <TablePagination
              value={page}
              total={data.pagination.totalPages}
              onChange={setPage}
            />
          </Stack>
        )}
      </Paper>

      <Modal
        opened={createOpened}
        onClose={closeCreate}
        title={t("serviceFee.create")}
      >
        <form onSubmit={handleCreate}>
          <Stack gap="md">
            <Select
              label={t("class.title")}
              required
              data={classOptions}
              searchable
              {...form.getInputProps("classAcademicId")}
            />
            <TextInput
              label={t("serviceFee.name")}
              required
              {...form.getInputProps("name")}
            />
            <NumberInput
              label={t("serviceFee.amount")}
              required
              min={1}
              prefix="Rp "
              thousandSeparator="."
              decimalSeparator=","
              {...form.getInputProps("amount")}
            />
            <MultiSelect
              label={t("serviceFee.billingMonths")}
              required
              data={PERIODS.MONTHLY.map((p) => ({
                value: p,
                label: t(`months.${p}`),
              }))}
              {...form.getInputProps("billingMonths")}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={closeCreate}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" loading={createMutation.isPending}>
                {t("common.save")}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <ImportModal
        opened={importOpened}
        onClose={closeImport}
        title={t("serviceFee.importTitle")}
        description={t("serviceFee.importDescription")}
        onDownloadTemplate={() =>
          downloadFileFromApi(
            "/api/v1/service-fees/template",
            "service-fee-import-template.xlsx",
          )
        }
        onImport={handleImport}
      />
    </>
  );
};
ServiceFeesPage.getLayout = (page: ReactElement) => (
  <AdminLayout>{page}</AdminLayout>
);

export default ServiceFeesPage;
