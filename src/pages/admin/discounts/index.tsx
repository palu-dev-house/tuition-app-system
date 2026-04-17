import { Button, Checkbox, Group } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconFileUpload, IconPlus } from "@tabler/icons-react";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import { type ReactElement, useState } from "react";
import AdminLayout from "@/components/layouts/AdminLayout";
import ImportModal, {
  type ImportResult,
} from "@/components/shared/ImportModal";
import DiscountTable from "@/components/tables/DiscountTable";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { useImportDiscounts } from "@/hooks/api/useDiscounts";
import { downloadFileFromApi } from "@/lib/download";
import type { NextPageWithLayout } from "@/lib/page-types";

const DiscountsPage: NextPageWithLayout = function DiscountsPage() {
  const router = useRouter();
  const t = useTranslations();
  const [importOpened, { open: openImport, close: closeImport }] =
    useDisclosure(false);
  const [applyImmediately, setApplyImmediately] = useState(false);
  const importDiscounts = useImportDiscounts();

  const handleImport = async (file: File): Promise<ImportResult> => {
    try {
      const data = await importDiscounts.mutateAsync({
        file,
        applyImmediately,
      });
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
      return {
        success: data.imported,
        skipped: data.skipped,
        extraBadges:
          data.tuitionsAffected > 0
            ? [
                {
                  color: "blue",
                  label: t("discount.tuitionsAffected", {
                    count: data.tuitionsAffected,
                  }),
                },
              ]
            : undefined,
        errors: (data.errors ?? []).map(
          (e: { row: number; error?: string; errors?: string[] }) => ({
            row: e.row,
            message: e.error ?? e.errors?.join(", ") ?? "Unknown error",
          }),
        ),
      };
    } catch (error) {
      notifications.show({
        title: t("discount.importFailed"),
        message: (error as Error).message,
        color: "red",
      });
      throw error;
    }
  };

  return (
    <>
      <PageHeader
        title={t("discount.title")}
        description={t("discount.description")}
        actions={
          <Group>
            <Button
              leftSection={<IconFileUpload size={18} />}
              variant="light"
              onClick={openImport}
            >
              {t("discount.import")}
            </Button>
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
      <ImportModal
        opened={importOpened}
        onClose={closeImport}
        title={t("discount.importTitle")}
        description={t("discount.importPageDescription")}
        onDownloadTemplate={() =>
          downloadFileFromApi(
            "/api/v1/discounts/template",
            "discount-import-template.xlsx",
          )
        }
        onImport={handleImport}
        extraFields={
          <Checkbox
            label={t("discount.applyImmediately")}
            description={t("discount.applyImmediatelyDesc")}
            checked={applyImmediately}
            onChange={(e) => setApplyImmediately(e.currentTarget.checked)}
          />
        }
      />
    </>
  );
};
DiscountsPage.getLayout = (page: ReactElement) => (
  <AdminLayout>{page}</AdminLayout>
);

export default DiscountsPage;
