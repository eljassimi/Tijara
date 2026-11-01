import { describe, expect, it } from "vitest";

import { buildProductCode, buildVariantSku } from "./catalog-identifiers";

describe("catalog identifiers", () => {
  it("builds a readable sequential product code", () => {
    expect(buildProductCode(2026, 42)).toBe("PRD-2026-00042");
  });

  it("builds an internal SKU from the generated product code", () => {
    expect(buildVariantSku("PRD-2026-00042", "12345678-abcd")).toBe(
      "PRD-2026-00042-12345678",
    );
  });
});
