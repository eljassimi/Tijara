import type { Locale } from "@/config/brand";

export function formatMoney(value: number | string, locale: Locale) {
  const amount = typeof value === "string" ? Number(value) : value;
  if (locale === "ar")
    return `${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)} د.م.`;
  return `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)} MAD`;
}
