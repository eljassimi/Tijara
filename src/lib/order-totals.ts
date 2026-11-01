export type OrderSaleLine = {
  salePrice: number | string | { toString(): string };
  quantity: number;
};

/**
 * The product sale price is the complete amount charged to the customer.
 * City delivery fees are internal logistics costs and must not be added here.
 */
export function customerOrderTotal(lines: readonly OrderSaleLine[]) {
  return lines.reduce(
    (total, line) => total + Number(line.salePrice.toString()) * line.quantity,
    0,
  );
}
