import { describe, expect, it } from "vitest";

import { importedCities } from "../../../prisma/cities-data";

describe("imported city catalog", () => {
  it("contains the live Ozon Express delivery list with valid unique records", () => {
    expect(importedCities.length).toBeGreaterThan(700);
    expect(new Set(importedCities.map((city) => city.sourceId)).size).toBe(
      importedCities.length,
    );
    expect(
      importedCities.every(
        (city) =>
          city.name.trim() && city.deliveryFee >= 0 && city.deliveryFee <= 100,
      ),
    ).toBe(true);
    const names = new Set<string>(importedCities.map((city) => city.name));
    expect(names.has("Casablanca")).toBe(false);
    expect(names.has("Casablanca – Oulfa")).toBe(true);
    expect(names.has("Casablanca – Centre Ville")).toBe(true);
  });
});
