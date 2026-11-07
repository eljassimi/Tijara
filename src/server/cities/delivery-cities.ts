import { prisma } from "@/lib/prisma";

export {
  cityOptionsForLocale,
  citySearchKeywords,
} from "./city-options";

/** Active cities for partner checkout, preferring delivery-provider mappings. */
export async function listDeliveryCitiesForCheckout() {
  const cities = await prisma.city.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { nameFr: "asc" }],
  });
  const linked = cities.filter((city) => city.ozonCityId != null);
  return linked.length ? linked : cities;
}
