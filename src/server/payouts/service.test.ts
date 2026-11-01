import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  assertPayoutTransition,
  availableWalletBalance,
  PayoutError,
} from "./rules";

describe("payout money rules", () => {
  it("subtracts pending reservations from the spendable balance", () => {
    expect(
      availableWalletBalance(
        new Prisma.Decimal("225.00"),
        new Prisma.Decimal("-225.00"),
      ).toString(),
    ).toBe("0");
  });

  it("does not allow a pending payout to be paid before approval", () => {
    expect(() => assertPayoutTransition("PENDING", "PAID")).toThrowError(
      PayoutError,
    );
  });

  it("allows only the documented payout path", () => {
    expect(() => assertPayoutTransition("PENDING", "APPROVED")).not.toThrow();
    expect(() => assertPayoutTransition("APPROVED", "PAID")).not.toThrow();
    expect(() => assertPayoutTransition("PAID", "APPROVED")).toThrowError(
      PayoutError,
    );
  });
});
