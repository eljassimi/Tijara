export type OrderCreationStatus =
  | "duplicate"
  | "empty-cart"
  | "invalid-price"
  | "unknown-city"
  | "unavailable"
  | "failed";

export function orderCreationStatus(error: unknown): OrderCreationStatus {
  const message = error instanceof Error ? error.message : "";

  if (message.startsWith("Duplicate:")) return "duplicate";
  if (message === "Empty cart") return "empty-cart";
  if (message.startsWith("InvalidPrice:")) return "invalid-price";
  if (message.startsWith("UnknownCity:")) return "unknown-city";
  if (
    message.startsWith("Unavailable:") ||
    message === "Product is unavailable"
  ) {
    return "unavailable";
  }

  return "failed";
}
