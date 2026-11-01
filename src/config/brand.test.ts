import { describe, expect, it } from "vitest";

import { brand } from "./brand";

describe("brand configuration", () => {
  it("keeps both supported locales and Moroccan commerce defaults together", () => {
    expect(brand.locales).toEqual(["fr", "ar"]);
    expect(brand.locale).toBe("fr");
    expect(brand.currency).toBe("MAD");
    expect(brand.timezone).toBe("UTC");
  });
});
