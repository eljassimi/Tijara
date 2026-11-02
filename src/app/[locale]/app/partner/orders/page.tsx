import {
  ArrowUpRight,
  Download,
  FileSpreadsheet,
  Plus,
  RotateCcw,
} from "lucide-react";
import { Prisma } from "@prisma/client";
import { getTranslations } from "next-intl/server";

import { StatusPill, WorkflowHeader } from "@/components/workflow-ui";
import { Link } from "@/i18n/navigation";
import { formatMoney } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { statusLabel } from "@/lib/status";
import { requirePermission, sessionUserCan } from "@/server/auth/session";
import { affiliateIdFor } from "@/server/orders/service";
import { cleanDemoLabel, productReference } from "@/lib/display-text";

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

export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "fr" | "ar" }>;
  searchParams: Promise<{
    q?: string;
    confirmation?: string;
    delivery?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const user = await requirePermission(locale, "orders:view");
  const affiliateId = await affiliateIdFor(user.id, user.role);
  const canCreate = sessionUserCan(user, "orders:create");
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const take = 20;
  const where: Prisma.OrderWhereInput = { affiliateId };
  if (query.q?.trim())
    where.OR = [
      { code: { contains: query.q.trim() } },
      { phone: { contains: query.q.trim() } },
      { customerName: { contains: query.q.trim() } },
    ];
  if (
    confirmationStatuses.includes(
      query.confirmation as (typeof confirmationStatuses)[number],
    )
  )
    where.confirmationStatus =
      query.confirmation as (typeof confirmationStatuses)[number];
  if (
    deliveryStatuses.includes(
      query.delivery as (typeof deliveryStatuses)[number],
    )
  )
    where.deliveryStatus = query.delivery as (typeof deliveryStatuses)[number];
  if (query.from || query.to)
    where.createdAt = {
      ...(query.from ? { gte: new Date(`${query.from}T00:00:00`) } : {}),
      ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999`) } : {}),
    };
  const [t, orders, total] = await Promise.all([
    getTranslations("Workflow"),
    prisma.order.findMany({
      where,
      include: { city: true, lines: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * take,
      take,
    }),
    prisma.order.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / take));
  const href = (updates: Record<string, string | undefined>) =>
    ({
      pathname: "/app/partner/orders",
      query: { ...query, ...updates, page: undefined },
    }) as const;
  const pageHref = (nextPage: number) =>
    ({
      pathname: "/app/partner/orders",
      query: { ...query, page: String(nextPage) },
    }) as const;
  const chips = [
    {
      label: locale === "ar" ? "الكل" : "Toutes",
      query: { confirmation: undefined, delivery: undefined },
    },
    {
      label: locale === "ar" ? "للتأكيد" : "À confirmer",
      query: { confirmation: "NEW", delivery: undefined },
    },
    {
      label: locale === "ar" ? "مؤكدة" : "Confirmées",
      query: { confirmation: "CONFIRMED", delivery: undefined },
    },
    {
      label: locale === "ar" ? "قيد التوصيل" : "En livraison",
      query: { confirmation: undefined, delivery: "IN_TRANSIT" },
    },
    {
      label: locale === "ar" ? "تم التوصيل" : "Livrées",
      query: { confirmation: undefined, delivery: "DELIVERED" },
    },
    {
      label: locale === "ar" ? "مرتجعات" : "Retours",
      query: { confirmation: undefined, delivery: "RETURNED" },
    },
  ];
  return (
    <main>
      <WorkflowHeader
        eyebrow=""
        title={t("ordersTitle")}
        body={t("ordersBody")}
        action={
          <div className="header-actions">
            <a className="button" href="/api/orders/export">
              <Download size={17} />
              {t("exportExcel")}
            </a>
            {canCreate && (
              <Link className="button" href="/app/partner/orders/import">
                <FileSpreadsheet size={17} />
                {locale === "ar" ? "استيراد" : "Importer"}
              </Link>
            )}
            {canCreate && (
              <Link
                className="button button--primary"
                href="/app/partner/orders/new"
              >
                <Plus size={17} />
                {t("newOrder")}
              </Link>
            )}
          </div>
        }
      />
      <nav
        className="status-chips"
        aria-label={locale === "ar" ? "تصفية حسب الحالة" : "Filtrer par statut"}
      >
        {chips.map((chip) => {
          const active =
            (chip.query.confirmation ?? "") === (query.confirmation ?? "") &&
            (chip.query.delivery ?? "") === (query.delivery ?? "");
          return (
            <Link
              className={active ? "is-active" : ""}
              href={href(chip.query)}
              key={chip.label}
            >
              {chip.label}
            </Link>
          );
        })}
      </nav>
      <form className="filter-bar orders-filter" method="get">
        <label>
          <span>{locale === "ar" ? "بحث" : "Recherche"}</span>
          <input
            name="q"
            defaultValue={query.q}
          />
        </label>
        <input
          type="hidden"
          name="confirmation"
          value={query.confirmation ?? ""}
        />
        <input type="hidden" name="delivery" value={query.delivery ?? ""} />
        <label>
          <span>{locale === "ar" ? "من" : "Du"}</span>
          <input type="date" name="from" defaultValue={query.from} />
        </label>
        <label>
          <span>{locale === "ar" ? "إلى" : "Au"}</span>
          <input type="date" name="to" defaultValue={query.to} />
        </label>
        <button
          className="button button--primary button--compact"
          type="submit"
        >
          {locale === "ar" ? "بحث" : "Rechercher"}
        </button>
      </form>
      {orders.length ? (
        <section className="workflow-table-card">
          <div className="workflow-table workflow-table--orders">
            <div className="workflow-table__row workflow-table__head">
              <span>{t("reference")}</span>
              <span>{t("customer")}</span>
              <span>{t("city")}</span>
              <span>{t("amount")}</span>
              <span>{t("status")}</span>
              <span />
            </div>
            {orders.map((order) => (
              <div className="workflow-table__row" key={order.id}>
                <strong>
                  <Link href={`/app/partner/orders/${order.id}`}>
                    {productReference(order.code)}
                  </Link>
                  <small>
                    {new Intl.DateTimeFormat(locale).format(order.createdAt)}
                  </small>
                </strong>
                <span>
                  {cleanDemoLabel(order.customerName)}
                  <small>{order.phone}</small>
                </span>
                <span>
                  {locale === "ar" ? order.city.nameAr : order.city.nameFr}
                </span>
                <span>
                  {formatMoney(
                    order.lines.reduce(
                      (sum, line) =>
                        sum + Number(line.salePrice) * line.quantity,
                      0,
                    ),
                    locale,
                  )}
                </span>
                <StatusPill
                  status={
                    order.deliveryStatus === "NOT_READY"
                      ? order.confirmationStatus
                      : order.deliveryStatus
                  }
                >
                  {statusLabel(
                    order.deliveryStatus === "NOT_READY"
                      ? order.confirmationStatus
                      : order.deliveryStatus,
                    locale,
                  )}
                </StatusPill>
                <Link
                  className="row-link"
                  href={`/app/partner/orders/${order.id}`}
                  aria-label={productReference(order.code)}
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
              : "Aucune commande pour ces filtres."}
          </p>
          <Link className="button button--compact" href="/app/partner/orders">
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
            {page} / {pages}
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
