import { Button, Group } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconDownload, IconFileUpload, IconPlus } from "@tabler/icons-react";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import { type ReactElement, useRef } from "react";
import AdminLayout from "@/components/layouts/AdminLayout";
import ScholarshipTable from "@/components/tables/ScholarshipTable";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { useImportScholarships } from "@/hooks/api/useScholarships";
import type { NextPageWithLayout } from "@/lib/page-types";

const ScholarshipsPage: NextPageWithLayout = function ScholarshipsPage() {
  const router = useRouter();
  const t = useTranslations();
  const importScholarships = useImportScholarships();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    importScholarships.mutate(file, {
      onSuccess: (data) => {
        notifications.show({
          title: t("scholarship.importComplete"),
          message: t("scholarship.importCompleteMessage", {
            imported: data.imported,
            autoPayments: data.autoPayments,
          }),
          color: "green",
        });
      },
      onError: (error) => {
        notifications.show({
          title: t("scholarship.importFailed"),
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
        title={t("scholarship.title")}
        description={t("scholarship.description")}
        actions={
          <Group>
            <Button
              component="a"
              href="/api/v1/scholarships/template"
              leftSection={<IconDownload size={18} />}
              variant="light"
            >
              {t("common.downloadTemplate")}
            </Button>
            <Button
              leftSection={<IconFileUpload size={18} />}
              variant="light"
              onClick={() => fileInputRef.current?.click()}
              loading={importScholarships.isPending}
            >
              {t("scholarship.import")}
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
              onClick={() => router.push("/admin/scholarships/new")}
            >
              {t("scholarship.add")}
            </Button>
          </Group>
        }
      />
      <ScholarshipTable />
    </>
  );
};
ScholarshipsPage.getLayout = (page: ReactElement) => (
  <AdminLayout>{page}</AdminLayout>
);

export default ScholarshipsPage;
