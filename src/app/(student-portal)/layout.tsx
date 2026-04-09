"use client";

import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import {
  ActionIcon,
  AppShell,
  Avatar,
  Box,
  Button,
  Group,
  ScrollArea,
  Stack,
  Text,
  ThemeIcon,
  UnstyledButton,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import {
  IconCreditCard,
  IconHistory,
  IconHome,
  IconKey,
  IconLogout,
  IconSchool,
  IconUser,
} from "@tabler/icons-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { BottomNav } from "@/components/portal/BottomNav";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { LoadingAnimation } from "@/components/ui/LottieAnimation";
import { useStudentLogout, useStudentMe } from "@/hooks/api/useStudentAuth";

const navLinks = [
  { href: "/portal", labelKey: "nav.home", icon: IconHome, color: "blue" },
  {
    href: "/portal/payment",
    labelKey: "nav.payment",
    icon: IconCreditCard,
    color: "green",
  },
  {
    href: "/portal/history",
    labelKey: "nav.history",
    icon: IconHistory,
    color: "violet",
  },
  {
    href: "/portal/change-password",
    labelKey: "nav.changePassword",
    icon: IconKey,
    color: "orange",
  },
];

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 3)
    .join("")
    .toUpperCase();
}

function getGreetingKey(): string {
  const hour = new Date().getHours();
  if (hour < 11) return "morning";
  if (hour < 15) return "afternoon";
  if (hour < 18) return "evening";
  return "night";
}

export default function StudentPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations();
  const isLoginPage = pathname === "/portal/login";

  // Only fetch user data if not on login page
  const {
    data: userData,
    isLoading: loading,
    isError,
  } = useStudentMe({
    enabled: !isLoginPage,
  });
  const logout = useStudentLogout();

  // Redirect to login if not authenticated (except on login page)
  useEffect(() => {
    if (!isLoginPage && !loading && (isError || !userData)) {
      router.push("/portal/login");
    }
  }, [isLoginPage, loading, isError, userData, router]);

  const user = userData
    ? { studentNis: userData.nis, studentName: userData.name }
    : null;

  const handleLogout = () => {
    modals.openConfirmModal({
      title: t("common.confirm"),
      children: <Text size="sm">{t("auth.logoutConfirm")}</Text>,
      labels: {
        confirm: `${t("common.yes")}, ${t("auth.logout")}`,
        cancel: t("common.cancel"),
      },
      confirmProps: { color: "red" },
      onConfirm: () => {
        logout.mutate();
      },
    });
  };

  // Show login page without layout
  if (isLoginPage) {
    return children;
  }

  if (loading) {
    return (
      <Box
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          backgroundColor: "#f8f9fa",
        }}
      >
        <LoadingAnimation />
      </Box>
    );
  }

  return (
    <AppShell
      header={{ height: 70 }}
      navbar={{
        width: 280,
        breakpoint: "sm",
        collapsed: { mobile: true },
      }}
      padding="md"
      styles={{
        header: {
          backgroundColor: "var(--mantine-color-blue-6)",
          borderBottom: "none",
          paddingTop: "env(safe-area-inset-top)",
        },
      }}
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <ThemeIcon size={42} radius="xl" variant="white" color="blue">
              <IconSchool size={24} />
            </ThemeIcon>
            <Box visibleFrom="xs">
              <Text size="lg" fw={700} c="white">
                {t("portal.title")}
              </Text>
              <Text size="xs" c="white" opacity={0.85}>
                {t("portal.subtitle")}
              </Text>
            </Box>
          </Group>
          <Group gap="sm">
            {/* Desktop: Show greeting and name */}
            <Box visibleFrom="sm" ta="right">
              <Text size="xs" c="white" opacity={0.85}>
                {t(`portal.greeting.${getGreetingKey()}`)}
              </Text>
              <Text size="sm" fw={600} c="white">
                {user?.studentName}
              </Text>
            </Box>
            <Avatar
              radius="xl"
              size="md"
              c="white"
              variant="filled"
              styles={{ root: { backgroundColor: "rgba(255,255,255,0.2)" } }}
            >
              {user?.studentName ? (
                getInitials(user.studentName)
              ) : (
                <IconUser size={18} />
              )}
            </Avatar>
            <LanguageSwitcher />
            <ActionIcon
              variant="subtle"
              color="white"
              size="lg"
              onClick={handleLogout}
              title={t("auth.logout")}
              visibleFrom="sm"
            >
              <IconLogout size={20} />
            </ActionIcon>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar
        p="md"
        style={{ backgroundColor: "#f8f9fa" }}
        component={ScrollArea}
      >
        <Stack gap="md" style={{ flex: 1 }}>
          {/* User card on mobile */}
          <Box hiddenFrom="sm">
            <Box
              p="md"
              style={{
                backgroundColor: "var(--mantine-color-blue-6)",
                borderRadius: "var(--mantine-radius-md)",
              }}
            >
              <Group gap="sm">
                <Avatar radius="xl" size="lg" c="blue" variant="filled">
                  {user?.studentName ? (
                    getInitials(user.studentName)
                  ) : (
                    <IconUser size={20} />
                  )}
                </Avatar>
                <Box>
                  <Text size="xs" c="white" opacity={0.85}>
                    {t(`portal.greeting.${getGreetingKey()}`)}
                  </Text>
                  <Text size="sm" fw={600} c="white">
                    {user?.studentName}
                  </Text>
                  <Text size="xs" c="white" opacity={0.7}>
                    {t("portal.nis")}: {user?.studentNis}
                  </Text>
                </Box>
              </Group>
            </Box>
          </Box>

          <Text size="xs" fw={600} c="dimmed" tt="uppercase" px="xs">
            {t("nav.mainMenu")}
          </Text>

          <Stack gap="xs">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <UnstyledButton
                  key={link.href}
                  component={Link}
                  href={link.href}
                  p="sm"
                  style={{
                    borderRadius: "var(--mantine-radius-md)",
                    backgroundColor: isActive
                      ? `var(--mantine-color-${link.color}-light)`
                      : "transparent",
                    border: isActive
                      ? `1px solid var(--mantine-color-${link.color}-light)`
                      : "1px solid transparent",
                  }}
                >
                  <Group gap="sm">
                    <ThemeIcon
                      size="lg"
                      radius="md"
                      variant={isActive ? "filled" : "light"}
                      color={link.color}
                    >
                      <link.icon size={18} />
                    </ThemeIcon>
                    <Text
                      size="sm"
                      fw={isActive ? 600 : 500}
                      c={isActive ? link.color : "dark"}
                    >
                      {t(link.labelKey)}
                    </Text>
                  </Group>
                </UnstyledButton>
              );
            })}
          </Stack>

          <Box style={{ flex: 1 }} />

          {/* Logout button on mobile */}
          <Button
            variant="light"
            color="red"
            leftSection={<IconLogout size={18} />}
            onClick={handleLogout}
            hiddenFrom="sm"
          >
            {t("auth.logout")}
          </Button>
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main style={{ backgroundColor: "#f8f9fa" }}>
        <Box pb={{ base: 80, sm: 0 }}>{children}</Box>
      </AppShell.Main>
      <BottomNav />
    </AppShell>
  );
}
