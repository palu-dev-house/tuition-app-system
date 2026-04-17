import {
  Alert,
  Box,
  Button,
  Center,
  Grid,
  Group,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconLock,
  IconSchool,
  IconUser,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePageTitle } from "@/hooks/usePageTitle";
import type { NextPageWithLayout } from "@/lib/page-types";

const LoginPage: NextPageWithLayout = function LoginPage() {
  const t = useTranslations();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  usePageTitle(t("auth.login"));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.loginError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Grid mih="100vh" gutter={0}>
      <Grid.Col
        span={{ base: 0, md: 5 }}
        visibleFrom="md"
        style={{
          background: "linear-gradient(135deg, #228be6 0%, #1864ab 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Stack align="center" gap="xl" p="xl">
          <ThemeIcon size={80} radius="xl" variant="white" color="blue">
            <IconSchool size={44} />
          </ThemeIcon>
          <Title order={1} c="white" ta="center">
            SkolFi
          </Title>
          <Text c="white" ta="center" maw={320} opacity={0.85} size="lg">
            {t("auth.tagline")}
          </Text>
        </Stack>
      </Grid.Col>

      <Grid.Col span={{ base: 12, md: 7 }}>
        <Center mih="100vh" p="xl">
          <Box w="100%" maw={400}>
            <Group gap="sm" mb="xs" hiddenFrom="md">
              <ThemeIcon size="lg" radius="md" color="blue">
                <IconSchool size={20} />
              </ThemeIcon>
              <Title order={3}>SkolFi</Title>
            </Group>

            <Title order={2} mb="xs">
              {t("auth.welcomeBack")}
            </Title>
            <Text c="dimmed" size="sm" mb="xl">
              {t("auth.enterCredentials")}
            </Text>

            {error && (
              <Alert
                icon={<IconAlertCircle size={16} />}
                color="red"
                mb="md"
                onClose={() => setError("")}
                withCloseButton
              >
                {error}
              </Alert>
            )}

            <form onSubmit={handleSubmit}>
              <Stack gap="md">
                <TextInput
                  label={t("auth.username")}
                  placeholder={t("auth.username")}
                  leftSection={<IconUser size={16} />}
                  value={email}
                  onChange={(e) => setEmail(e.currentTarget.value)}
                  size="md"
                  required
                />
                <PasswordInput
                  label={t("auth.password")}
                  placeholder={t("auth.enterCredentials")}
                  leftSection={<IconLock size={16} />}
                  value={password}
                  onChange={(e) => setPassword(e.currentTarget.value)}
                  size="md"
                  required
                />
                <Button type="submit" fullWidth loading={loading} size="md">
                  {t("auth.login")}
                </Button>
              </Stack>
            </form>

            <Text c="dimmed" size="xs" ta="center" mt="xl">
              {t("auth.footer")}
            </Text>
          </Box>
        </Center>
      </Grid.Col>
    </Grid>
  );
};
LoginPage.getLayout = (page: ReactElement) => <>{page}</>;

export default LoginPage;
