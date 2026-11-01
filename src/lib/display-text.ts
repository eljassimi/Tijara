export function cleanDemoLabel(value: string) {
  return value
    .replace(/\s*[—-]\s*(?:démo|démonstration)\b.*$/i, "")
    .replace(/\s*[—-]\s*(?:تجريبي(?:ة)?|اختباري(?:ة)?)\b.*$/u, "")
    .replace(/\s+(?:de\s+)?(?:démo|démonstration)\b.*$/gi, "")
    .trim();
}

export function productDescription(value: string, locale: "fr" | "ar") {
  if (/démonstration|demo|تجريب/i.test(value))
    return locale === "ar"
      ? "منتج جاهز لعرضه على زبنائك."
      : "Un produit prêt à proposer à vos clients.";
  return value;
}

export function productReference(value: string) {
  return value.replace(/DEMO/gi, "REF");
}
