import { describe, expect, it } from "vitest";

import { calculateShipDate } from "./shipping-date";

const cutoffs = { weekdayCutoff: "18:00", saturdayCutoff: "15:30" };

describe("shipping cutoff", () => {
  it("ships a weekday order confirmed before cutoff on the same date", () => {
    expect(
      calculateShipDate(new Date("2026-10-26T10:00:00Z"), cutoffs)
        .toISOString()
        .slice(0, 10),
    ).toBe("2026-10-26");
  });

  it("moves late Saturday confirmation to Monday", () => {
    expect(
      calculateShipDate(new Date("2026-10-31T16:00:00Z"), cutoffs)
        .toISOString()
        .slice(0, 10),
    ).toBe("2026-11-02");
  });
});
