import { describe, expect, it } from "vitest";

import { resolveActiveHref } from "../lib/navigation";

const hrefs = [
  "/app/partner",
  "/app/partner/orders/pending",
  "/app/partner/orders",
];

describe("resolveActiveHref", () => {
  it("uses the most specific matching navigation item", () => {
    expect(resolveActiveHref("/app/partner/orders/pending", hrefs)).toBe(
      "/app/partner/orders/pending",
    );
  });

  it("keeps the orders item active on an order detail page", () => {
    expect(resolveActiveHref("/app/partner/orders/order-123", hrefs)).toBe(
      "/app/partner/orders",
    );
  });

  it("does not match a partial route segment", () => {
    expect(
      resolveActiveHref("/app/partner/orders-archive", hrefs),
    ).toBeUndefined();
  });
});
