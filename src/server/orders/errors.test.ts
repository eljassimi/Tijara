import { describe, expect, it } from "vitest";

import { orderCreationStatus } from "./errors";

describe("order creation error status", () => {
  it.each([
    [new Error("Duplicate:TJ-2026-0000001"), "duplicate"],
    [new Error("Empty cart"), "empty-cart"],
    [new Error("InvalidPrice:SKU-1"), "invalid-price"],
    [new Error("UnknownCity:Agadir"), "unknown-city"],
    [new Error("Unavailable:SKU-1"), "unavailable"],
    [new Error("Product is unavailable"), "unavailable"],
    [new Error("Database unavailable"), "failed"],
  ])("maps %s to %s", (error, status) => {
    expect(orderCreationStatus(error)).toBe(status);
  });
});
