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
import StudentTable from "@/components/tables/StudentTable";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { useImportStudents } from "@/hooks/api/useStudents";
import { usePermissions } from "@/hooks/usePermissions";
import { downloadFileFromApi } from "@/lib/download";
import type { NextPageWithLayout } from "@/lib/page-types";

const StudentsPage: NextPageWithLayout = function StudentsPage() {
  const router = useRouter();
  const { canCreate } = usePermissions();
  const t = useTranslations();
  const [importOpened, { open: openImport, close: closeImport }] =
    useDisclosure(false);
  const importStudents = useImportStudents();

  const handleImport = async (file: File): Promise<ImportResult> => {
    try {
      const data = await importStudents.mutateAsync(file);
      notifications.show({
        title: t("student.importComplete"),
        message: t("student.importCompleteMessage", {
          imported: data.imported,
          updated: data.updated,
        }),
        color: "green",
      });
      return {
        success: data.imported,
        extraBadges: [
          {
            color: "blue",
            label: `${t("import.imported")} (update): ${data.updated}`,
          },
        ],
        errors: (
          (data.errors ?? []) as Array<{
            row?: number;
            error?: string;
            errors?: string[];
          }>
        ).map((e) => ({
          row: e.row ?? 0,
          message: e.error ?? e.errors?.join(", ") ?? "Unknown error",
        })),
      };
    } catch (error) {
      notifications.show({
        title: t("student.importFailed"),
        message: (error as Error).message,
        color: "red",
      });
      throw error;
    }
  };

  return (
    <>
      <PageHeader
        title={t("student.list")}
        description={t("student.title")}
        actions={
          canCreate ? (
            <Group>
              <Button
                leftSection={<IconFileUpload size={18} />}
                variant="light"
                onClick={openImport}
              >
                {t("student.import")}
              </Button>
              <Button
                leftSection={<IconPlus size={18} />}
                onClick={() => router.push("/admin/students/new")}
              >
                {t("student.add")}
              </Button>
            </Group>
          ) : undefined
        }
      />
      <StudentTable />
      <ImportModal
        opened={importOpened}
        onClose={closeImport}
        title={t("student.import")}
        description={t("class.importStudentsDescription")}
        onDownloadTemplate={() =>
          downloadFileFromApi(
            "/api/v1/students/template",
            "student-import-template.xlsx",
          )
        }
        onImport={handleImport}
      />
    </>
  );
};
StudentsPage.getLayout = (page: ReactElement) => (
  <AdminLayout>{page}</AdminLayout>
);

export default StudentsPage;
