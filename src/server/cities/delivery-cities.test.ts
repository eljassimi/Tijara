import { describe, expect, it } from "vitest";

import { cityOptionsForLocale, citySearchKeywords } from "./city-options";

describe("affiliate city options", () => {
  it("exposes Casablanca districts with searchable aliases", () => {
    const keywords = citySearchKeywords(
      "Casablanca – Oulfa",
      "Casablanca – Oulfa",
    );
    expect(keywords.toLowerCase()).toContain("casablanca");
    expect(keywords.toLowerCase()).toContain("oulfa");
    expect(keywords.toLowerCase()).toContain("oualfa");
    expect(keywords).toContain("الدار البيضاء");

    const options = cityOptionsForLocale(
      [
        {
          id: "1",
          nameFr: "Casablanca – Oulfa",
          nameAr: "Casablanca – Oulfa",
        },
        {
          id: "2",
          nameFr: "Casablanca – Maarif",
          nameAr: "Casablanca – Maarif",
        },
      ],
      "fr",
    );
    expect(options.map((option) => option.name)).toEqual([
      "Casablanca – Oulfa",
      "Casablanca – Maarif",
    ]);
    expect(options[0]?.keywords?.toLowerCase()).toContain("oualfa");
  });
});
