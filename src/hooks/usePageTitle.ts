"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

export function usePageTitle(title: string) {
  const t = useTranslations("header");
  const appName = t("title");

  useEffect(() => {
    document.title = title ? `${title} | ${appName}` : appName;
    return () => {
      document.title = appName;
    };
  }, [title, appName]);
}
