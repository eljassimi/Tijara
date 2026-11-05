import type { DeliveryStatus } from "@prisma/client";

/**
 * Maps Ozon Express parcel status codes to internal delivery statuses.
 * Unknown codes leave the local status unchanged (caller keeps current).
 */
export const ozonStatusToDelivery: Record<string, DeliveryStatus> = {
  NEW_PARCEL: "AWAITING_PICKUP",
  READY_FOR_PREPARATION: "AWAITING_PICKUP",
  IN_PREPARATION: "AWAITING_PICKUP",
  WAITING_PICKUP: "AWAITING_PICKUP",
  AWAITING_PICKUP: "AWAITING_PICKUP",
  PICKED_UP: "IN_TRANSIT",
  SENT: "IN_TRANSIT",
  RECEIVED: "IN_TRANSIT",
  DISTRIBUTION: "IN_TRANSIT",
  IN_PROGRESS: "IN_TRANSIT",
  DELIVERED: "DELIVERED",
  NOT_DELIVERED: "NOT_DELIVERED",
  REFUSED: "REFUSED",
  RETURNED: "RETURNED",
  REMBOURSED: "RETURNED",
  REIMBURSED: "RETURNED",
};

export function mapOzonStatusToDelivery(
  code: string | null | undefined,
): DeliveryStatus | null {
  if (!code) return null;
  const normalized = code.trim().toUpperCase().replace(/\s+/g, "_");
  return ozonStatusToDelivery[normalized] ?? null;
}

/** Whether the mapped status is "forward" progress vs current. */
export function isDeliveryProgress(
  from: DeliveryStatus,
  to: DeliveryStatus,
): boolean {
  const rank: Record<DeliveryStatus, number> = {
    NOT_READY: 0,
    AWAITING_PICKUP: 1,
    IN_TRANSIT: 2,
    NOT_DELIVERED: 3,
    DELIVERED: 4,
    REFUSED: 4,
    RETURNED: 4,
  };
  if (from === to) return false;
  // Allow terminal outcomes from in-transit / awaiting.
  if (["DELIVERED", "REFUSED", "RETURNED", "NOT_DELIVERED"].includes(to)) {
    return rank[from] < 4;
  }
  return rank[to] > rank[from];
}
