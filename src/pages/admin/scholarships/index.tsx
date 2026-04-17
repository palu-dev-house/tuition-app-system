import { Button, Group } from "@mantine/core";
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
import ScholarshipTable from "@/components/tables/ScholarshipTable";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { useImportScholarships } from "@/hooks/api/useScholarships";
import { downloadFileFromApi } from "@/lib/download";
import type { NextPageWithLayout } from "@/lib/page-types";

const ScholarshipsPage: NextPageWithLayout = function ScholarshipsPage() {
  const router = useRouter();
  const t = useTranslations();
  const [importOpened, { open: openImport, close: closeImport }] =
    useDisclosure(false);
  const importScholarships = useImportScholarships();

  const handleImport = async (file: File): Promise<ImportResult> => {
    try {
      const data = await importScholarships.mutateAsync(file);
      notifications.show({
        title: t("scholarship.importComplete"),
        message: t("scholarship.importCompleteMessage", {
          imported: data.imported,
          autoPayments: data.autoPayments,
        }),
        color: "green",
      });
      return {
        success: data.imported,
        skipped: data.skipped,
        extraBadges: [
          {
            color: "blue",
            label: t("scholarship.autoPaid", { count: data.autoPayments }),
          },
        ],
        errors: (data.errors ?? []).map(
          (e: { row: number; error?: string; errors?: string[] }) => ({
            row: e.row,
            message: e.error ?? e.errors?.join(", ") ?? "Unknown error",
          }),
        ),
      };
    } catch (error) {
      notifications.show({
        title: t("scholarship.importFailed"),
        message: (error as Error).message,
        color: "red",
      });
      throw error;
    }
  };

  return (
    <>
      <PageHeader
        title={t("scholarship.title")}
        description={t("scholarship.description")}
        actions={
          <Group>
            <Button
              leftSection={<IconFileUpload size={18} />}
              variant="light"
              onClick={openImport}
            >
              {t("scholarship.import")}
            </Button>
            <Button
              leftSection={<IconPlus size={18} />}
              onClick={() => router.push("/admin/scholarships/new")}
            >
              {t("scholarship.add")}
            </Button>
          </Group>
        }
      />
      <ScholarshipTable />
      <ImportModal
        opened={importOpened}
        onClose={closeImport}
        title={t("scholarship.importTitle")}
        description={t("scholarship.importPageDescription")}
        onDownloadTemplate={() =>
          downloadFileFromApi(
            "/api/v1/scholarships/template",
            "scholarship-import-template.xlsx",
          )
        }
        onImport={handleImport}
      />
    </>
  );
};
ScholarshipsPage.getLayout = (page: ReactElement) => (
  <AdminLayout>{page}</AdminLayout>
);

export default ScholarshipsPage;
