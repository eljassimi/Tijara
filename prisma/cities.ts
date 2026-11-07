import type { PrismaClient } from "@prisma/client";

import { importedCities } from "./cities-data";

function citySlug(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cityLookupKey(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

export async function syncImportedCities(prisma: PrismaClient) {
  const sourceCities = importedCities.toSorted((left, right) =>
    left.name.localeCompare(right.name, "fr", { sensitivity: "base" }),
  );
  const nameCounts = new Map<string, number>();
  for (const city of sourceCities) {
    const key = cityLookupKey(city.name);
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }

  const existingCities = await prisma.city.findMany();
  const existingBySlug = new Map(
    existingCities.map((city) => [city.slug, city]),
  );
  const existingByName = new Map(
    existingCities.map((city) => [cityLookupKey(city.nameFr), city]),
  );
  const importedIds: string[] = [];
  const consumedExistingIds = new Set<string>();

  for (const [sortOrder, source] of sourceCities.entries()) {
    const nameKey = cityLookupKey(source.name);
    const baseSlug = citySlug(source.name) || `city-${source.sourceId}`;
    const slug =
      (nameCounts.get(nameKey) ?? 0) > 1
        ? `${baseSlug}-${source.sourceId}`
        : baseSlug;
    const slugMatch = existingBySlug.get(slug);
    const nameMatch = existingByName.get(nameKey);
    const existing =
      slugMatch && !consumedExistingIds.has(slugMatch.id)
        ? slugMatch
        : nameMatch && !consumedExistingIds.has(nameMatch.id)
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
            ozonCityId: source.sourceId,
            ozonRef: source.ref,
            deliveryFee: source.deliveryFee,
            active: true,
            sortOrder,
          },
        })
      : await prisma.city.create({
          data: {
            nameFr: source.name,
            nameAr: source.name,
            slug,
            ozonCityId: source.sourceId,
            ozonRef: source.ref,
            deliveryFee: source.deliveryFee,
            active: true,
            sortOrder,
          },
        });
    importedIds.push(city.id);
    consumedExistingIds.add(city.id);
  }

  await prisma.city.updateMany({
    where: { id: { notIn: importedIds } },
    data: { active: false, ozonCityId: null, ozonRef: null },
  });

  return prisma.city.findMany({
    where: { id: { in: importedIds } },
    orderBy: [{ sortOrder: "asc" }, { nameFr: "asc" }],
  });
}
