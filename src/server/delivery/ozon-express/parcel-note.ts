function formatOzonLineNote(line: {
  productNameFr: string;
  quantity: number;
  variant?: { size: string | null; color: string | null } | null;
}) {
  const product = line.productNameFr.trim();
  const color = line.variant?.color?.trim();
  const size = line.variant?.size?.trim();
  const attrs = [color, size].filter(Boolean).join(" / ");
  const label = [product, attrs].filter(Boolean).join(" · ");
  return `${label} ×${line.quantity}`;
}

/** Comment shown on Ozon labels: product + color/size, not internal system text. */
export function buildOzonParcelNote(
  order: {
    notes?: string | null;
    lines: Array<{
      productNameFr: string;
      quantity: number;
      variant?: { size: string | null; color: string | null } | null;
    }>;
  },
  extraNote?: string,
) {
  const variants = order.lines.map(formatOzonLineNote).filter(Boolean).join(" | ");
  const partnerNote = order.notes?.trim();
  const manual = extraNote?.trim();
  const skipManual =
    !manual ||
    /^envoi automatique/i.test(manual) ||
    /^auto[-\s]?send/i.test(manual);
  return [variants, partnerNote, skipManual ? undefined : manual]
    .filter(Boolean)
    .join(" — ")
    .slice(0, 480);
}

export function buildOzonParcelNature(
  lines: Array<{
    productNameFr: string;
    quantity: number;
    variant?: { size: string | null; color: string | null } | null;
  }>,
) {
  return lines.map(formatOzonLineNote).join(", ").slice(0, 180);
}
