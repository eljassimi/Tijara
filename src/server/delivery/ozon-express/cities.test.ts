import { describe, expect, it } from "vitest";

import {
  cityLookupKeyFromName,
  isMetroParentCityName,
  normalizeAddressLookupKey,
  parseOzonDistrictName,
  pickOzonDistrictCityId,
} from "./cities-helpers";

const casablancaDistricts = [
  { ozonCityId: 2174, nameFr: "Casablanca – Centre Ville" },
  { ozonCityId: 2177, nameFr: "Casablanca – Oulfa" },
  { ozonCityId: 2179, nameFr: "Casablanca – Maarif" },
  { ozonCityId: 2186, nameFr: "Casablanca – Sidi Moumen" },
];

describe("ozon city lookup", () => {
  it("normalizes city names for matching", () => {
    expect(cityLookupKeyFromName("Casablanca")).toBe("casablanca");
    expect(cityLookupKeyFromName("  Agadir  ")).toBe("agadir");
    expect(cityLookupKeyFromName("Béni Mellal")).toBe("benimellal");
  });

  it("parses Ozon district city names", () => {
    expect(parseOzonDistrictName("Casablanca – Oulfa")).toEqual({
      parent: "Casablanca",
      district: "Oulfa",
    });
    expect(parseOzonDistrictName("Casablanca")).toBeNull();
  });

  it("detects metro parents that were split into districts", () => {
    expect(
      isMetroParentCityName(
        "Casablanca",
        casablancaDistricts.map((city) => city.nameFr),
      ),
    ).toBe(true);
    expect(
      isMetroParentCityName(
        "Casablanca – Oulfa",
        casablancaDistricts.map((city) => city.nameFr),
      ),
    ).toBe(false);
    expect(
      isMetroParentCityName(
        "Safi",
        casablancaDistricts.map((city) => city.nameFr),
      ),
    ).toBe(false);
  });

  it("maps Casablanca addresses to the Oulfa district", () => {
    expect(normalizeAddressLookupKey("riad oualfa")).toContain("oulfa");
    expect(
      pickOzonDistrictCityId(
        "Casablanca",
        "riad oualfa",
        casablancaDistricts,
      ),
    ).toBe(2177);
  });

  it("falls back to Centre Ville when no district is in the address", () => {
    expect(
      pickOzonDistrictCityId(
        "Casablanca",
        "appartement 12 rue x",
        casablancaDistricts,
      ),
    ).toBe(2174);
  });
});
