import { Button, Checkbox, Group } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconDownload, IconFileUpload, IconPlus } from "@tabler/icons-react";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import { type ReactElement, useRef, useState } from "react";
import AdminLayout from "@/components/layouts/AdminLayout";
import DiscountTable from "@/components/tables/DiscountTable";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { useImportDiscounts } from "@/hooks/api/useDiscounts";
import type { NextPageWithLayout } from "@/lib/page-types";

const DiscountsPage: NextPageWithLayout = function DiscountsPage() {
  const router = useRouter();
  const t = useTranslations();
  const [applyImmediately, setApplyImmediately] = useState(false);
  const importDiscounts = useImportDiscounts();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    importDiscounts.mutate(
      { file, applyImmediately },
      {
        onSuccess: (data) => {
          const affected =
            data.tuitionsAffected > 0
              ? t("discount.importCompleteApplied", {
                  count: data.tuitionsAffected,
                })
              : "";
          notifications.show({
            title: t("discount.importComplete"),
            message: t("discount.importCompleteMessage", {
              imported: data.imported,
              affected,
            }),
            color: "green",
          });
        },
        onError: (error) => {
          notifications.show({
            title: t("discount.importFailed"),
            message: (error as Error).message,
            color: "red",
          });
        },
      },
    );
    e.currentTarget.value = "";
  };

  return (
    <>
      <PageHeader
        title={t("discount.title")}
        description={t("discount.description")}
        actions={
          <Group>
            <Checkbox
              label={t("discount.applyImmediately")}
              checked={applyImmediately}
              onChange={(e) => setApplyImmediately(e.currentTarget.checked)}
            />
            <Button
              component="a"
              href="/api/v1/discounts/template"
              leftSection={<IconDownload size={18} />}
              variant="light"
            >
              {t("common.downloadTemplate")}
            </Button>
            <Button
              leftSection={<IconFileUpload size={18} />}
              variant="light"
              onClick={() => fileInputRef.current?.click()}
              loading={importDiscounts.isPending}
            >
              {t("discount.import")}
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
              onClick={() => router.push("/admin/discounts/new")}
            >
              {t("discount.add")}
            </Button>
          </Group>
        }
      />
      <DiscountTable />
    </>
  );
};
DiscountsPage.getLayout = (page: ReactElement) => (
  <AdminLayout>{page}</AdminLayout>
);

export default DiscountsPage;
