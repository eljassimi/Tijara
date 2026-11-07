const DISTRICT_SEARCH_ALIASES: Record<string, string[]> = {
  oulfa: ["oualfa", "riad oualfa", "riad oulfa"],
  maarif: ["maârif"],
  "sidi moumen": ["sidimoumen"],
  "ain sebaa": ["ain sebaâ", "sebaa"],
  "ain chock": ["ain chok"],
  "centre ville": ["centreville", "centre"],
  "hay hassani": ["hay el hassani", "hassani"],
};

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Extra search terms so affiliates find districts like Casablanca – Oulfa. */
export function citySearchKeywords(nameFr: string, nameAr: string) {
  const parts = new Set<string>([nameFr, nameAr].filter(Boolean));
  const match = nameFr.trim().match(/^(.+?)\s*[–—-]\s*(.+)$/u);
  if (match) {
    const parent = match[1]?.trim();
    const district = match[2]?.trim();
    if (parent) {
      parts.add(parent);
      if (/casablanca/i.test(parent)) {
        parts.add("casa");
        parts.add("الدار البيضاء");
      }
    }
    if (district) {
      parts.add(district);
      const districtKey = normalizeKey(district);
      for (const [needle, aliases] of Object.entries(DISTRICT_SEARCH_ALIASES)) {
        if (
          districtKey === normalizeKey(needle) ||
          districtKey.includes(normalizeKey(needle))
        ) {
          for (const alias of aliases) parts.add(alias);
        }
      }
    }
  } else if (/casablanca/i.test(nameFr)) {
    parts.add("casa");
    parts.add("الدار البيضاء");
  }
  return [...parts].join(" ");
}

export function cityOptionsForLocale(
  cities: Array<{
    id: string;
    nameFr: string;
    nameAr: string;
  }>,
  locale: "fr" | "ar",
) {
  return cities.map((city) => ({
    id: city.id,
    name: locale === "ar" ? city.nameAr || city.nameFr : city.nameFr,
    value: city.id,
    keywords: citySearchKeywords(city.nameFr, city.nameAr),
  }));
}
