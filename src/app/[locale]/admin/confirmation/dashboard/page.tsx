import {
  BadgeDollarSign,
  CheckCircle2,
  PhoneCall,
  ShoppingBag,
  Truck,
  WalletCards,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

import {
  ConfirmationEarningsChart,
  ConfirmationVolumeChart,
  StatusDonut,
} from "@/components/dashboard-charts";
import { Link } from "@/i18n/navigation";
import { formatMoney } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { formatAppDateTime } from "@/lib/time";
import { requirePermission } from "@/server/auth/session";
import {
  CONFIRMATION_REWARD_SETTING_KEY,
  computeConfirmationEarnings,
  confirmationAssignmentScope,
  DEFAULT_CONFIRMATION_REWARD_DH,
} from "@/server/orders/confirmation-assignment";

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export default async function ConfirmationDashboardPage({
  params,
}: {
  params: Promise<{ locale: "fr" | "ar" }>;
}) {
  const { locale } = await params;
  const user = await requirePermission(locale, "orders:confirm");
  const isAgent = user.role === "CONFIRMATION_AGENT";
  const scope = confirmationAssignmentScope(user);
  const [t, adminT, rewardSetting, orders] = await Promise.all([
    getTranslations("Workflow"),
    getTranslations("Admin"),
    prisma.setting.findUnique({
      where: { key: CONFIRMATION_REWARD_SETTING_KEY },
      select: { value: true },
    }),
    prisma.order.findMany({
      where: {
        ...scope,
        ...(isAgent ? {} : { confirmationAgentId: { not: null } }),
      },
      select: {
        id: true,
        code: true,
        customerName: true,
        confirmationStatus: true,
        deliveryStatus: true,
        confirmationReward: true,
        confirmedAt: true,
        deliveredAt: true,
        createdAt: true,
        confirmationAgent: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const rewardRate = (() => {
    const raw = rewardSetting?.value;
    const amount =
      typeof raw === "number"
        ? raw
        : typeof raw === "string"
          ? Number(raw)
          : DEFAULT_CONFIRMATION_REWARD_DH;
    return Number.isFinite(amount) && amount >= 0
      ? amount
      : DEFAULT_CONFIRMATION_REWARD_DH;
  })();

  const closed = new Set(["CONFIRMED", "CANCELLED", "UNREACHABLE"]);
  const queue = orders.filter((o) => !closed.has(o.confirmationStatus));
  const confirmed = orders.filter((o) => o.confirmationStatus === "CONFIRMED");
  const delivered = confirmed.filter((o) => o.deliveryStatus === "DELIVERED");
  const pendingDelivery = confirmed.filter(
    (o) => o.deliveryStatus !== "DELIVERED",
  );
  const cancelled = orders.filter((o) => o.confirmationStatus === "CANCELLED");
  const unreachable = orders.filter(
    (o) => o.confirmationStatus === "UNREACHABLE",
  );
  const decided = confirmed.length + cancelled.length + unreachable.length;
  const confirmationRate = decided
    ? Math.round((confirmed.length / decided) * 100)
    : 0;

  const { earnedTotal, earnedCount } = computeConfirmationEarnings({
    deliveredCount: delivered.length,
    rewardSum: delivered.reduce(
      (sum, order) => sum + Number(order.confirmationReward ?? 0),
      0,
    ),
    rewardRate,
    rowsWithReward: delivered.filter((o) => o.confirmationReward != null)
      .length,
  });
  const pendingEarnings = pendingDelivery.length * rewardRate;

  const now = new Date();
  const monthSeries = Array.from({ length: 6 }, (_, offset) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - offset), 1);
    const next = new Date(date.getFullYear(), date.getMonth() + 1, 1);
    const key = monthKey(date);
    const monthOrders = orders.filter((order) => {
      const stamp = order.confirmedAt ?? order.createdAt;
      return stamp >= date && stamp < next;
    });
    const monthDelivered = orders.filter(
      (order) =>
        order.deliveryStatus === "DELIVERED" &&
        order.deliveredAt &&
        order.deliveredAt >= date &&
        order.deliveredAt < next,
    );
    const earnings = monthDelivered.reduce((sum, order) => {
      if (order.confirmationReward != null)
        return sum + Number(order.confirmationReward);
      return sum + rewardRate;
    }, 0);
    return {
      key,
      month: new Intl.DateTimeFormat(locale, { month: "short" }).format(date),
      confirmed: monthOrders.filter((o) => o.confirmationStatus === "CONFIRMED")
        .length,
      delivered: monthDelivered.length,
      earnings,
    };
  });

  const outcomeDonut = [
    {
      name: locale === "ar" ? "مؤكدة" : "Confirmées",
      value: confirmed.length,
    },
    {
      name: locale === "ar" ? "ملغاة" : "Annulées",
      value: cancelled.length,
    },
    {
      name: locale === "ar" ? "تعذر الاتصال" : "Injoignables",
      value: unreachable.length,
    },
    {
      name: locale === "ar" ? "قيد المعالجة" : "En cours",
      value: queue.length,
    },
  ].filter((item) => item.value > 0);

  const recentDeliveries = delivered
    .slice()
    .sort(
      (a, b) =>
        (b.deliveredAt?.getTime() ?? 0) - (a.deliveredAt?.getTime() ?? 0),
    )
    .slice(0, 8);

  const metrics = [
    {
      icon: ShoppingBag,
      label: locale === "ar" ? "في الانتظار" : "À traiter",
      value: String(queue.length),
      featured: false,
    },
    {
      icon: CheckCircle2,
      label: locale === "ar" ? "مؤكدة" : "Confirmées",
      value: String(confirmed.length),
      featured: false,
    },
    {
      icon: Truck,
      label: locale === "ar" ? "مسلّمة" : "Livrées",
      value: String(earnedCount),
      featured: false,
    },
    {
      icon: PhoneCall,
      label: locale === "ar" ? "نسبة التأكيد" : "Taux de confirmation",
      value: `${confirmationRate}%`,
      featured: false,
    },
    {
      icon: BadgeDollarSign,
      label: locale === "ar" ? "الأرباح المحققة" : "Gains cumulés",
      value: formatMoney(earnedTotal, locale),
      featured: true,
    },
    {
      icon: WalletCards,
      label: locale === "ar" ? "قيد التحصيل" : "En attente de livraison",
      value: formatMoney(pendingEarnings, locale),
      featured: false,
    },
  ] as const;

  return (
    <main>
      <div className="dashboard-heading">
        <div>
          <p className="app-kicker">{adminT("confirmatorDashboardKicker")}</p>
          <h1>{adminT("confirmatorDashboardTitle")}</h1>
          <p>
            {isAgent
              ? adminT("confirmatorDashboardBodyAgent")
              : adminT("confirmatorDashboardBodyAdmin")}
          </p>
        </div>
        <div className="dashboard-quick-actions">
          {isAgent ? (
            <Link
              className="button button--primary"
              href="/admin/confirmation/payments"
            >
              {locale === "ar" ? "طلب تحويل" : "Demander un virement"}
            </Link>
          ) : null}
          <Link
            className="button button--ghost"
            href="/admin/confirmation"
          >
            {locale === "ar" ? "فتح لائحة التأكيد" : "Ouvrir la file"}
          </Link>
        </div>
      </div>

      <div className="metric-grid metric-grid--confirmator">
        {metrics.map((metric) => (
          <article
            className={
              metric.featured
                ? "metric-card metric-card--featured"
                : "metric-card"
            }
            key={metric.label}
          >
            <span className="metric-card__icon">
              <metric.icon size={19} />
            </span>
            <p>{metric.label}</p>
            <strong>{metric.value}</strong>
          </article>
        ))}
      </div>

      <p className="commission-note">
        <BadgeDollarSign size={14} />
        {locale === "ar"
          ? `التعريفة الحالية: ${formatMoney(rewardRate, locale)} لكل طلب مؤكد ومسلّم.`
          : `Tarif actuel : ${formatMoney(rewardRate, locale)} par commande confirmée puis livrée.`}
      </p>

      <div className="dashboard-data-grid dashboard-data-grid--equal">
        <section className="data-panel">
          <h2>
            {locale === "ar" ? "الأرباح الشهرية" : "Gains mensuels"}
          </h2>
          <ConfirmationEarningsChart
            data={monthSeries}
            earningsLabel={locale === "ar" ? "الأرباح" : "Gains"}
          />
        </section>
        <section className="data-panel">
          <h2>
            {locale === "ar"
              ? "التأكيد مقابل التسليم"
              : "Confirmations et livraisons"}
          </h2>
          <ConfirmationVolumeChart
            data={monthSeries}
            labels={{
              confirmed: locale === "ar" ? "مؤكدة" : "Confirmées",
              delivered: locale === "ar" ? "مسلّمة" : "Livrées",
            }}
          />
        </section>
      </div>

      <div className="dashboard-data-grid dashboard-data-grid--equal">
        <section className="data-panel">
          <h2>
            {locale === "ar" ? "توزيع النتائج" : "Répartition des résultats"}
          </h2>
          {outcomeDonut.length ? (
            <>
              <StatusDonut data={outcomeDonut} />
              <div className="rank-list">
                {outcomeDonut.map((item, index) => (
                  <div key={item.name}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{item.name}</strong>
                    <b>{item.value}</b>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="dashboard-empty" style={{ padding: 24 }}>
              {t("noRecords")}
            </p>
          )}
        </section>
        <section className="data-panel">
          <h2>
            {locale === "ar"
              ? "آخر التسليمات المحتسبة"
              : "Dernières livraisons comptées"}
          </h2>
          {recentDeliveries.length ? (
            <div className="simple-table">
              <div className="simple-table__head">
                <span>{locale === "ar" ? "الطلب" : "Commande"}</span>
                <span>{locale === "ar" ? "الزبون" : "Client"}</span>
                <span>{locale === "ar" ? "الربح" : "Gain"}</span>
              </div>
              {recentDeliveries.map((order) => (
                <div className="simple-table__row" key={order.id}>
                  <strong>
                    <Link href={`/admin/orders/${order.id}`}>{order.code}</Link>
                  </strong>
                  <span>
                    {order.customerName}
                    {order.deliveredAt
                      ? ` · ${formatAppDateTime(order.deliveredAt, locale)}`
                      : ""}
                  </span>
                  <span>
                    {formatMoney(
                      Number(order.confirmationReward ?? rewardRate),
                      locale,
                    )}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="dashboard-empty" style={{ padding: 24 }}>
              {locale === "ar"
                ? "لا توجد تسليمات محتسبة بعد."
                : "Aucune livraison comptée pour le moment."}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
