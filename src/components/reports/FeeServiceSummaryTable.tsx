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

export function FeeServiceSummaryTable({
  filters,
  page,
  limit,
  onPageChange,
}: Props) {
  const t = useTranslations();
  const { data, isLoading } = useFeeServiceSummary({ ...filters, page, limit });

  if (isLoading || !data) return <Loader />;

  return (
    <>
      <Grid>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Card withBorder>
            <Text size="sm" c="dimmed">
              {t("report.feeServiceSummary.totalBilled")}
            </Text>
            <Text fw={700} size="xl">
              {formatRp(data.totals.billed)}
            </Text>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Card withBorder>
            <Text size="sm" c="dimmed">
              {t("report.feeServiceSummary.totalPaid")}
            </Text>
            <Text fw={700} size="xl" c="green">
              {formatRp(data.totals.paid)}
            </Text>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Card withBorder>
            <Text size="sm" c="dimmed">
              {t("report.feeServiceSummary.outstanding")}
            </Text>
            <Text fw={700} size="xl" c="red">
              {formatRp(data.totals.outstanding)}
            </Text>
          </Card>
        </Grid.Col>
      </Grid>
      <Paper withBorder mt="md">
        <Table striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("report.feeServiceSummary.feeService")}</Table.Th>
              <Table.Th>{t("report.feeServiceSummary.category")}</Table.Th>
              <Table.Th>
                {t("report.feeServiceSummary.activeStudents")}
              </Table.Th>
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
        value={page}
        total={data.totalPages}
        onChange={onPageChange}
      />
    </>
  );
}
