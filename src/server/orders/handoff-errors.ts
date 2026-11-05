export type HandoffErrorCode =
  | "forbidden"
  | "company-required"
  | "company-inactive"
  | "not-confirmed"
  | "already-sent"
  | "order-closed"
  | "not-ready"
  | "duplicate-parcel"
  | "city-unmapped"
  | "address-required"
  | "api-failed"
  | "no-parcels";

export class HandoffError extends Error {
  readonly code: HandoffErrorCode;
  readonly detail?: string;

  constructor(code: HandoffErrorCode, detail?: string) {
    super(detail ? `${code}:${detail}` : code);
    this.name = "HandoffError";
    this.code = code;
    this.detail = detail;
  }
}

export function handoffStatusFromError(error: unknown): {
  status: string;
  ref?: string;
} {
  if (error instanceof HandoffError) {
    return {
      status: `handoff-${error.code}`,
      ref: error.detail,
    };
  }
  const message = error instanceof Error ? error.message : "";
  if (message.includes("No Courier found") || /courier/i.test(message))
    return { status: "handoff-company-inactive" };
  if (message.startsWith("Duplicate parcel code:")) {
    return {
      status: "handoff-duplicate-parcel",
      ref: message.slice("Duplicate parcel code:".length).trim(),
    };
  }
  // Ozon Express / network failures during send or BL creation.
  if (
    /ozon express/i.test(message) ||
    /delivery note/i.test(message) ||
    /tracking number/i.test(message)
  ) {
    return {
      status: "handoff-api-failed",
      ref: message.slice(0, 180),
    };
  }
  return { status: "handoff-failed" };
}
