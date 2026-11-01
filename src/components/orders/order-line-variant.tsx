import { Package } from "lucide-react";

import { cleanDemoLabel } from "@/lib/display-text";

type OrderLineVariantProps = {
  locale: "fr" | "ar";
  productName: string;
  sku: string;
  quantity: number;
  size?: string | null;
  color?: string | null;
  imageUrl?: string | null;
  imageAlt?: string | null;
  compact?: boolean;
};

function variantLabels(locale: "fr" | "ar") {
  return locale === "ar"
    ? { color: "اللون", size: "المقاس", quantity: "الكمية", sku: "المرجع" }
    : { color: "Couleur", size: "Taille", quantity: "Qté", sku: "SKU" };
}

export function OrderLineVariant({
  locale,
  productName,
  sku,
  quantity,
  size,
  color,
  imageUrl,
  imageAlt,
  compact = false,
}: OrderLineVariantProps) {
  const labels = variantLabels(locale);
  const name = cleanDemoLabel(productName);
  const colorLabel = color?.trim() || null;
  const sizeLabel = size?.trim() || null;
  const alt = cleanDemoLabel(imageAlt?.trim() || name);

  const thumb = (
    <span
      className="order-line-variant__thumb"
      aria-hidden={imageUrl ? undefined : true}
    >
      {imageUrl ? (
        // Product media is served from local/S3 URLs configured at runtime.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={alt} loading="lazy" />
      ) : (
        <Package size={18} strokeWidth={1.75} />
      )}
    </span>
  );

  if (compact) {
    const parts = [colorLabel, sizeLabel, `×${quantity}`].filter(Boolean);
    return (
      <div className="order-line-variant order-line-variant--compact order-line-variant--with-thumb">
        {thumb}
        <span className="order-line-variant__copy">
          <strong className="order-line-variant__name">{name}</strong>
          {parts.length ? (
            <span className="order-line-variant__compact-meta">
              {parts.join(" · ")}
            </span>
          ) : null}
        </span>
      </div>
    );
  }

  return (
    <div className="order-line-variant order-line-variant--with-thumb">
      {thumb}
      <div className="order-line-variant__copy">
        <strong className="order-line-variant__name">{name}</strong>
        <dl className="order-line-variant__attrs">
          {colorLabel ? (
            <div>
              <dt>{labels.color}</dt>
              <dd>{colorLabel}</dd>
            </div>
          ) : null}
          {sizeLabel ? (
            <div>
              <dt>{labels.size}</dt>
              <dd>{sizeLabel}</dd>
            </div>
          ) : null}
          <div>
            <dt>{labels.quantity}</dt>
            <dd>×{quantity}</dd>
          </div>
        </dl>
        <small className="order-line-variant__sku">
          {labels.sku} · {sku}
        </small>
      </div>
    </div>
  );
}
