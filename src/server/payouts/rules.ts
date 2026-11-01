import { Prisma, type PayoutStatus } from "@prisma/client";

export const payoutTransitions: Record<PayoutStatus, readonly PayoutStatus[]> =
  {
    PENDING: ["APPROVED", "REJECTED"],
    APPROVED: ["PAID", "REJECTED"],
    REJECTED: [],
    PAID: [],
  };

export class PayoutError extends Error {
  constructor(
    public readonly code:
      | "BANK_REQUIRED"
      | "INSUFFICIENT"
      | "NEGATIVE_BALANCE"
      | "OPEN_REQUEST"
      | "INVALID_TRANSITION"
      | "BANK_REFERENCE_REQUIRED"
      | "PROOF_REQUIRED",
  ) {
    super(code);
  }
}

export function assertPayoutTransition(from: PayoutStatus, to: PayoutStatus) {
  if (!payoutTransitions[from].includes(to))
    throw new PayoutError("INVALID_TRANSITION");
}

export function availableWalletBalance(
  completed: Prisma.Decimal,
  pendingDebits: Prisma.Decimal,
) {
  return completed.plus(pendingDebits);
}
