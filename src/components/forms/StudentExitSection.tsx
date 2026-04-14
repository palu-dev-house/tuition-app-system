"use client";

import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  Stack,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconLogout } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  useRecordStudentExit,
  useUndoStudentExit,
} from "@/hooks/api/useStudentExit";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  nis: string;
  startJoinDate: string;
  exitedAt: string | null;
  exitReason: string | null;
  exitedBy: string | null;
  onChanged: () => void;
}

export default function StudentExitSection({
  nis,
  startJoinDate,
  exitedAt,
  exitReason,
  onChanged,
}: Props) {
  const t = useTranslations("student.exit");
  const tCommon = useTranslations("common");
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [exitModalOpened, { open: openExitModal, close: closeExitModal }] =
    useDisclosure(false);
  const [undoModalOpened, { open: openUndoModal, close: closeUndoModal }] =
    useDisclosure(false);

  const [exitDate, setExitDate] = useState<Date | null>(new Date());
  const [reason, setReason] = useState("");

  const recordExit = useRecordStudentExit();
  const undoExit = useUndoStudentExit();

  const handleSubmitExit = () => {
    if (!exitDate || !reason.trim()) return;
    recordExit.mutate(
      { nis, exitDate: exitDate.toISOString(), reason: reason.trim() },
      {
        onSuccess: (data) => {
          notifications.show({
            color: "green",
            title: t("recordSuccess", { count: data.voidedCount }),
            message:
              data.partialWarnings.length > 0
                ? t("previewPartialWarning", {
                    count: data.partialWarnings.length,
                  })
                : "",
          });
          closeExitModal();
          setReason("");
          onChanged();
        },
        onError: (err) => {
          notifications.show({
            color: "red",
            title: tCommon("error"),
            message: err instanceof Error ? err.message : tCommon("error"),
          });
        },
      },
    );
  };

  const handleUndo = () => {
    undoExit.mutate(nis, {
      onSuccess: (data) => {
        notifications.show({
          color: "green",
          title: t("undoSuccess", { count: data.restoredCount }),
          message: "",
        });
        closeUndoModal();
        onChanged();
      },
      onError: (err) => {
        notifications.show({
          color: "red",
          title: tCommon("error"),
          message: err instanceof Error ? err.message : tCommon("error"),
        });
      },
    });
  };

  return (
    <Card withBorder>
      <Stack gap="md">
        <Title order={5}>{t("sectionTitle")}</Title>

        {exitedAt ? (
          <>
            <Alert icon={<IconAlertTriangle size={18} />} color="yellow">
              <Text fw={500}>
                {t("exitedBanner", {
                  date: new Date(exitedAt).toLocaleDateString(),
                  reason: exitReason ?? "-",
                })}
              </Text>
            </Alert>
            {isAdmin && (
              <Button
                variant="outline"
                onClick={openUndoModal}
                loading={undoExit.isPending}
              >
                {t("undoButton")}
              </Button>
            )}
          </>
        ) : (
          <>
            <Badge color="green" variant="light">
              {t("statusActive")}
            </Badge>
            {isAdmin && (
              <Button
                color="red"
                variant="outline"
                leftSection={<IconLogout size={18} />}
                onClick={openExitModal}
              >
                {t("markExitButton")}
              </Button>
            )}
          </>
        )}
      </Stack>

      <Modal
        opened={exitModalOpened}
        onClose={closeExitModal}
        title={t("markExitButton")}
      >
        <Stack gap="md">
          <DatePickerInput
            label={t("exitDateLabel")}
            value={exitDate}
            onChange={(v) => setExitDate(v ? new Date(v) : null)}
            minDate={new Date(startJoinDate)}
            maxDate={new Date()}
            required
          />
          <Textarea
            label={t("reasonLabel")}
            placeholder={t("reasonPlaceholder")}
            value={reason}
            onChange={(e) => setReason(e.currentTarget.value)}
            minRows={3}
            required
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={closeExitModal}>
              {tCommon("cancel")}
            </Button>
            <Button
              color="red"
              onClick={handleSubmitExit}
              loading={recordExit.isPending}
              disabled={!exitDate || !reason.trim()}
            >
              {t("confirmExitButton")}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={undoModalOpened}
        onClose={closeUndoModal}
        title={t("undoButton")}
      >
        <Stack gap="md">
          <Text>{t("undoConfirm", { count: 0 })}</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={closeUndoModal}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={handleUndo} loading={undoExit.isPending}>
              {t("undoButton")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Card>
  );
}
