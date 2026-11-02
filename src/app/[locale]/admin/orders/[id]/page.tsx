import { Prisma } from "@prisma/client";
import { ArrowLeft, RotateCcw, ShieldAlert } from "lucide-react";
import { notFound } from "next/navigation";

import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { CustomSelect } from "@/components/ui/custom-select";
import {
  FormNotice,
  StatusPill,
  WorkflowHeader,
} from "@/components/workflow-ui";
import { Link } from "@/i18n/navigation";
import { OrderLineVariant } from "@/components/orders/order-line-variant";
import { cleanDemoLabel, productReference } from "@/lib/display-text";
import { formatMoney } from "@/lib/money";
import { customerOrderTotal } from "@/lib/order-totals";
import { prisma } from "@/lib/prisma";
import { statusLabel } from "@/lib/status";
import { formatAppDateTime } from "@/lib/time";
import { requirePermission, sessionUserCan } from "@/server/auth/session";
import { confirmationAssignmentScope } from "@/server/orders/confirmation-assignment";
import { adminOrderDeliveryAction } from "@/server/orders/actions";
import { deliveryTransitions } from "@/server/orders/state-machine";

export default async function AdminOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "fr" | "ar"; id: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale, id } = await params;
  const { status } = await searchParams;
  const user = await requirePermission(locale, "orders:view");
  const order = await prisma.order.findFirst({
    where: { id, ...confirmationAssignmentScope(user) },
    include: {
      affiliate: { include: { user: true } },
      createdBy: true,
      city: true,
      courier: true,
      confirmationAgent: { select: { id: true, name: true } },
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
      history: {
        include: { actor: true },
        orderBy: { createdAt: "desc" },
      },
      callAttempts: {
        include: { agent: true },
        orderBy: { createdAt: "desc" },
      },
      invoiceLines: { include: { invoice: true } },
      walletTransactions: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!order) notFound();
  const canDeliver = sessionUserCan(user, "orders:deliver");
  const transitions = canDeliver
    ? deliveryTransitions[order.deliveryStatus]
    : [];
  const total = customerOrderTotal(order.lines);
  const commission = order.lines.reduce(
    (sum, line) => sum.plus(line.commission.mul(line.quantity)),
    new Prisma.Decimal(0),
  );
  const commissionVoided = ["RETURNED", "REFUSED"].includes(
    order.deliveryStatus,
  );
  const reversal = order.walletTransactions.find(
    (transaction) => transaction.type === "ADJUSTMENT",
  );

  return (
    <main>
      <Link className="back-link" href="/admin/orders">
        <ArrowLeft size={16} />
        {locale === "ar" ? "كل الطلبات" : "Toutes les commandes"}
      </Link>
      <WorkflowHeader
        eyebrow={productReference(order.code)}
        title={cleanDemoLabel(order.customerName)}
        body={`${order.phone} · ${cleanDemoLabel(order.affiliate.user.name)}`}
        action={
          <div className="order-status-stack">
            <StatusPill status={order.confirmationStatus}>
              {statusLabel(order.confirmationStatus, locale)}
            </StatusPill>
            <StatusPill status={order.deliveryStatus}>
              {statusLabel(order.deliveryStatus, locale)}
            </StatusPill>
            <StatusPill>{statusLabel(order.financeStatus, locale)}</StatusPill>
          </div>
        }
      />
      <FormNotice
        status={status}
        messages={{
          "delivery-updated":
            locale === "ar"
              ? `تم تحديث حالة الطلب ${order.code} وتطبيق أثر المخزون والعمولة.`
              : `La livraison de ${order.code} a été mise à jour avec ses effets sur le stock et la commission.`,
          "reason-required":
            locale === "ar"
              ? "اكتب سبب الإرجاع أو الرفض قبل الحفظ."
              : "Saisissez le motif du retour ou du refus avant d’enregistrer.",
          "invalid-transition":
            locale === "ar"
              ? "لا يمكن تطبيق هذه الحالة من الوضع الحالي."
              : "Cette transition n’est pas permise depuis l’état actuel.",
          invalid:
            locale === "ar"
              ? "تحقق من الحقول المطلوبة."
              : "Vérifiez les champs obligatoires.",
        }}
      />

      {transitions.length ? (
        <section className="order-action-rail" aria-label="Actions">
          <div>
            <span>
              {locale === "ar" ? "الإجراء التالي" : "Action suivante"}
            </span>
            <strong>
              {locale === "ar"
                ? "تحديث حالة التوصيل"
                : "Mettre à jour la livraison"}
            </strong>
          </div>
          <form action={adminOrderDeliveryAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="orderId" value={order.id} />
            <CustomSelect
              name="to"
              locale={locale}
              label={locale === "ar" ? "الحالة الجديدة" : "Nouvel état"}
              options={transitions.map((transition) => ({
                value: transition,
                label: statusLabel(transition, locale),
              }))}
              required
            />
            <input
              name="note"
            />
            <ConfirmSubmitButton
              locale={locale}
              className="button button--primary button--compact"
              type="submit"
              confirmTitle={
                locale === "ar" ? "تحديث التوصيل" : "Mettre à jour la livraison"
              }
              confirmMessage={
                locale === "ar"
                  ? `هل تريد حفظ الحالة الجديدة للطلب ${order.code}؟`
                  : `Enregistrer le nouvel état pour la commande ${order.code} ?`
              }
              confirmLabel={locale === "ar" ? "حفظ الحالة" : "Enregistrer"}
            >
              {locale === "ar" ? "حفظ الحالة" : "Enregistrer"}
            </ConfirmSubmitButton>
          </form>
        </section>
      ) : order.deliveryStatus === "DELIVERED" && !canDeliver ? (
        <p className="operations-warning">
          <ShieldAlert size={18} />
          {locale === "ar"
            ? "يمكن لفريق التأكيد أو المدير تسجيل الإرجاع."
            : "L’équipe de confirmation ou un administrateur peut enregistrer un retour."}
        </p>
      ) : null}

      {reversal ? (
        <p className="operations-warning operations-warning--success">
          <RotateCcw size={18} />
          {locale === "ar"
            ? `تم عكس العمولة: ${formatMoney(reversal.amount.abs().toString(), locale)}`
            : `Commission reprise : ${formatMoney(reversal.amount.abs().toString(), locale)}`}
        </p>
      ) : null}

      <section className="order-facts order-facts--admin">
        <div>
          <span>{locale === "ar" ? "الشريك" : "Affilié"}</span>
          <strong>{cleanDemoLabel(order.affiliate.user.name)}</strong>
        </div>
        <div>
          <span>{locale === "ar" ? "المدينة" : "Ville"}</span>
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
          <strong>{formatMoney(total.toString(), locale)}</strong>
        </div>
        <div>
          <span>{locale === "ar" ? "العمولة" : "Commission"}</span>
          <strong className={commissionVoided ? "text-danger" : undefined}>
            {commissionVoided
              ? locale === "ar"
                ? "ملغاة"
                : "Annulée"
              : formatMoney(commission.toString(), locale)}
          </strong>
        </div>
        <div>
          <span>
            {locale === "ar" ? "شركة التوصيل" : "Société de livraison"}
          </span>
          <strong>
            {order.courier?.name ?? "—"}
            {order.parcelCode ? ` · ${order.parcelCode}` : ""}
          </strong>
        </div>
      </section>

      <div className="detail-grid">
        <section className="detail-card">
          <h2>{locale === "ar" ? "المنتجات" : "Articles"}</h2>
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
                </span>
              </article>
            );
          })}
          {order.notes ? <p className="detail-note">{order.notes}</p> : null}
        </section>
        <section className="detail-card">
          <h2>{locale === "ar" ? "سجل الحالات" : "Historique"}</h2>
          <ol className="timeline">
            {order.history.map((item) => (
              <li key={item.id}>
                <i />
                <div>
                  <strong>{statusLabel(item.toStatus, locale)}</strong>
                  <span>
                    {statusLabel(item.statusType, locale)} ·{" "}
                    {item.actor?.name ?? "—"} ·{" "}
                    {formatAppDateTime(item.createdAt, locale)}
                  </span>
                  {item.note ? <p>{cleanDemoLabel(item.note)}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
