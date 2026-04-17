import { Button, Group, List } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconFileUpload, IconPlus } from "@tabler/icons-react";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import AdminLayout from "@/components/layouts/AdminLayout";
import ImportModal, {
  type ImportResult,
} from "@/components/shared/ImportModal";
import TuitionTable from "@/components/tables/TuitionTable";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { useImportTuitions } from "@/hooks/api/useTuitions";
import { downloadFileFromApi } from "@/lib/download";
import type { NextPageWithLayout } from "@/lib/page-types";

const TuitionsPage: NextPageWithLayout = function TuitionsPage() {
  const router = useRouter();
  const t = useTranslations();
  const [importOpened, { open: openImport, close: closeImport }] =
    useDisclosure(false);
  const importTuitions = useImportTuitions();

  const handleImport = async (file: File): Promise<ImportResult> => {
    try {
      const data = await importTuitions.mutateAsync(file);
      notifications.show({
        title: t("common.success"),
        message: t("import.completeMessage", {
          imported: data.generated,
          skipped: data.skipped,
        }),
        color: "green",
      });
      return {
        success: data.generated,
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
        title: t("common.error"),
        message: (error as Error).message,
        color: "red",
      });
      throw error;
    }
  };

  return (
    <>
      <PageHeader
        title={t("tuition.list")}
        description={t("tuition.description")}
        actions={
          <Group gap="xs">
            <Button
              leftSection={<IconFileUpload size={18} />}
              variant="light"
              onClick={openImport}
            >
              {t("common.import")}
            </Button>
            <Button
              leftSection={<IconPlus size={18} />}
              onClick={() => router.push("/admin/tuitions/generate")}
            >
              {t("tuition.generate")}
            </Button>
          </Group>
        }
      />

      <TuitionTable />

      <ImportModal
        opened={importOpened}
        onClose={closeImport}
        title={t("common.import")}
        instructions={
          <List size="sm">
            <List.Item>{t("tuition.importStep1")}</List.Item>
            <List.Item>{t("tuition.importStep2")}</List.Item>
            <List.Item>{t("tuition.importStep3")}</List.Item>
          </List>
        }
        onDownloadTemplate={() =>
          downloadFileFromApi(
            "/api/v1/tuitions/template",
            "tuition-import-template.xlsx",
          )
        }
        onImport={handleImport}
      />
    </>
  );
};
TuitionsPage.getLayout = (page: ReactElement) => (
  <AdminLayout>{page}</AdminLayout>
);

export default TuitionsPage;
