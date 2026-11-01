import { describe, expect, it } from "vitest";

import { customerOrderTotal } from "./order-totals";

describe("customerOrderTotal", () => {
  it("uses product sale prices without adding the internal delivery fee", () => {
    const order = {
      deliveryFee: 35,
      lines: [
        { salePrice: "240.00", quantity: 1 },
        { salePrice: 120, quantity: 2 },
      ],
    };

    expect(customerOrderTotal(order.lines)).toBe(480);
  });
});
