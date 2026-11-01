import { describe, expect, it } from "vitest";

import {
  assertTransition,
  confirmationTransitions,
  deliveryTransitions,
  financeTransitions,
} from "./state-machine";

describe("order state machine", () => {
  it("allows the happy path", () => {
    expect(() =>
      assertTransition(confirmationTransitions, "NEW", "CONFIRMED"),
    ).not.toThrow();
    expect(() =>
      assertTransition(deliveryTransitions, "AWAITING_PICKUP", "IN_TRANSIT"),
    ).not.toThrow();
    expect(() =>
      assertTransition(deliveryTransitions, "AWAITING_PICKUP", "DELIVERED"),
    ).not.toThrow();
    expect(() =>
      assertTransition(financeTransitions, "INVOICED", "PAID"),
    ).not.toThrow();
  });

  it("rejects skipping finance states", () => {
    expect(() =>
      assertTransition(financeTransitions, "UNINVOICED", "PAID"),
    ).toThrow();
  });
});
