import {
  BadgeDollarSign,
  Banknote,
  PackageCheck,
  Percent,
  Truck,
  Users,
  WalletCards,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

import { PerformanceChart } from "@/components/dashboard-charts";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/money";
import { requireRole } from "@/server/auth/session";

export default async function AdminDashboard({
  params,
}: {
  params: Promise<{ locale: "fr" | "ar" }>;
}) {
  const { locale } = await params;
  await requireRole(locale, ["SUPER_ADMIN", "FINANCE"]);
  const t = await getTranslations("Admin");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [
    ordersToday,
    allOrders,
    activeAffiliates,
    publishedProducts,
    openTickets,
    pendingPayouts,
  ] = await Promise.all([
    prisma.order.count({ where: { createdAt: { gte: today } } }),
    prisma.order.findMany({
      include: { affiliate: { include: { user: true } }, lines: true },
    }),
    prisma.user.count({ where: { role: "AFFILIATE", status: "ACTIVE" } }),
    prisma.product.count({ where: { published: true } }),
    prisma.ticket.count({ where: { status: { not: "CLOSED" } } }),
    prisma.payoutRequest.aggregate({
      where: { status: { in: ["PENDING", "APPROVED"] } },
      _sum: { amount: true },
    }),
  ]);
  const confirmed = allOrders.filter(
    (order) => order.confirmationStatus === "CONFIRMED",
  ).length;
  const confirmationDecisions = allOrders.filter((order) =>
    ["CONFIRMED", "CANCELLED", "UNREACHABLE"].includes(
      order.confirmationStatus,
    ),
  ).length;
  const delivered = allOrders.filter(
    (order) => order.deliveryStatus === "DELIVERED",
  ).length;
  const completedDeliveries = allOrders.filter((order) =>
    ["DELIVERED", "RETURNED", "REFUSED"].includes(order.deliveryStatus),
  ).length;
  const revenue = allOrders
    .filter((order) => order.deliveryStatus === "DELIVERED")
    .reduce(
      (sum, order) =>
        sum +
        order.lines.reduce(
          (lineSum, line) => lineSum + Number(line.salePrice) * line.quantity,
          0,
        ),
      0,
    );
  const commission = allOrders
    .filter(
      (order) =>
        order.deliveryStatus === "DELIVERED" && order.financeStatus !== "PAID",
    )
    .flatMap((order) => order.lines)
    .reduce((sum, line) => sum + Number(line.commission) * line.quantity, 0);
  const metrics = [
    [PackageCheck, "ordersToday", String(ordersToday)],
    [
      Percent,
      "confirmationRate",
      confirmationDecisions
        ? `${Math.round((confirmed / confirmationDecisions) * 100)}%`
        : "0%",
    ],
    [
      Truck,
      "deliveryRate",
      completedDeliveries
        ? `${Math.round((delivered / completedDeliveries) * 100)}%`
        : "0%",
    ],
    [Banknote, "codRevenue", formatMoney(revenue, locale)],
    [BadgeDollarSign, "commissionOwed", formatMoney(commission, locale)],
    [
      WalletCards,
      "payoutsPending",
      formatMoney(String(pendingPayouts._sum.amount ?? 0), locale),
    ],
    [Users, "activeAffiliates", String(activeAffiliates)],
    [PackageCheck, "publishedProducts", String(publishedProducts)],
    [WalletCards, "openTickets", String(openTickets)],
  ] as const;
  const now = new Date();
  const chart = Array.from({ length: 6 }, (_, offset) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - offset), 1);
    const next = new Date(date.getFullYear(), date.getMonth() + 1, 1);
    const rows = allOrders.filter(
      (order) => order.createdAt >= date && order.createdAt < next,
    );
    return {
      month: new Intl.DateTimeFormat(locale, { month: "short" }).format(date),
      orders: rows.length,
      delivered: rows.filter((order) => order.deliveryStatus === "DELIVERED")
        .length,
    };
  });
  const affiliateCounts = new Map<string, number>();
  const productCounts = new Map<string, number>();
  for (const order of allOrders.filter(
    (item) => item.deliveryStatus === "DELIVERED",
  )) {
    affiliateCounts.set(
      order.affiliate.user.name,
      (affiliateCounts.get(order.affiliate.user.name) ?? 0) + 1,
    );
    for (const line of order.lines) {
      const name =
        locale === "ar"
          ? line.productNameAr || line.productNameFr
          : line.productNameFr;
      productCounts.set(name, (productCounts.get(name) ?? 0) + line.quantity);
    }
  }
  const topAffiliates = [...affiliateCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const topProducts = [...productCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  return (
    <main>
      <div className="dashboard-heading">
        <div>
          <p className="app-kicker">{t("area")}</p>
          <h1>{t("title")}</h1>
          <p>{t("body")}</p>
        </div>
      </div>
      <div className="metric-grid metric-grid--admin">
        {metrics.map(([Icon, label, value]) => (
          <article className="metric-card" key={label}>
            <span className="metric-card__icon">
              <Icon size={19} />
            </span>
            <p>{t(label)}</p>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
      <div className="dashboard-data-grid dashboard-data-grid--equal">
        <section className="data-panel">
          <h2>{t("operationalSnapshot")}</h2>
          <PerformanceChart data={chart} />
        </section>
        <section className="data-panel">
          <h2>{t("topAffiliates")}</h2>
          <div className="rank-list">
            {topAffiliates.map(([name, count], index) => (
              <div key={name}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{name}</strong>
                <b>{count}</b>
              </div>
            ))}
          </div>
          <h2 className="subsection-title">{t("topProducts")}</h2>
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
    </main>
  );
}
