import { describe, expect, it } from "vitest";

import { checkoutSchema, deliveryHandoffSchema } from "./order";

const validCheckout = {
  customerName: "Client Test",
  phone: "0612345678",
  city: "Casablanca",
  address: "12 rue Exemple",
  notes: "",
};

describe("checkoutSchema order selection", () => {
  it("parses the selected cart items and their customer quantities", () => {
    const result = checkoutSchema.safeParse({
      ...validCheckout,
      orderItems: JSON.stringify([
        { itemId: "ckx1234567890123456789012", quantity: 2 },
        { itemId: "ckx2234567890123456789012", quantity: 1 },
      ]),
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.orderItems).toEqual([
        { itemId: "ckx1234567890123456789012", quantity: 2 },
        { itemId: "ckx2234567890123456789012", quantity: 1 },
      ]);
    }
  });

  it("requires at least one selected cart item", () => {
    const result = checkoutSchema.safeParse({
      ...validCheckout,
      orderItems: "[]",
    });

    expect(result.success).toBe(false);
  });

  it("rejects duplicate cart items", () => {
    const result = checkoutSchema.safeParse({
      ...validCheckout,
      orderItems: JSON.stringify([
        { itemId: "ckx1234567890123456789012", quantity: 1 },
        { itemId: "ckx1234567890123456789012", quantity: 2 },
      ]),
    });

    expect(result.success).toBe(false);
  });

  it("rejects quantities outside the supported range", () => {
    const result = checkoutSchema.safeParse({
      ...validCheckout,
      orderItems: JSON.stringify([
        { itemId: "ckx1234567890123456789012", quantity: 21 },
      ]),
    });

    expect(result.success).toBe(false);
  });
});

describe("deliveryHandoffSchema", () => {
  it("requires an order and a delivery company", () => {
    expect(
      deliveryHandoffSchema.safeParse({
        orderId: "ckx1234567890123456789012",
        courierId: "ckx2234567890123456789012",
        parcelCode: "COL-1042",
      }).success,
    ).toBe(true);
    expect(
      deliveryHandoffSchema.safeParse({
        orderId: "ckx1234567890123456789012",
        courierId: "",
      }).success,
    ).toBe(false);
  });
});
