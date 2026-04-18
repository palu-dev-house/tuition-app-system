import { Button, Group } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconDownload, IconFileUpload, IconPlus } from "@tabler/icons-react";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import { type ReactElement, useRef } from "react";
import AdminLayout from "@/components/layouts/AdminLayout";
import TuitionTable from "@/components/tables/TuitionTable";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { useImportTuitions } from "@/hooks/api/useTuitions";
import type { NextPageWithLayout } from "@/lib/page-types";

const TuitionsPage: NextPageWithLayout = function TuitionsPage() {
  const router = useRouter();
  const t = useTranslations();
  const importTuitions = useImportTuitions();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    importTuitions.mutate(file, {
      onSuccess: (data) => {
        notifications.show({
          title: t("common.success"),
          message: t("import.completeMessage", {
            imported: data.generated,
            skipped: data.skipped,
          }),
          color: "green",
        });
      },
      onError: (error) => {
        notifications.show({
          title: t("common.error"),
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
        title={t("tuition.list")}
        description={t("tuition.description")}
        actions={
          <Group gap="xs">
            <Button
              component="a"
              href="/api/v1/tuitions/template"
              leftSection={<IconDownload size={18} />}
              variant="light"
            >
              {t("common.downloadTemplate")}
            </Button>
            <Button
              leftSection={<IconFileUpload size={18} />}
              variant="light"
              onClick={() => fileInputRef.current?.click()}
              loading={importTuitions.isPending}
            >
              {t("common.import")}
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
              onClick={() => router.push("/admin/tuitions/generate")}
            >
              {t("tuition.generate")}
            </Button>
          </Group>
        }
      />

      <TuitionTable />
    </>
  );
};
TuitionsPage.getLayout = (page: ReactElement) => (
  <AdminLayout>{page}</AdminLayout>
);

export default TuitionsPage;
