import { Button, Group } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconDownload, IconFileUpload, IconPlus } from "@tabler/icons-react";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import { type ReactElement, useRef } from "react";
import AdminLayout from "@/components/layouts/AdminLayout";
import StudentTable from "@/components/tables/StudentTable";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { useImportStudents } from "@/hooks/api/useStudents";
import { usePermissions } from "@/hooks/usePermissions";
import type { NextPageWithLayout } from "@/lib/page-types";

const StudentsPage: NextPageWithLayout = function StudentsPage() {
  const router = useRouter();
  const { canCreate } = usePermissions();
  const t = useTranslations();
  const importStudents = useImportStudents();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    importStudents.mutate(file, {
      onSuccess: (data) => {
        notifications.show({
          title: t("student.importComplete"),
          message: t("student.importCompleteMessage", {
            imported: data.imported,
            updated: data.updated,
          }),
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
        title={t("student.list")}
        description={t("student.title")}
        actions={
          canCreate ? (
            <Group>
              <Button
                component="a"
                href="/api/v1/students/template"
                leftSection={<IconDownload size={18} />}
                variant="light"
              >
                {t("common.downloadTemplate")}
              </Button>
              <Button
                leftSection={<IconFileUpload size={18} />}
                variant="light"
                onClick={() => fileInputRef.current?.click()}
                loading={importStudents.isPending}
              >
                {t("student.import")}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                style={{ display: "none" }}
                onChange={handleFileChange}
              />
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
    </>
  );
};
StudentsPage.getLayout = (page: ReactElement) => (
  <AdminLayout>{page}</AdminLayout>
);

export default StudentsPage;
