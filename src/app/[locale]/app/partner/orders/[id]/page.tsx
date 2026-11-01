import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";

import {
  FormNotice,
  StatusPill,
  WorkflowHeader,
} from "@/components/workflow-ui";
import { formatMoney } from "@/lib/money";
import { customerOrderTotal } from "@/lib/order-totals";
import { prisma } from "@/lib/prisma";
import { statusLabel } from "@/lib/status";
import { requirePermission } from "@/server/auth/session";
import { Link } from "@/i18n/navigation";
import { affiliateIdFor } from "@/server/orders/service";
import { OrderLineVariant } from "@/components/orders/order-line-variant";
import { cleanDemoLabel, productReference } from "@/lib/display-text";
import { formatAppDateTime } from "@/lib/time";

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "fr" | "ar"; id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { locale, id } = await params;
  const { created } = await searchParams;
  const user = await requirePermission(locale, "orders:view");
  const affiliateId = await affiliateIdFor(user.id, user.role);
  const [t, order] = await Promise.all([
    getTranslations("Workflow"),
    prisma.order.findFirst({
      where: { id, affiliateId },
      include: {
        city: true,
        courier: true,
        lines: {
          include: {
            variant: { select: { size: true, color: true } },
            product: {
              select: {
                images: {
                  orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
                  take: 1,
                  select: { url: true, altFr: true, altAr: true },
                },
              },
            },
          },
        },
        history: { include: { actor: true }, orderBy: { createdAt: "asc" } },
      },
    }),
  ]);
  if (!order) notFound();
  const productsTotal = customerOrderTotal(order.lines);
  const commissionTotal = order.lines.reduce(
    (sum, line) => sum.plus(line.commission.mul(line.quantity)),
    new Prisma.Decimal(0),
  );
  const commissionVoided =
    order.confirmationStatus === "CANCELLED" ||
    order.deliveryStatus === "REFUSED" ||
    order.deliveryStatus === "RETURNED";
  const canClaim = ["IN_TRANSIT", "DELIVERED", "RETURNED"].includes(
    order.deliveryStatus,
  );
  const whatsAppPhone = order.phone.replace(/^0/, "212").replace(/\D/g, "");
  const historyNote = (note: string | null) => {
    if (!note) return null;
    const translated: Record<string, string> =
      locale === "ar"
        ? {
            "Cart checkout": "طلب من السلة",
            "Order created": "تم إنشاء الطلب",
            "Commission reversal after return": "عكس العمولة بعد الإرجاع",
          }
        : {
            "Cart checkout": "Commande créée depuis le panier",
            "Order created": "Commande créée",
            "Commission reversal after return":
              "Commission annulée après retour",
          };
    return cleanDemoLabel(translated[note] ?? note);
  };
  return (
    <main>
      <WorkflowHeader
        eyebrow={productReference(order.code)}
        title={t("orderDetail")}
        body={`${cleanDemoLabel(order.customerName)} · ${order.phone}`}
        action={
          <StatusPill>
            {statusLabel(
              order.deliveryStatus === "NOT_READY"
                ? order.confirmationStatus
                : order.deliveryStatus,
              locale,
            )}
          </StatusPill>
        }
      />
      {created && (
        <FormNotice status="created" messages={{ created: t("created") }} />
      )}
      <nav className="order-contact-actions">
        <a className="button button--compact" href={`tel:${order.phone}`}>
          {locale === "ar" ? "اتصال بالزبون" : "Appeler le client"}
        </a>
        <a
          className="button button--compact"
          href={`https://wa.me/${whatsAppPhone}`}
          target="_blank"
          rel="noreferrer"
        >
          WhatsApp
        </a>
        {canClaim ? (
          <Link
            className="button button--compact"
            href={{
              pathname: "/app/partner/tickets",
              query: { order: order.id },
            }}
          >
            {locale === "ar" ? "فتح شكاية" : "Ouvrir une réclamation"}
          </Link>
        ) : null}
      </nav>
      <section className="order-facts">
        <div>
          <span>{t("city")}</span>
          <strong>
            {locale === "ar" ? order.city.nameAr : order.city.nameFr}
          </strong>
        </div>
        <div>
          <span>{locale === "ar" ? "العنوان" : "Adresse"}</span>
          <strong>
            {order.address ? cleanDemoLabel(order.address) : "—"}
          </strong>
        </div>
        <div>
          <span>{locale === "ar" ? "المجموع" : "Total client"}</span>
          <strong>{formatMoney(productsTotal, locale)}</strong>
        </div>
        <div>
          <span>{t("commission")}</span>
          <strong className={commissionVoided ? "text-danger" : undefined}>
            {commissionVoided
              ? locale === "ar"
                ? "0.00 د.م · ملغاة"
                : "0,00 MAD · annulée"
              : formatMoney(commissionTotal.toString(), locale)}
          </strong>
        </div>
        <div>
          <span>{t("courier")}</span>
          <strong>
            {order.courier
              ? `${order.courier.name}${order.parcelCode ? ` · ${order.parcelCode}` : ""}`
              : locale === "ar"
                ? "لم يتم تعيين شركة توصيل بعد"
                : "Transporteur non attribué"}
          </strong>
        </div>
      </section>
      <div className="detail-grid">
        <section className="detail-card">
          <h2>{t("product")}</h2>
          {order.lines.map((line) => {
            const image = line.product.images[0];
            return (
              <article className="line-item" key={line.id}>
                <OrderLineVariant
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
                <span>
                  {formatMoney(
                    line.salePrice.mul(line.quantity).toString(),
                    locale,
                  )}
                  <small>
                    {t("commission")}:{" "}
                    {commissionVoided
                      ? locale === "ar"
                        ? "ملغاة"
                        : "annulée"
                      : formatMoney(
                          line.commission.mul(line.quantity).toString(),
                          locale,
                        )}
                  </small>
                </span>
              </article>
            );
          })}
        </section>
        <section className="detail-card">
          <h2>{t("timeline")}</h2>
          <ol className="timeline">
            {order.history.map((item) => (
              <li key={item.id}>
                <i />
                <div>
                  <strong>{statusLabel(item.toStatus, locale)}</strong>
                  <span>
                    {statusLabel(item.statusType, locale)} ·{" "}
                    {formatAppDateTime(item.createdAt, locale)}
                  </span>
                  {historyNote(item.note) && <p>{historyNote(item.note)}</p>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
