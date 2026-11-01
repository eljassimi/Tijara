import { Download } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { StatusPill, WorkflowHeader } from "@/components/workflow-ui";
import { formatMoney } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/server/auth/session";
import { affiliateIdFor } from "@/server/orders/service";
import { statusLabel } from "@/lib/status";
import { Link } from "@/i18n/navigation";
import type { Prisma } from "@prisma/client";

export default async function InvoicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "fr" | "ar" }>;
  searchParams: Promise<{ from?: string; to?: string; page?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const user = await requirePermission(locale, "wallet:view");
  const affiliateId = await affiliateIdFor(user.id, user.role);
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const take = 20;
  const where: Prisma.InvoiceWhereInput = { affiliateId };
  if (query.from || query.to)
    where.createdAt = {
      ...(query.from ? { gte: new Date(`${query.from}T00:00:00`) } : {}),
      ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999`) } : {}),
    };
  const [t, invoices, total] = await Promise.all([
    getTranslations("Workflow"),
    prisma.invoice.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * take,
      take,
    }),
    prisma.invoice.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / take));
  const pageHref = (nextPage: number) =>
    ({
      pathname: "/app/partner/invoices",
      query: { ...query, page: String(nextPage) },
    }) as const;
  return (
    <main>
      <WorkflowHeader
        eyebrow={t("live")}
        title={t("invoicesTitle")}
        body={t("invoicesBody")}
      />
      <form className="filter-bar date-filter" method="get">
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
          {locale === "ar" ? "تصفية" : "Filtrer"}
        </button>
      </form>
      {invoices.length ? (
        <section className="workflow-table-card">
          <div className="workflow-table workflow-table--invoices">
            <div className="workflow-table__row workflow-table__head">
              <span>{t("reference")}</span>
              <span>{t("amount")}</span>
              <span>{t("status")}</span>
              <span />
            </div>
            {invoices.map((item) => (
              <div className="workflow-table__row" key={item.id}>
                <strong>
                  {item.number}
                  <small>
                    {new Intl.DateTimeFormat(locale).format(item.createdAt)}
                  </small>
                </strong>
                <span>{formatMoney(String(item.totalCommission), locale)}</span>
                <StatusPill>{statusLabel(item.status, locale)}</StatusPill>
                <a
                  className="button button--compact"
                  href={`/api/invoices/${item.id}/pdf`}
                >
                  <Download size={14} />
                  {t("downloadPdf")}
                </a>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <p className="queue-empty">
          {locale === "ar"
            ? "ستظهر فواتيرك بعد أداء العمولات."
            : "Vos factures apparaîtront après le paiement de vos commissions."}
        </p>
      )}
      {pages > 1 ? (
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
      ) : null}
    </main>
  );
}
