export function cityLookupKeyFromName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Normalize common Moroccan spelling variants before district matching. */
export function normalizeAddressLookupKey(value: string) {
  return cityLookupKeyFromName(value)
    .replace(/oualfa/g, "oulfa")
    .replace(/eljadida/g, "jadida")
    .replace(/sidiothmane/g, "sidiothman")
    .replace(/sidiothman/g, "sidiothmane")
    .replace(/ainchok/g, "ainchock")
    .replace(/hayhassani/g, "hayelhassani")
    .replace(/moulayrachid/g, "moulayrachid");
}

export function parseOzonDistrictName(
  name: string,
): { parent: string; district: string } | null {
  const match = name.trim().match(/^(.+?)\s*[–—-]\s*(.+)$/u);
  if (!match) return null;
  const parent = match[1]?.trim();
  const district = match[2]?.trim();
  if (!parent || !district) return null;
  return { parent, district };
}

export type OzonDistrictCandidate = {
  ozonCityId: number;
  nameFr: string;
};

/**
 * Ozon Express no longer accepts a generic "Casablanca" city id — only
 * districts like "Casablanca – Oulfa". Pick the district from the address,
 * falling back to Centre Ville (or the first district) when nothing matches.
 */
export function pickOzonDistrictCityId(
  parentName: string,
  address: string,
  candidates: readonly OzonDistrictCandidate[],
): number | null {
  const parentKey = cityLookupKeyFromName(parentName);
  if (!parentKey) return null;

  const districts = candidates
    .map((candidate) => {
      const parsed = parseOzonDistrictName(candidate.nameFr);
      if (!parsed) return null;
      if (cityLookupKeyFromName(parsed.parent) !== parentKey) return null;
      return {
        ozonCityId: candidate.ozonCityId,
        districtKey: cityLookupKeyFromName(parsed.district),
        nameFr: candidate.nameFr,
      };
    })
    .filter(
      (
        entry,
      ): entry is {
        ozonCityId: number;
        districtKey: string;
        nameFr: string;
      } => entry != null && entry.districtKey.length > 0,
    );

  if (!districts.length) return null;

  const addressKey = normalizeAddressLookupKey(address);
  let best: { ozonCityId: number; score: number } | null = null;
  for (const district of districts) {
    if (!addressKey.includes(district.districtKey)) continue;
    const score = district.districtKey.length;
    if (!best || score > best.score) {
      best = { ozonCityId: district.ozonCityId, score };
    }
  }
  if (best) return best.ozonCityId;

  const centreVille = districts.find(
    (district) =>
      district.districtKey === "centreville" ||
      district.districtKey === "centre" ||
      district.districtKey.includes("centreville"),
  );
  return centreVille?.ozonCityId ?? districts[0]?.ozonCityId ?? null;
}

export function isMetroParentCityName(
  name: string,
  districtNames: readonly string[],
) {
  if (parseOzonDistrictName(name)) return false;
  const parentKey = cityLookupKeyFromName(name);
  if (!parentKey) return false;
  return districtNames.some((districtName) => {
    const parsed = parseOzonDistrictName(districtName);
    return parsed
      ? cityLookupKeyFromName(parsed.parent) === parentKey
      : false;
  });
}
