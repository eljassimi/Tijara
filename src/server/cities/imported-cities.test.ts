import { describe, expect, it } from "vitest";

import { importedCities } from "../../../prisma/cities-data";

describe("imported city catalog", () => {
  it("contains the complete supplied delivery list with valid unique records", () => {
    expect(importedCities).toHaveLength(630);
    expect(new Set(importedCities.map((city) => city.sourceId)).size).toBe(630);
    expect(new Set(importedCities.map((city) => city.ref)).size).toBe(630);
    expect(
      importedCities.every(
        (city) =>
          city.name.trim() && city.deliveryFee >= 20 && city.deliveryFee <= 45,
      ),
    ).toBe(true);
    expect(importedCities).toContainEqual(
      expect.objectContaining({ name: "Casablanca", deliveryFee: 20 }),
    );
  });
});
