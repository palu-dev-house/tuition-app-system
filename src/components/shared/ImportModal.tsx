import {
  Alert,
  Badge,
  Button,
  FileInput,
  Group,
  List,
  Modal,
  Stack,
  Text,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconCheck,
  IconDownload,
  IconFileUpload,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useState } from "react";

export interface ImportError {
  row: number;
  message: string;
}

export interface ImportResult {
  success: number;
  skipped?: number;
  extraBadges?: Array<{ color: string; label: string }>;
  errors: ImportError[];
}

export interface ImportModalProps {
  opened: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  instructions?: ReactNode;
  onDownloadTemplate: () => void | Promise<void>;
  onImport: (file: File) => Promise<ImportResult>;
  /** Optional extra fields (e.g. a checkbox) rendered above the file picker */
  extraFields?: ReactNode;
  /** Optional custom success message builder */
  successLabel?: (result: ImportResult) => string;
}

/**
 * Shared modal for Excel imports.
 * Handles file picker, template download, loading state, and result display.
 */
export function ImportModal({
  opened,
  onClose,
  title,
  description,
  instructions,
  onDownloadTemplate,
  onImport,
  extraFields,
  successLabel,
}: ImportModalProps) {
  const t = useTranslations();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    if (!opened) {
      setFile(null);
      setResult(null);
      setIsImporting(false);
    }
  }, [opened]);

  const handleImport = async () => {
    if (!file) return;
    setIsImporting(true);
    try {
      const res = await onImport(file);
      setResult(res);
      setFile(null);
    } catch {
      // errors surfaced via mutation onError in the caller (notifications)
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={title} size="lg">
      <Stack gap="md">
        {description && (
          <Text size="sm" c="dimmed">
            {description}
          </Text>
        )}

        {instructions && (
          <Alert
            icon={<IconAlertCircle size={18} />}
            color="blue"
            variant="light"
          >
            <Text size="sm" fw={500} mb="xs">
              {t("import.instructions")}
            </Text>
            {typeof instructions === "string" ? (
              <Text size="sm">{instructions}</Text>
            ) : (
              instructions
            )}
          </Alert>
        )}

        <Button
          leftSection={<IconDownload size={18} />}
          variant="light"
          onClick={() => onDownloadTemplate()}
        >
          {t("import.downloadTemplate")}
        </Button>

        {extraFields}

        <FileInput
          label={t("import.uploadFile")}
          placeholder={t("import.chooseFile")}
          accept=".xlsx,.xls"
          value={file}
          onChange={setFile}
          leftSection={<IconFileUpload size={18} />}
        />

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t("common.close")}
          </Button>
          <Button onClick={handleImport} disabled={!file} loading={isImporting}>
            {t("import.process")}
          </Button>
        </Group>

        {result && (
          <>
            <Alert icon={<IconCheck size={18} />} color="green">
              <Group gap="md" wrap="wrap">
                <Badge color="green" size="lg">
                  {successLabel
                    ? successLabel(result)
                    : `${t("import.imported")}: ${result.success}`}
                </Badge>
                {typeof result.skipped === "number" && (
                  <Badge color="gray" size="lg">
                    {t("import.skipped")}: {result.skipped}
                  </Badge>
                )}
                {result.extraBadges?.map((b) => (
                  <Badge key={b.label} color={b.color} size="lg">
                    {b.label}
                  </Badge>
                ))}
              </Group>
            </Alert>

            {result.errors.length > 0 && (
              <Alert icon={<IconAlertCircle size={18} />} color="red">
                <Stack gap="xs">
                  <Text size="sm" fw={600}>
                    {t("import.rowErrors", { count: result.errors.length })}
                  </Text>
                  <List size="sm">
                    {result.errors.slice(0, 5).map((err) => (
                      <List.Item key={`${err.row}-${err.message}`}>
                        Row {err.row}: {err.message}
                      </List.Item>
                    ))}
                  </List>
                  {result.errors.length > 5 && (
                    <Text size="sm" c="dimmed">
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
    </Modal>
  );
}

export default ImportModal;
