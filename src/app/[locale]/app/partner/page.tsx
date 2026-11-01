import {
  ArrowUpRight,
  Coins,
  PackageSearch,
  Percent,
  Truck,
  WalletCards,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

import { ZelligeMark } from "@/components/brand/zellige-mark";
import { PerformanceChart, StatusDonut } from "@/components/dashboard-charts";
import { Link } from "@/i18n/navigation";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/money";
import { requireRole, sessionUserCan } from "@/server/auth/session";
import {
  affiliateIdFor,
  settleAffiliateDeliveredCommissions,
} from "@/server/orders/service";
import { Prisma } from "@prisma/client";
import { FormNotice } from "@/components/workflow-ui";
import { cleanDemoLabel, productReference } from "@/lib/display-text";

export default async function PartnerDashboard({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "fr" | "ar" }>;
  searchParams: Promise<{ status?: string; period?: string }>;
}) {
  const { locale } = await params;
  const { status, period } = await searchParams;
  const periodMonths = period === "3" ? 3 : period === "12" ? 12 : 6;
  const t = await getTranslations("Partner");
  const user = await requireRole(locale, ["AFFILIATE", "AFFILIATE_STAFF"]);
  const canViewWallet = sessionUserCan(user, "wallet:view");
  const canRequestPayout = sessionUserCan(user, "payouts:request");
  const affiliateId = await affiliateIdFor(user.id, user.role);
  // Credit commissions for delivered orders that predate auto-settle on delivery.
  await settleAffiliateDeliveredCommissions(user.id, affiliateId);
  const now = new Date();
  const [affiliate, orders, walletEntries, payouts, announcement, settings] =
    await Promise.all([
      prisma.affiliateProfile.findUniqueOrThrow({ where: { id: affiliateId } }),
      prisma.order.findMany({
        where: { affiliateId },
        include: { lines: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.walletTransaction.findMany({
        where: { affiliateId, status: "COMPLETED" },
      }),
      prisma.payoutRequest.findMany({
        where: { affiliateId, status: { in: ["PENDING", "APPROVED"] } },
      }),
      prisma.announcement.findFirst({
        where: {
          published: true,
          startsAt: { lte: now },
          endsAt: { gte: now },
        },
        orderBy: { startsAt: "desc" },
      }),
      prisma.setting.findMany({
        where: { key: { in: ["proThreshold", "masterThreshold"] } },
      }),
    ]);
  const ledger = walletEntries.reduce(
    (sum, item) => sum.plus(item.amount),
    new Prisma.Decimal(0),
  );
  const pendingDebits = await prisma.walletTransaction.findMany({
    where: {
      affiliateId,
      status: "PENDING",
      type: "PAYOUT_DEBIT",
    },
  });
  const reservedFromDebits = pendingDebits.reduce(
    (sum, item) => sum.plus(item.amount.abs()),
    new Prisma.Decimal(0),
  );
  const reservedPayoutIds = new Set(
    pendingDebits.map((item) => item.payoutId).filter(Boolean),
  );
  const legacyReserved = payouts
    .filter((item) => !reservedPayoutIds.has(item.id))
    .reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0));
  const reserved = reservedFromDebits.plus(legacyReserved);
  const confirmed = orders.filter(
    (order) => order.confirmationStatus === "CONFIRMED",
  ).length;
  const delivered = orders.filter(
    (order) => order.deliveryStatus === "DELIVERED",
  ).length;
  const paidCommission = orders
    .filter((order) => order.deliveryStatus === "DELIVERED")
    .flatMap((order) => order.lines)
    .reduce((sum, line) => sum + Number(line.commission) * line.quantity, 0);
  const available = ledger.minus(reserved);
  const metrics = [
    ...(canViewWallet
      ? ([
          [
            WalletCards,
            available.lt(0) ? "balanceDue" : "availableBalance",
            formatMoney(available.abs().toString(), locale),
          ],
          [Coins, "paidCommission", formatMoney(paidCommission, locale)],
        ] as const)
      : []),
    [PackageSearch, "totalOrders", String(orders.length)],
    [
      Percent,
      "confirmationRate",
      orders.length
        ? `${Math.round((confirmed / orders.length) * 100)}%`
        : "0%",
    ],
    [
      Truck,
      "deliveryRate",
      confirmed ? `${Math.round((delivered / confirmed) * 100)}%` : "0%",
    ],
  ] as const;
  const monthData = Array.from({ length: periodMonths }, (_, offset) => {
    const date = new Date(
      now.getFullYear(),
      now.getMonth() - (periodMonths - 1 - offset),
      1,
    );
    const next = new Date(date.getFullYear(), date.getMonth() + 1, 1);
    const inMonth = orders.filter(
      (order) => order.createdAt >= date && order.createdAt < next,
    );
    return {
      month: new Intl.DateTimeFormat(locale, { month: "short" }).format(date),
      orders: inMonth.length,
      delivered: inMonth.filter((order) => order.deliveryStatus === "DELIVERED")
        .length,
    };
  });
  const productCounts = new Map<string, number>();
  for (const order of orders)
    for (const line of order.lines)
      productCounts.set(
        cleanDemoLabel(
          locale === "ar"
            ? line.productNameAr || line.productNameFr
            : line.productNameFr,
        ),
        (productCounts.get(
          cleanDemoLabel(
            locale === "ar"
              ? line.productNameAr || line.productNameFr
              : line.productNameFr,
          ),
        ) ?? 0) + line.quantity,
      );
  const topProducts = [...productCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const proThreshold = Number(
    settings.find((item) => item.key === "proThreshold")?.value ?? 25,
  );
  const masterThreshold = Number(
    settings.find((item) => item.key === "masterThreshold")?.value ?? 100,
  );
  const target =
    affiliate.level === "STARTER"
      ? proThreshold
      : affiliate.level === "PRO"
        ? masterThreshold
        : Math.max(delivered, masterThreshold);
  return (
    <main>
      <div className="dashboard-heading">
        <div>
          <p className="app-kicker">{t("area")}</p>
          <h1>{t("welcome")}</h1>
          <p>{t("welcomeBody")}</p>
        </div>
      </div>
      <FormNotice
        status={status}
        messages={{
          forbidden:
            locale === "ar"
              ? "ليست لديك صلاحية لفتح هذه الصفحة."
              : "Vous n’avez pas l’autorisation d’accéder à cette page.",
        }}
      />
      {announcement &&
        !/démonstration|تجريب/i.test(
          `${announcement.titleFr} ${announcement.titleAr}`,
        ) && (
          <Link href="/app/partner/announcements" className="announcement-banner">
            <span>{t("activeAnnouncement")}</span>
            <strong>
              {locale === "ar" ? announcement.titleAr : announcement.titleFr}
            </strong>
            <p>{locale === "ar" ? announcement.bodyAr : announcement.bodyFr}</p>
          </Link>
        )}
      <div className="metric-grid">
        {metrics.map(([Icon, label, value], index) => (
          <article
            className={`metric-card ${index === 0 ? "metric-card--featured" : ""}`}
            key={label}
          >
            <span className="metric-card__icon">
              <Icon size={19} />
            </span>
            <p>{t(label)}</p>
            <strong
              className={label === "balanceDue" ? "text-danger" : undefined}
            >
              {value}
            </strong>
          </article>
        ))}
      </div>
      {canViewWallet && canRequestPayout && available.gt(0) ? (
        <div className="dashboard-quick-actions">
          <Link
            className="button button--primary button--compact"
            href="/app/partner/wallet"
          >
            <WalletCards size={16} />
            {locale === "ar" ? "سحب الرصيد" : "Retirer"}
          </Link>
        </div>
      ) : null}
      {canViewWallet && (
        <p className="commission-note">
          <Coins size={17} />
          {t("commissionNote")}
        </p>
      )}
      {orders.length ? (
        <>
          <div className="dashboard-data-grid">
            <section className="data-panel">
              <h2>{t("statusOverview")}</h2>
              <div className="status-bars">
                <StatusRow
                  label={t("statusNew")}
                  value={
                    orders.filter((o) => o.confirmationStatus === "NEW").length
                  }
                  total={orders.length}
                  tone="blue"
                />
                <StatusRow
                  label={t("statusConfirmed")}
                  value={confirmed}
                  total={orders.length}
                  tone="green"
                />
                <StatusRow
                  label={t("statusDelivered")}
                  value={delivered}
                  total={orders.length}
                  tone="yellow"
                />
                <StatusRow
                  label={t("statusReturned")}
                  value={
                    orders.filter((o) => o.deliveryStatus === "RETURNED").length
                  }
                  total={orders.length}
                  tone="red"
                />
              </div>
              <StatusDonut
                data={[
                  {
                    name: t("statusNew"),
                    value: orders.filter((o) => o.confirmationStatus === "NEW")
                      .length,
                  },
                  { name: t("statusConfirmed"), value: confirmed },
                  { name: t("statusDelivered"), value: delivered },
                  {
                    name: t("statusReturned"),
                    value: orders.filter((o) => o.deliveryStatus === "RETURNED")
                      .length,
                  },
                ]}
              />
            </section>
            <section className="data-panel">
              <h2>{t("recentOrders")}</h2>
              <div className="simple-table">
                <div className="simple-table__head">
                  <span>{t("orderCode")}</span>
                  <span>{t("customer")}</span>
                  <span>{t("amount")}</span>
                </div>
                {orders.slice(0, 4).map((order) => (
                  <div className="simple-table__row" key={order.id}>
                    <strong>{productReference(order.code)}</strong>
                    <span>{cleanDemoLabel(order.customerName)}</span>
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
                  </div>
                ))}
              </div>
              <div className="level-card">
                <span>{t("affiliateLevel")}</span>
                <strong>
                  {affiliate.level === "PRO"
                    ? locale === "ar"
                      ? "المستوى النشط"
                      : "Niveau Confirmé"
                    : affiliate.level === "STARTER"
                      ? locale === "ar"
                        ? "المستوى المبتدئ"
                        : "Niveau Débutant"
                      : locale === "ar"
                        ? "المستوى المتقدم"
                        : "Niveau Master"}
                </strong>
                <p>{t("levelProgress", { current: delivered, target })}</p>
                <i>
                  <b
                    style={{
                      width: `${Math.min(100, Math.round((delivered / Math.max(target, 1)) * 100))}%`,
                    }}
                  />
                </i>
              </div>
            </section>
          </div>
          <div className="dashboard-data-grid dashboard-data-grid--equal">
            <section className="data-panel">
              <div className="section-title-row">
                <h2>{t("performance")}</h2>
                <nav
                  className="period-switch"
                  aria-label={locale === "ar" ? "الفترة" : "Période"}
                >
                  {[3, 6, 12].map((months) => (
                    <Link
                      className={periodMonths === months ? "is-active" : ""}
                      href={{
                        pathname: "/app/partner",
                        query: { period: String(months) },
                      }}
                      key={months}
                    >
                      {months} {locale === "ar" ? "أشهر" : "mois"}
                    </Link>
                  ))}
                </nav>
              </div>
              <PerformanceChart data={monthData} />
            </section>
            <section className="data-panel">
              <h2>{t("topProducts")}</h2>
              <div className="rank-list">
                {topProducts.map(([name, count], index) => (
                  <div key={name}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{name}</strong>
                    <b>{count}</b>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      ) : (
        <section className="dashboard-empty">
          <ZelligeMark />
          <h2>{t("emptyTitle")}</h2>
          <p>{t("emptyBody")}</p>
          <Link href="/app/partner/products" className="button button--primary">
            {t("browseProducts")}
            <ArrowUpRight size={17} />
          </Link>
        </section>
      )}
    </main>
  );
}

function StatusRow({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: string;
}) {
  return (
    <div className="status-row">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <i>
        <b
          className={`tone-${tone}`}
          style={{ width: `${Math.round((value / total) * 100)}%` }}
        />
      </i>
    </div>
  );
}
