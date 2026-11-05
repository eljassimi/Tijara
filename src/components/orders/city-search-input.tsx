"use client";

import { CustomSelect } from "@/components/ui/custom-select";

export type CityOption = {
  id: string;
  name: string;
  value: string;
  keywords?: string;
};

export function CitySearchInput({
  listId,
  cities,
  defaultValue,
  invalid,
  locale,
  placeholder,
  searchPlaceholder,
  emptyMessage,
}: {
  listId: string;
  cities: CityOption[];
  defaultValue: string;
  invalid: boolean;
  locale: "fr" | "ar";
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
}) {
  return (
    <CustomSelect
      id={listId}
      name="city"
      locale={locale}
      label={placeholder ?? (locale === "ar" ? "المدينة" : "Ville")}
      placeholder={
        placeholder ??
        (locale === "ar" ? "اختر مدينة التوصيل" : "Choisir une ville de livraison")
      }
      searchPlaceholder={
        searchPlaceholder ??
        (locale === "ar" ? "ابحث عن مدينة…" : "Rechercher une ville…")
      }
      emptyMessage={
        emptyMessage ??
        (locale === "ar" ? "لا توجد مدينة مطابقة" : "Aucune ville correspondante")
      }
      options={cities.map((city) => ({
        value: city.value,
        label: city.name,
        keywords: city.keywords,
      }))}
      defaultValue={defaultValue}
      invalid={invalid}
      searchable
      required
    />
  );
}
