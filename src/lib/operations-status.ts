const confirmationTones = [
  "NEW",
  "CALLING",
  "BUSY",
  "NO_ANSWER",
  "CALL_BACK_LATER",
  "CONFIRMED",
  "CANCELLED",
  "UNREACHABLE",
] as const;

const deliveryTones = [
  "NOT_READY",
  "AWAITING_PICKUP",
  "IN_TRANSIT",
  "DELIVERED",
  "NOT_DELIVERED",
  "REFUSED",
  "RETURNED",
  "NOT_SENT",
  "FAILED",
  "SENT_MANUALLY",
  "SYNCED",
] as const;

const knownTones = new Set<string>([...confirmationTones, ...deliveryTones]);

export function operationsCardTone(status: string) {
  if (!knownTones.has(status)) return "operations-card";
  return `operations-card operations-card--${status}`;
}

export const confirmationFilterStatuses = [
  "NEW",
  "CALLING",
  "BUSY",
  "NO_ANSWER",
  "CALL_BACK_LATER",
  "CONFIRMED",
  "CANCELLED",
] as const;

export const logisticsFilterStatuses = [
  "NOT_SENT",
  "FAILED",
  "AWAITING_PICKUP",
  "IN_TRANSIT",
  "NOT_DELIVERED",
  "DELIVERED",
  "REFUSED",
  "RETURNED",
] as const;

export const orderLineInclude = {
  variant: { select: { size: true as const, color: true as const } },
  product: {
    select: {
      images: {
        orderBy: [
          { sortOrder: "asc" as const },
          { createdAt: "asc" as const },
        ],
        take: 1,
        select: {
          url: true as const,
          altFr: true as const,
          altAr: true as const,
        },
      },
    },
  },
};
