import { prisma } from "@/lib/prisma";

/** Active cities for partner checkout, preferring delivery-provider mappings. */
export async function listDeliveryCitiesForCheckout() {
  const cities = await prisma.city.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { nameFr: "asc" }],
  });
  const linked = cities.filter((city) => city.ozonCityId != null);
  return linked.length ? linked : cities;
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
    keywords: `${city.nameFr} ${city.nameAr}`,
  }));
}
