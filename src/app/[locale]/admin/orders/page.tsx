import { ArrowUpRight, RotateCcw, Search } from "lucide-react";
import { Prisma } from "@prisma/client";

import { CustomSelect } from "@/components/ui/custom-select";
import { StatusPill, WorkflowHeader } from "@/components/workflow-ui";
import { Link } from "@/i18n/navigation";
import { cleanDemoLabel, productReference } from "@/lib/display-text";
import { formatMoney } from "@/lib/money";
import { customerOrderTotal } from "@/lib/order-totals";
import { prisma } from "@/lib/prisma";
import { statusLabel } from "@/lib/status";
import { formatAppDate } from "@/lib/time";
import { requirePermission } from "@/server/auth/session";
import { confirmationAssignmentScope } from "@/server/orders/confirmation-assignment";

const confirmationStatuses = [
  "NEW",
  "CALLING",
  "BUSY",
  "NO_ANSWER",
  "CALL_BACK_LATER",
  "CONFIRMED",
  "CANCELLED",
  "UNREACHABLE",
] as const;
const deliveryStatuses = [
  "NOT_READY",
  "AWAITING_PICKUP",
  "IN_TRANSIT",
  "DELIVERED",
  "NOT_DELIVERED",
  "REFUSED",
  "RETURNED",
] as const;
const financeStatuses = [
  "NOT_READY",
  "UNINVOICED",
  "INVOICED",
  "PAID",
] as const;

type SearchParams = {
  q?: string;
  confirmation?: string;
  delivery?: string;
  finance?: string;
  page?: string;
};

export default async function AdminOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "fr" | "ar" }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const user = await requirePermission(locale, "orders:view");
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const take = 25;
  const where: Prisma.OrderWhereInput = confirmationAssignmentScope(user);
  if (query.q?.trim()) {
    const q = query.q.trim();
    where.OR = [
      { code: { contains: q } },
      { phone: { contains: q } },
      { customerName: { contains: q } },
      { parcelCode: { contains: q } },
      { affiliate: { user: { name: { contains: q } } } },
    ];
  }
  if (confirmationStatuses.includes(query.confirmation as never))
    where.confirmationStatus =
      query.confirmation as (typeof confirmationStatuses)[number];
  if (deliveryStatuses.includes(query.delivery as never))
    where.deliveryStatus = query.delivery as (typeof deliveryStatuses)[number];
  if (financeStatuses.includes(query.finance as never))
    where.financeStatus = query.finance as (typeof financeStatuses)[number];

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        affiliate: { include: { user: true } },
        city: true,
        courier: true,
        lines: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * take,
      take,
    }),
    prisma.order.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / take));
  const pageHref = (nextPage: number) => ({
    pathname: "/admin/orders" as const,
    query: { ...query, page: String(nextPage) },
  });
  const confirmationOptions = confirmationStatuses.map((status) => ({
    value: status,
    label: statusLabel(status, locale),
  }));
  const deliveryOptions = deliveryStatuses.map((status) => ({
    value: status,
    label: statusLabel(status, locale),
  }));
  const financeOptions = financeStatuses.map((status) => ({
    value: status,
    label: statusLabel(status, locale),
  }));

  return (
    <main>
      <WorkflowHeader
        eyebrow=""
        title={locale === "ar" ? "كل الطلبات" : "Toutes les commandes"}
        body={
          locale === "ar"
            ? "ابحث في كامل سجل الطلبات، بما فيها الطلبات المسلّمة والمرتجعة."
            : "Recherchez tout l’historique, y compris les commandes livrées et retournées."
        }
      />

      <form className="filter-bar admin-orders-filter" method="get">
        <label>
          <span>{locale === "ar" ? "بحث" : "Recherche"}</span>
          <input
            name="q"
            defaultValue={query.q}
          />
        </label>
        <label>
          <span>{locale === "ar" ? "التأكيد" : "Confirmation"}</span>
          <CustomSelect
            name="confirmation"
            locale={locale}
            label={locale === "ar" ? "حالة التأكيد" : "État de confirmation"}
            defaultValue={query.confirmation}
            options={confirmationOptions}
          />
        </label>
        <label>
          <span>{locale === "ar" ? "التوصيل" : "Livraison"}</span>
          <CustomSelect
            name="delivery"
            locale={locale}
            label={locale === "ar" ? "حالة التوصيل" : "État de livraison"}
            defaultValue={query.delivery}
            options={deliveryOptions}
          />
        </label>
        <label>
          <span>{locale === "ar" ? "المالية" : "Finance"}</span>
          <CustomSelect
            name="finance"
            locale={locale}
            label={locale === "ar" ? "الحالة المالية" : "État financier"}
            defaultValue={query.finance}
            options={financeOptions}
          />
        </label>
        <button
          className="button button--primary button--compact"
          type="submit"
        >
          <Search size={16} />
          {locale === "ar" ? "تطبيق" : "Appliquer"}
        </button>
      </form>

      {orders.length ? (
        <section className="workflow-table-card">
          <div className="workflow-table workflow-table--admin-orders">
            <div className="workflow-table__row workflow-table__head">
              <span>{locale === "ar" ? "الطلب" : "Commande"}</span>
              <span>{locale === "ar" ? "الزبون" : "Client"}</span>
              <span>{locale === "ar" ? "الشريك" : "Affilié"}</span>
              <span>{locale === "ar" ? "المجموع" : "Total"}</span>
              <span>{locale === "ar" ? "التأكيد" : "Confirmation"}</span>
              <span>{locale === "ar" ? "التوصيل" : "Livraison"}</span>
              <span />
            </div>
            {orders.map((order) => (
              <div className="workflow-table__row" key={order.id}>
                <strong>
                  <Link href={`/admin/orders/${order.id}`}>
                    {productReference(order.code)}
                  </Link>
                  <small>
                    {formatAppDate(order.createdAt, locale, {
                      dateStyle: "medium",
                    })}
                  </small>
                </strong>
                <span>
                  {cleanDemoLabel(order.customerName)}
                  <small dir="ltr">{order.phone}</small>
                </span>
                <span>{cleanDemoLabel(order.affiliate.user.name)}</span>
                <span>
                  {formatMoney(customerOrderTotal(order.lines), locale)}
                </span>
                <StatusPill status={order.confirmationStatus}>
                  {statusLabel(order.confirmationStatus, locale)}
                </StatusPill>
                <StatusPill status={order.deliveryStatus}>
                  {statusLabel(order.deliveryStatus, locale)}
                </StatusPill>
                <Link
                  className="row-link"
                  href={`/admin/orders/${order.id}`}
                  aria-label={order.code}
                >
                  <ArrowUpRight size={17} />
                </Link>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <div className="queue-empty">
          <p>
            {locale === "ar"
              ? "لا توجد طلبات مطابقة لهذه الفلاتر."
              : "Aucune commande ne correspond à ces filtres."}
          </p>
          <Link className="button button--compact" href="/admin/orders">
            <RotateCcw size={15} />
            {locale === "ar" ? "إعادة الضبط" : "Réinitialiser"}
          </Link>
        </div>
      )}

      {pages > 1 && (
        <nav className="pagination" aria-label="Pagination">
          <Link
            className={`button button--compact ${page <= 1 ? "is-disabled" : ""}`}
            href={pageHref(Math.max(1, page - 1))}
          >
            {locale === "ar" ? "السابق" : "Précédent"}
          </Link>
          <span>
            {page} / {pages} · {total}
          </span>
          <Link
            className={`button button--compact ${page >= pages ? "is-disabled" : ""}`}
            href={pageHref(Math.min(pages, page + 1))}
          >
            {locale === "ar" ? "التالي" : "Suivant"}
          </Link>
        </nav>
      )}
    </main>
  );
}
