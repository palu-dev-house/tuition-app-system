import {
  Alert,
  Badge,
  Button,
  FileInput,
  Group,
  List,
  Paper,
  Stack,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertCircle,
  IconCheck,
  IconDownload,
  IconFileUpload,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";
import AdminLayout from "@/components/layouts/AdminLayout";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { useImportFeeServices } from "@/hooks/api/useFeeServices";
import type { NextPageWithLayout } from "@/lib/page-types";

interface ImportResult {
  imported: number;
  skipped: number;
  errors: Array<{ row: number; error?: string; errors?: string[] }>;
}

const ImportFeeServicesPage: NextPageWithLayout =
  function ImportFeeServicesPage() {
    const t = useTranslations();
    const [file, setFile] = useState<File | null>(null);
    const importFeeServices = useImportFeeServices();
    const [result, setResult] = useState<ImportResult | null>(null);

    const handleDownloadTemplate = () => {
      window.open("/api/v1/fee-services/template", "_blank");
    };

    const handleImport = () => {
      if (!file) return;
      importFeeServices.mutate(file, {
        onSuccess: (data) => {
          setResult(data);
          notifications.show({
            title: t("common.success"),
            message: t("import.completeMessage", {
              imported: data.imported,
              skipped: data.skipped,
            }),
            color: "green",
          });
          setFile(null);
        },
        onError: (error) => {
          notifications.show({
            title: t("common.error"),
            message: error.message,
            color: "red",
          });
        },
      });
    };

    return (
      <>
        <PageHeader
          title={t("feeService.importTitle")}
          description={t("feeService.importDescription")}
        />
        <Paper withBorder p="lg">
          <Stack gap="md">
            <Alert
              icon={<IconAlertCircle size={18} />}
              color="blue"
              variant="light"
            >
              <Text size="sm" fw={500} mb="xs">
                {t("import.instructions")}
              </Text>
              <List size="sm">
                <List.Item>{t("feeService.importStep1")}</List.Item>
                <List.Item>{t("feeService.importStep2")}</List.Item>
                <List.Item>{t("feeService.importStep3")}</List.Item>
              </List>
            </Alert>

            <Button
              leftSection={<IconDownload size={18} />}
              variant="light"
              onClick={handleDownloadTemplate}
            >
              {t("import.downloadTemplate")}
            </Button>

            <FileInput
              label={t("import.uploadFile")}
              placeholder={t("import.chooseFile")}
              accept=".xlsx,.xls"
              value={file}
              onChange={setFile}
              leftSection={<IconFileUpload size={18} />}
            />

            <Button
              onClick={handleImport}
              disabled={!file}
              loading={importFeeServices.isPending}
            >
              {t("import.process")}
            </Button>

            {result && (
              <>
                <Alert icon={<IconCheck size={18} />} color="green">
                  <Group gap="md">
                    <Badge color="green" size="lg">
                      {t("import.imported")}: {result.imported}
                    </Badge>
                    <Badge color="gray" size="lg">
                      {t("import.skipped")}: {result.skipped}
                    </Badge>
                  </Group>
                </Alert>

                {result.errors.length > 0 && (
                  <Alert icon={<IconAlertCircle size={18} />} color="red">
                    <Stack gap="xs">
                      <Text size="sm" fw={600}>
                        {t("import.rowErrors", {
                          count: result.errors.length,
                        })}
                      </Text>
                      {result.errors.slice(0, 5).map((err, index) => (
                        <Text key={index} size="sm">
                          Row {err.row}:{" "}
                          {err.error || err.errors?.join(", ") || "Unknown"}
                        </Text>
                      ))}
                      {result.errors.length > 5 && (
                        <Text size="sm" c="dimmed">
                          ...{" "}
                          {t("import.andMore", {
                            count: result.errors.length - 5,
                          })}
                        </Text>
                      )}
                    </Stack>
                  </Alert>
                )}
              </>
            )}
          </Stack>
        </Paper>
      </>
    );
  };

ImportFeeServicesPage.getLayout = (page: ReactElement) => (
  <AdminLayout>{page}</AdminLayout>
);

export default ImportFeeServicesPage;
