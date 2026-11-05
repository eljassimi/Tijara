import { describe, expect, it } from "vitest";

import {
  isDeliveryProgress,
  mapOzonStatusToDelivery,
} from "./status-map";

describe("ozon status map", () => {
  it("maps carrier codes to internal delivery statuses", () => {
    expect(mapOzonStatusToDelivery("NEW_PARCEL")).toBe("AWAITING_PICKUP");
    expect(mapOzonStatusToDelivery("WAITING_PICKUP")).toBe("AWAITING_PICKUP");
    expect(mapOzonStatusToDelivery("PICKED_UP")).toBe("IN_TRANSIT");
    expect(mapOzonStatusToDelivery("IN_PROGRESS")).toBe("IN_TRANSIT");
    expect(mapOzonStatusToDelivery("DELIVERED")).toBe("DELIVERED");
    expect(mapOzonStatusToDelivery("REFUSED")).toBe("REFUSED");
    expect(mapOzonStatusToDelivery("RETURNED")).toBe("RETURNED");
    expect(mapOzonStatusToDelivery("REMBOURSED")).toBe("RETURNED");
  });

  it("normalizes casing and spaces", () => {
    expect(mapOzonStatusToDelivery(" picked up ")).toBe("IN_TRANSIT");
    expect(mapOzonStatusToDelivery("delivered")).toBe("DELIVERED");
  });

  it("returns null for unknown codes", () => {
    expect(mapOzonStatusToDelivery("UNKNOWN_CODE")).toBeNull();
    expect(mapOzonStatusToDelivery("")).toBeNull();
    expect(mapOzonStatusToDelivery(undefined)).toBeNull();
  });

  it("allows forward progress and terminal outcomes", () => {
    expect(isDeliveryProgress("AWAITING_PICKUP", "IN_TRANSIT")).toBe(true);
    expect(isDeliveryProgress("IN_TRANSIT", "DELIVERED")).toBe(true);
    expect(isDeliveryProgress("IN_TRANSIT", "REFUSED")).toBe(true);
    expect(isDeliveryProgress("DELIVERED", "IN_TRANSIT")).toBe(false);
    expect(isDeliveryProgress("AWAITING_PICKUP", "AWAITING_PICKUP")).toBe(
      false,
    );
  });
});
