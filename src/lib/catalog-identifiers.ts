export function buildProductCode(year: number, sequence: number) {
  return `PRD-${year}-${String(sequence).padStart(5, "0")}`;
}

export function buildVariantSku(productCode: string, token: string) {
  return `${productCode}-${token.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}
