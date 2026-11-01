"use client";

import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { usePathname, useRouter } from "@/i18n/navigation";

export function LocaleSwitcher({ inverse = false }: { inverse?: boolean }) {
  const locale = useLocale();
  const t = useTranslations("Common");
  const pathname = usePathname();
  const router = useRouter();
  const target = locale === "fr" ? "ar" : "fr";

  return (
    <button
      className="locale-switcher"
      data-inverse={inverse || undefined}
      type="button"
      aria-label={`${t("language")}: ${target === "fr" ? t("french") : t("arabic")}`}
      onClick={() => router.replace(pathname, { locale: target })}
    >
      <Languages aria-hidden="true" size={17} />
      <span>{target === "fr" ? t("french") : t("arabic")}</span>
    </button>
  );
}
