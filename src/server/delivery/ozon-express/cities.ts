import type { PrismaClient } from "@prisma/client";

import { fetchOzonCities } from "./client";
import { cityLookupKeyFromName } from "./cities-helpers";
import type { OzonCity } from "./types";

function citySlug(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const cityLookupKey = cityLookupKeyFromName;

export async function syncCitiesFromOzon(
  prisma: PrismaClient,
  origin?: string,
) {
  const sourceCities = await fetchOzonCities(origin);
  return upsertOzonCities(prisma, sourceCities);
}

export async function upsertOzonCities(
  prisma: PrismaClient,
  sourceCities: readonly OzonCity[],
) {
  const sorted = [...sourceCities].sort((left, right) =>
    left.name.localeCompare(right.name, "fr", { sensitivity: "base" }),
  );
  const nameCounts = new Map<string, number>();
  for (const city of sorted) {
    const key = cityLookupKey(city.name);
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }

  const existingCities = await prisma.city.findMany();
  const byOzonId = new Map(
    existingCities
      .filter((city) => city.ozonCityId != null)
      .map((city) => [city.ozonCityId!, city]),
  );
  const bySlug = new Map(existingCities.map((city) => [city.slug, city]));
  const byName = new Map(
    existingCities.map((city) => [cityLookupKey(city.nameFr), city]),
  );
  const importedIds: string[] = [];
  const consumed = new Set<string>();

  for (const [sortOrder, source] of sorted.entries()) {
    const nameKey = cityLookupKey(source.name);
    const baseSlug = citySlug(source.name) || `city-${source.id}`;
    const slug =
      (nameCounts.get(nameKey) ?? 0) > 1
        ? `${baseSlug}-${source.id}`
        : baseSlug;

    const ozonMatch = byOzonId.get(source.id);
    const slugMatch = bySlug.get(slug);
    const nameMatch = byName.get(nameKey);
    const existing =
      ozonMatch && !consumed.has(ozonMatch.id)
        ? ozonMatch
        : slugMatch && !consumed.has(slugMatch.id)
          ? slugMatch
          : nameMatch && !consumed.has(nameMatch.id)
            ? nameMatch
            : undefined;

    const city = existing
      ? await prisma.city.update({
          where: { id: existing.id },
          data: {
            nameFr: source.name,
            nameAr:
              existing.nameAr && existing.nameAr !== existing.nameFr
                ? existing.nameAr
                : source.name,
            slug,
            ozonCityId: source.id,
            ozonRef: source.ref,
            deliveryFee: source.deliveredPrice,
            active: true,
            sortOrder,
          },
        })
      : await prisma.city.create({
          data: {
            nameFr: source.name,
            nameAr: source.name,
            slug,
            ozonCityId: source.id,
            ozonRef: source.ref,
            deliveryFee: source.deliveredPrice,
            active: true,
            sortOrder,
          },
        });

    importedIds.push(city.id);
    consumed.add(city.id);
  }

  await prisma.city.updateMany({
    where: {
      ozonCityId: { not: null },
      id: { notIn: importedIds },
    },
    data: { active: false },
  });

  return prisma.city.findMany({
    where: { id: { in: importedIds } },
    orderBy: [{ sortOrder: "asc" }, { nameFr: "asc" }],
  });
}

export function resolveOzonCityId(city: {
  ozonCityId: number | null;
  nameFr: string;
  nameAr: string;
  slug: string;
}): number | null {
  return city.ozonCityId;
}
