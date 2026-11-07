import type { PrismaClient } from "@prisma/client";

import { fetchOzonCities } from "./client";
import {
  cityLookupKeyFromName,
  isMetroParentCityName,
  parseOzonDistrictName,
  pickOzonDistrictCityId,
} from "./cities-helpers";
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

  // Stale Ozon ids (e.g. old generic Casablanca #97) must not stay sendable.
  await prisma.city.updateMany({
    where: {
      ozonCityId: { not: null },
      id: { notIn: importedIds },
    },
    data: { active: false, ozonCityId: null, ozonRef: null },
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

/**
 * Resolve the Ozon city id that add-parcel accepts.
 * Generic metro parents like "Casablanca" are mapped to a district using the
 * delivery address (Oulfa, Maarif, …), with Centre Ville as fallback.
 */
export async function resolveOzonCityForParcel(
  prisma: PrismaClient,
  city: {
    id: string;
    nameFr: string;
    nameAr: string;
    slug: string;
    ozonCityId: number | null;
    active: boolean;
  },
  address: string,
): Promise<{ ozonCityId: number; matchedCityId?: string }> {
  const activeCities = await prisma.city.findMany({
    where: { active: true, ozonCityId: { not: null } },
    select: {
      id: true,
      nameFr: true,
      ozonCityId: true,
    },
  });

  const districtNames = activeCities.map((entry) => entry.nameFr);
  const isParent = isMetroParentCityName(city.nameFr, districtNames);
  const parsedDistrict = parseOzonDistrictName(city.nameFr);

  if (city.active && city.ozonCityId != null && !isParent) {
    return { ozonCityId: city.ozonCityId, matchedCityId: city.id };
  }

  const parentName =
    parsedDistrict?.parent || city.nameFr || city.nameAr || city.slug;
  const candidates = activeCities
    .filter((entry) => entry.ozonCityId != null)
    .map((entry) => ({
      id: entry.id,
      nameFr: entry.nameFr,
      ozonCityId: entry.ozonCityId!,
    }));

  const pickedId = pickOzonDistrictCityId(parentName, address, candidates);
  if (pickedId != null) {
    const matched = candidates.find((entry) => entry.ozonCityId === pickedId);
    return {
      ozonCityId: pickedId,
      matchedCityId: matched?.id,
    };
  }

  if (city.ozonCityId != null && city.active) {
    return { ozonCityId: city.ozonCityId, matchedCityId: city.id };
  }

  throw new Error("city-unmapped");
}
