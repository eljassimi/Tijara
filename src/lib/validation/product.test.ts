import { describe, expect, it } from "vitest";

import { createProductSchema } from "./product";

const validProduct = {
  categoryId: "cmh0000000000000000000000",
  slug: "valid-product",
  nameFr: "Produit valide",
  descriptionFr: "Description valide",
  productPrice: 120,
  serviceFee: 20,
  salePrice: 250,
  commission: 49,
  sizes: "M, L",
  stock: 10,
};

describe("product financial validation", () => {
  it("rejects a commission greater than the sale price", () => {
    expect(
      createProductSchema.safeParse({ ...validProduct, commission: 300 })
        .success,
    ).toBe(false);
  });

  it("allows existing accounting snapshots to be saved unchanged", () => {
    expect(
      createProductSchema.safeParse({ ...validProduct, productPrice: 210 })
        .success,
    ).toBe(true);
  });

  it("accepts a product with a positive platform margin", () => {
    expect(createProductSchema.safeParse(validProduct).success).toBe(true);
  });
});
