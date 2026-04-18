import { Button, Group, Menu } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconChevronDown,
  IconDownload,
  IconFileUpload,
  IconPlus,
  IconUsers,
} from "@tabler/icons-react";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import { type ReactElement, useRef } from "react";
import AdminLayout from "@/components/layouts/AdminLayout";
import ClassAcademicTable from "@/components/tables/ClassAcademicTable";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { useImportClassAcademics } from "@/hooks/api/useClassAcademics";
import type { NextPageWithLayout } from "@/lib/page-types";

const ClassesPage: NextPageWithLayout = function ClassesPage() {
  const router = useRouter();
  const t = useTranslations();
  const importClasses = useImportClassAcademics();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    importClasses.mutate(file, {
      onSuccess: (data) => {
        notifications.show({
          title: t("student.importComplete"),
          message: t("class.importClassesSuccess", { count: data.imported }),
          color: "green",
        });
      },
      onError: (error) => {
        notifications.show({
          title: t("student.importFailed"),
          message: (error as Error).message,
          color: "red",
        });
      },
    });
    e.currentTarget.value = "";
  };

  return (
    <>
      <PageHeader
        title={t("class.list")}
        description={t("class.description")}
        actions={
          <Group>
            <Button
              component="a"
              href="/api/v1/class-academics/template"
              leftSection={<IconDownload size={18} />}
              variant="light"
            >
              {t("common.downloadTemplate")}
            </Button>
            <Menu shadow="md" width={220}>
              <Menu.Target>
                <Button
                  leftSection={<IconFileUpload size={18} />}
                  variant="light"
                  rightSection={<IconChevronDown size={14} />}
                  loading={importClasses.isPending}
                >
                  {t("common.import")}
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<IconFileUpload size={16} />}
                  onClick={() => fileInputRef.current?.click()}
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
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
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
    </>
  );
};
ClassesPage.getLayout = (page: ReactElement) => (
  <AdminLayout>{page}</AdminLayout>
);

export default ClassesPage;
