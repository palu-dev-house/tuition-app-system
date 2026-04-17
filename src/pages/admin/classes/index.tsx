import { Button, Group, Menu } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconChevronDown,
  IconFileUpload,
  IconPlus,
  IconUsers,
} from "@tabler/icons-react";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import AdminLayout from "@/components/layouts/AdminLayout";
import ImportModal, {
  type ImportResult,
} from "@/components/shared/ImportModal";
import ClassAcademicTable from "@/components/tables/ClassAcademicTable";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { useImportClassAcademics } from "@/hooks/api/useClassAcademics";
import { downloadFileFromApi } from "@/lib/download";
import type { NextPageWithLayout } from "@/lib/page-types";

const ClassesPage: NextPageWithLayout = function ClassesPage() {
  const router = useRouter();
  const t = useTranslations();
  const [importOpened, { open: openImport, close: closeImport }] =
    useDisclosure(false);
  const importClasses = useImportClassAcademics();

  const handleImport = async (file: File): Promise<ImportResult> => {
    try {
      const data = await importClasses.mutateAsync(file);
      notifications.show({
        title: t("student.importComplete"),
        message: t("class.importClassesSuccess", { count: data.imported }),
        color: "green",
      });
      return {
        success: data.imported,
        errors: (data.errors ?? []).map((e) => ({
          row: e.row,
          message: e.error,
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
        title={t("class.list")}
        description={t("class.description")}
        actions={
          <Group>
            <Menu shadow="md" width={220}>
              <Menu.Target>
                <Button
                  leftSection={<IconFileUpload size={18} />}
                  variant="light"
                  rightSection={<IconChevronDown size={14} />}
                >
                  {t("common.import")}
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<IconFileUpload size={16} />}
                  onClick={openImport}
                >
                  {t("class.importClasses")}
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconUsers size={16} />}
                  onClick={() => router.push("/admin/classes/students/import")}
                >
                  {t("class.importStudentAssignments")}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
            <Button
              leftSection={<IconPlus size={18} />}
              onClick={() => router.push("/admin/classes/new")}
            >
              {t("class.add")}
            </Button>
          </Group>
        }
      />
      <ClassAcademicTable />
      <ImportModal
        opened={importOpened}
        onClose={closeImport}
        title={t("class.importClasses")}
        description={t("class.importClassesDescription")}
        onDownloadTemplate={() =>
          downloadFileFromApi(
            "/api/v1/class-academics/template",
            "class-import-template.xlsx",
          )
        }
        onImport={handleImport}
      />
    </>
  );
};
ClassesPage.getLayout = (page: ReactElement) => (
  <AdminLayout>{page}</AdminLayout>
);

export default ClassesPage;
