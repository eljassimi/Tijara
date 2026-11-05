import { describe, expect, it } from "vitest";

import { cityLookupKeyFromName } from "./cities-helpers";

// Keep a tiny pure helper testable without Prisma.
describe("ozon city lookup", () => {
  it("normalizes city names for matching", () => {
    expect(cityLookupKeyFromName("Casablanca")).toBe("casablanca");
    expect(cityLookupKeyFromName("  Agadir  ")).toBe("agadir");
    expect(cityLookupKeyFromName("Béni Mellal")).toBe("benimellal");
  });
});
