import { Prisma } from "@prisma/client";
import { getTranslations } from "next-intl/server";

import {
  FormNotice,
  StatusPill,
  WorkflowHeader,
} from "@/components/workflow-ui";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { formatMoney } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { requirePermission, sessionUserCan } from "@/server/auth/session";
import { requestPayoutAction } from "@/server/operations/actions";
import {
  affiliateIdFor,
  settleAffiliateDeliveredCommissions,
} from "@/server/orders/service";
import { statusLabel } from "@/lib/status";
import { Link } from "@/i18n/navigation";

export default async function WalletPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "fr" | "ar" }>;
  searchParams: Promise<{
    status?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const { status } = query;
  const user = await requirePermission(locale, "wallet:view");
  const canRequestPayout = sessionUserCan(user, "payouts:request");
  const affiliateId = await affiliateIdFor(user.id, user.role);
  await settleAffiliateDeliveredCommissions(user.id, affiliateId);
  const affiliate = await prisma.affiliateProfile.findUniqueOrThrow({
    where: { id: affiliateId },
    include: {
      walletEntries: { orderBy: { createdAt: "desc" } },
      payouts: { orderBy: { createdAt: "desc" } },
    },
  });
  const t = await getTranslations("Workflow");
  const balance = affiliate.walletEntries
    .filter((item) => item.status === "COMPLETED")
    .reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0));
  const pendingDebits = affiliate.walletEntries
    .filter((item) => item.status === "PENDING" && item.type === "PAYOUT_DEBIT")
    .reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0));
  const reservedPayoutIds = new Set(
    affiliate.walletEntries
      .filter((item) => item.type === "PAYOUT_DEBIT" && item.payoutId)
      .map((item) => item.payoutId),
  );
  const legacyReservations = affiliate.payouts
    .filter(
      (item) =>
        (item.status === "PENDING" || item.status === "APPROVED") &&
        !reservedPayoutIds.has(item.id),
    )
    .reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0));
  const available = balance.plus(pendingDebits).minus(legacyReservations);
  const maskedRib = affiliate.rib
    ? `•••• •••• •••• •••• •••• ${affiliate.rib.slice(-4)}`
    : "—";
  const hasOpenPayout = affiliate.payouts.some(
    (item) => item.status === "PENDING" || item.status === "APPROVED",
  );
  const inDateRange = (date: Date) =>
    (!query.from || date >= new Date(`${query.from}T00:00:00`)) &&
    (!query.to || date <= new Date(`${query.to}T23:59:59.999`));
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const take = 12;
  const filteredEntries = affiliate.walletEntries.filter((item) =>
    inDateRange(item.createdAt),
  );
  const filteredPayouts = affiliate.payouts.filter((item) =>
    inDateRange(item.createdAt),
  );
  const pages = Math.max(
    1,
    Math.ceil(Math.max(filteredEntries.length, filteredPayouts.length) / take),
  );
  const visibleEntries = filteredEntries.slice((page - 1) * take, page * take);
  const visiblePayouts = filteredPayouts.slice((page - 1) * take, page * take);
  const movementLabel = (type: string) => {
    const labels: Record<string, [string, string]> = {
      COMMISSION_CREDIT: ["Commission disponible", "عمولة متاحة"],
      PAYOUT_DEBIT: ["Virement demandé", "تحويل مطلوب"],
      ADJUSTMENT: ["Régularisation", "تسوية"],
    };
    return labels[type]?.[locale === "ar" ? 1 : 0] ?? statusLabel(type, locale);
  };
  const pageHref = (nextPage: number) =>
    ({
      pathname: "/app/partner/wallet",
      query: { ...query, page: String(nextPage), status: undefined },
    }) as const;
  return (
    <main>
      <WorkflowHeader
        eyebrow={t("live")}
        title={t("walletTitle")}
        body={t("walletBody")}
      />
      <FormNotice
        status={status}
        messages={{
          requested:
            locale === "ar"
              ? "تم إرسال طلب التحويل إلى الفريق المالي."
              : "Demande de virement envoyée à l’équipe finance.",
          invalid: t("invalid"),
          insufficient:
            locale === "ar"
              ? "المبلغ المطلوب أكبر من الرصيد المتاح."
              : "Le montant demandé dépasse le solde disponible.",
          "negative-balance":
            locale === "ar"
              ? "يجب تسوية الرصيد المستحق قبل طلب تحويل جديد."
              : "Le solde dû doit être régularisé avant un nouveau virement.",
          "open-request":
            locale === "ar"
              ? "لديك طلب تحويل قيد المعالجة بالفعل."
              : "Une demande de virement est déjà en cours.",
          failed:
            locale === "ar"
              ? "تعذر إرسال طلب التحويل. حاول مرة أخرى."
              : "La demande de virement n’a pas pu être envoyée. Réessayez.",
        }}
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
      <section
        className={`wallet-card${available.lt(0) ? " wallet-card--debt" : ""}`}
      >
        <span>
          {available.lt(0)
            ? locale === "ar"
              ? "الرصيد المستحق"
              : "Solde dû"
            : t("available")}
        </span>
        <strong>{formatMoney(available.abs().toString(), locale)}</strong>
        {available.lt(0) && (
          <p>
            {locale === "ar"
              ? "نتج هذا المبلغ عن عمولة تم دفعها ثم إلغاء الطلب أو إرجاعه. ستُخصم العمولات القادمة تلقائياً حتى تتم التسوية."
              : "Ce montant vient d’une commission déjà versée puis annulée après un retour. Les prochaines commissions le régulariseront automatiquement."}
          </p>
        )}
        <small>
          {affiliate.bankName ?? "—"} · <bdi>{maskedRib}</bdi>
        </small>
        {hasOpenPayout && (
          <small>
            {locale === "ar"
              ? "لديك طلب تحويل قيد المعالجة."
              : "Une demande de virement est déjà en cours."}
          </small>
        )}
        {canRequestPayout ? (
          <form action={requestPayoutAction}>
            <input type="hidden" name="locale" value={locale} />
            <label>
              <span>{t("amount")}</span>
              <input
                name="amount"
                type="number"
                min="1"
                step="0.01"
                max={available.gt(0) ? available.toString() : undefined}
                defaultValue={
                  available.gt(0) ? available.toString() : undefined
                }
                required
              />
            </label>
            <ConfirmSubmitButton
              confirmMessage={
                locale === "ar"
                  ? "هل تريد تأكيد طلب التحويل؟"
                  : "Confirmer cette demande de virement ?"
              }
              className="button button--light"
              type="submit"
              disabled={available.lte(0) || hasOpenPayout}
            >
              {t("requestTransfer")}
            </ConfirmSubmitButton>
          </form>
        ) : (
          <p>
            {locale === "ar"
              ? "ليس لديك صلاحية طلب التحويلات."
              : "Vous n’avez pas la permission de demander un virement."}
          </p>
        )}
        {canRequestPayout && (available.lte(0) || hasOpenPayout) ? (
          <p className="wallet-disabled-reason">
            {hasOpenPayout
              ? locale === "ar"
                ? "الزر معطل لأن طلباً آخر قيد المعالجة."
                : "Le bouton est désactivé car une demande est déjà en cours."
              : locale === "ar"
                ? "الزر معطل حتى يصبح رصيد متاح."
                : "Le bouton sera disponible dès qu’un solde positif sera disponible."}
          </p>
        ) : null}
      </section>
      <div className="detail-grid">
        <section className="detail-card">
          <h2>{t("transactions")}</h2>
          {visibleEntries.map((item) => (
            <article className="line-item" key={item.id}>
              <div>
                <strong>{item.reference}</strong>
                <small>
                  {movementLabel(item.type)} ·{" "}
                  {new Intl.DateTimeFormat(locale).format(item.createdAt)}
                </small>
              </div>
              <span>
                {formatMoney(String(item.amount), locale)}
                <StatusPill>{statusLabel(item.status, locale)}</StatusPill>
              </span>
            </article>
          ))}
        </section>
        <section className="detail-card">
          <h2>{t("payouts")}</h2>
          {visiblePayouts.map((item) => (
            <article className="line-item" key={item.id}>
              <div>
                <strong>{item.reference}</strong>
                <small>
                  {new Intl.DateTimeFormat(locale).format(item.createdAt)}
                  {item.bankReference ? ` · ${item.bankReference}` : ""}
                </small>
                {item.proofUrl ? (
                  <a
                    className="payout-proof-link"
                    href={item.proofUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <img
                      src={item.proofUrl}
                      alt={
                        locale === "ar"
                          ? "صورة التحويل البنكي"
                          : "Capture du virement"
                      }
                      className="payout-proof-thumb payout-proof-thumb--compact"
                    />
                  </a>
                ) : null}
              </div>
              <span>
                {formatMoney(String(item.amount), locale)}
                <StatusPill>{statusLabel(item.status, locale)}</StatusPill>
              </span>
            </article>
          ))}
        </section>
      </div>
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
