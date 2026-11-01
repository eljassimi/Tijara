import { Link } from "@/i18n/navigation";
import { OrderLineVariant } from "@/components/orders/order-line-variant";
import { StatusPill } from "@/components/workflow-ui";
import { cleanDemoLabel } from "@/lib/display-text";
import { formatMoney } from "@/lib/money";
import { customerOrderTotal } from "@/lib/order-totals";
import { operationsCardTone } from "@/lib/operations-status";
import { statusLabel } from "@/lib/status";
import { formatAppDateTime } from "@/lib/time";

type SummaryLine = {
  id: string;
  sku: string;
  quantity: number;
  productNameFr: string;
  productNameAr: string | null;
  salePrice: { toString(): string };
  variant: { size: string | null; color: string | null };
  product: {
    images: Array<{
      url: string;
      altFr: string | null;
      altAr: string | null;
    }>;
  };
};

type OperationsOrderSummaryProps = {
  locale: "fr" | "ar";
  order: {
    id: string;
    code: string;
    customerName: string;
    phone: string;
    address: string | null;
    confirmedAt?: Date | null;
    deliveredAt?: Date | null;
    parcelCode?: string | null;
    city: { nameFr: string; nameAr: string };
    courier?: { name: string } | null;
    lines: SummaryLine[];
  };
  toneStatus: string;
  badgeStatus: string;
  meta?: string | null;
};

export function OperationsOrderSummary({
  locale,
  order,
  toneStatus,
  badgeStatus,
  meta,
}: OperationsOrderSummaryProps) {
  const total = customerOrderTotal(order.lines);

  return (
    <article className={operationsCardTone(toneStatus)}>
      <header className="operations-card__header">
        <div>
          <Link
            className="operations-card__code-link"
            href={`/admin/orders/${order.id}`}
          >
            <strong>{order.code}</strong>
            {meta ? <span>{meta}</span> : null}
          </Link>
        </div>
        <StatusPill status={badgeStatus}>
          {statusLabel(badgeStatus, locale)}
        </StatusPill>
      </header>
      <div className="operations-card__customer">
        <strong>{cleanDemoLabel(order.customerName)}</strong>
        <a href={`tel:${order.phone}`} dir="ltr">
          {order.phone}
        </a>
        <span>
          {locale === "ar" ? order.city.nameAr : order.city.nameFr}
          {order.address ? ` · ${cleanDemoLabel(order.address)}` : ""}
          {order.courier ? ` · ${order.courier.name}` : ""}
          {order.parcelCode ? ` · ${order.parcelCode}` : ""}
        </span>
      </div>
      <div className="operations-card__items">
        <ul>
          {order.lines.map((line) => {
            const image = line.product.images[0];
            return (
              <li key={line.id}>
                <OrderLineVariant
                  compact
                  locale={locale}
                  productName={
                    locale === "ar"
                      ? line.productNameAr || line.productNameFr
                      : line.productNameFr
                  }
                  sku={line.sku}
                  quantity={line.quantity}
                  size={line.variant.size}
                  color={line.variant.color}
                  imageUrl={image?.url}
                  imageAlt={
                    locale === "ar"
                      ? image?.altAr || image?.altFr
                      : image?.altFr
                  }
                />
              </li>
            );
          })}
        </ul>
        <strong>{formatMoney(total, locale)}</strong>
      </div>
      {(order.confirmedAt || order.deliveredAt) && (
        <div className="operations-card__history">
          {order.deliveredAt
            ? locale === "ar"
              ? `تم التسليم: ${formatAppDateTime(order.deliveredAt, locale)}`
              : `Livrée le ${formatAppDateTime(order.deliveredAt, locale)}`
            : order.confirmedAt
              ? locale === "ar"
                ? `تم التأكيد: ${formatAppDateTime(order.confirmedAt, locale)}`
                : `Confirmée le ${formatAppDateTime(order.confirmedAt, locale)}`
              : null}
        </div>
      )}
    </article>
  );
}
