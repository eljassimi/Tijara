import type {
  ConfirmationStatus,
  DeliveryStatus,
  FinanceStatus,
} from "@prisma/client";

export const confirmationTransitions: Record<
  ConfirmationStatus,
  readonly ConfirmationStatus[]
> = {
  NEW: [
    "CALLING",
    "BUSY",
    "NO_ANSWER",
    "CALL_BACK_LATER",
    "CONFIRMED",
    "CANCELLED",
    "UNREACHABLE",
  ],
  CALLING: [
    "BUSY",
    "NO_ANSWER",
    "CALL_BACK_LATER",
    "CONFIRMED",
    "CANCELLED",
    "UNREACHABLE",
  ],
  BUSY: [
    "CALLING",
    "NO_ANSWER",
    "CALL_BACK_LATER",
    "CONFIRMED",
    "CANCELLED",
    "UNREACHABLE",
  ],
  NO_ANSWER: [
    "CALLING",
    "BUSY",
    "CALL_BACK_LATER",
    "CONFIRMED",
    "CANCELLED",
    "UNREACHABLE",
  ],
  CALL_BACK_LATER: [
    "CALLING",
    "BUSY",
    "NO_ANSWER",
    "CONFIRMED",
    "CANCELLED",
    "UNREACHABLE",
  ],
  CONFIRMED: [],
  CANCELLED: [],
  UNREACHABLE: [],
};

export const deliveryTransitions: Record<
  DeliveryStatus,
  readonly DeliveryStatus[]
> = {
  NOT_READY: ["AWAITING_PICKUP"],
  AWAITING_PICKUP: [
    "IN_TRANSIT",
    "DELIVERED",
    "NOT_DELIVERED",
    "REFUSED",
    "RETURNED",
  ],
  IN_TRANSIT: ["DELIVERED", "NOT_DELIVERED", "REFUSED", "RETURNED"],
  NOT_DELIVERED: ["IN_TRANSIT", "REFUSED", "RETURNED"],
  DELIVERED: ["RETURNED"],
  REFUSED: [],
  RETURNED: [],
};

export const financeTransitions: Record<
  FinanceStatus,
  readonly FinanceStatus[]
> = {
  NOT_READY: ["UNINVOICED"],
  UNINVOICED: ["INVOICED"],
  INVOICED: ["PAID"],
  PAID: [],
};

export function assertTransition<T extends string>(
  map: Record<T, readonly T[]>,
  from: T,
  to: T,
) {
  if (!map[from].includes(to))
    throw new Error(`Invalid transition: ${from} -> ${to}`);
}
