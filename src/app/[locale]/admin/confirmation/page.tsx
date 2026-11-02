import {
  CheckCircle2,
  Clock3,
  LayoutDashboard,
  PhoneCall,
  RotateCcw,
  Search,
  ShoppingBag,
  UserRound,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ConfirmationStatus, Prisma } from "@prisma/client";

import { CustomSelect } from "@/components/ui/custom-select";
import { OperationsPagination } from "@/components/ui/operations-pagination";
import {
  FormNotice,
  StatusPill,
  WorkflowHeader,
} from "@/components/workflow-ui";
import { OrderLineVariant } from "@/components/orders/order-line-variant";
import { OperationsOrderSummary } from "@/components/orders/operations-order-summary";
import { Link } from "@/i18n/navigation";
import { cleanDemoLabel } from "@/lib/display-text";
import { formatMoney } from "@/lib/money";
import { customerOrderTotal } from "@/lib/order-totals";
import {
  confirmationFilterStatuses,
  operationsCardTone,
  orderLineInclude,
} from "@/lib/operations-status";
import { prisma } from "@/lib/prisma";
import { statusLabel } from "@/lib/status";
import { formatAppDateTime } from "@/lib/time";
import { requirePermission } from "@/server/auth/session";
import { confirmationAssignmentScope, listActiveConfirmationAgents } from "@/server/orders/confirmation-assignment";
import {
  assignConfirmationAgentAction,
  confirmationTransitionAction,
  distributeUnassignedConfirmationOrdersAction,
} from "@/server/orders/actions";
import { confirmationTransitions } from "@/server/orders/state-machine";

const PAGE_SIZE = 12;

function ageLabel(createdAt: Date, locale: "fr" | "ar") {
  const hours = Math.max(
    1,
    Math.floor((Date.now() - createdAt.getTime()) / 3_600_000),
  );
  if (hours < 24)
    return locale === "ar" ? `منذ ${hours} س` : `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return locale === "ar" ? `منذ ${days} ي` : `il y a ${days} j`;
}

type SearchParams = {
  status?: string;
  q?: string;
  confirmation?: string;
  page?: string;
  hpage?: string;
};

export default async function ConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "fr" | "ar" }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const user = await requirePermission(locale, "orders:confirm");
  const isAdmin = user.role === "SUPER_ADMIN";
  const isAgent = user.role === "CONFIRMATION_AGENT";
  const assignmentScope = confirmationAssignmentScope(user);

  const confirmationFilter = confirmationFilterStatuses.includes(
    query.confirmation as (typeof confirmationFilterStatuses)[number],
  )
    ? (query.confirmation as ConfirmationStatus)
    : undefined;
  const search = query.q?.trim() ?? "";
  const closedStatuses: ConfirmationStatus[] = [
    "CONFIRMED",
    "CANCELLED",
    "UNREACHABLE",
  ];
  const viewingClosed =
    confirmationFilter != null && closedStatuses.includes(confirmationFilter);

  const searchClause: Prisma.OrderWhereInput | undefined = search
    ? {
        OR: [
          { code: { contains: search } },
          { phone: { contains: search } },
          { customerName: { contains: search } },
          { address: { contains: search } },
          {
            city: {
              OR: [
                { nameFr: { contains: search } },
                { nameAr: { contains: search } },
              ],
            },
          },
        ],
      }
    : undefined;

  const queueWhere: Prisma.OrderWhereInput = {
    ...assignmentScope,
    confirmationStatus: confirmationFilter
      ? confirmationFilter
      : { notIn: closedStatuses },
    ...searchClause,
  };

  const orderInclude = {
    city: true,
    courier: true,
    confirmationAgent: { select: { id: true, name: true } },
    lines: { include: orderLineInclude },
    callAttempts: { orderBy: { createdAt: "desc" as const }, take: 3 },
    _count: { select: { callAttempts: true } },
  };

  const historyStatus: ConfirmationStatus =
    confirmationFilter === "CANCELLED" || confirmationFilter === "UNREACHABLE"
      ? confirmationFilter
      : "CONFIRMED";
  const showHistory =
    !confirmationFilter ||
    confirmationFilter === "CONFIRMED" ||
    confirmationFilter === "CANCELLED" ||
    confirmationFilter === "UNREACHABLE";

  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const historyPage = Math.max(
    1,
    Number.parseInt(query.hpage ?? "1", 10) || 1,
  );
  const historyWhere: Prisma.OrderWhereInput = {
    ...assignmentScope,
    confirmationStatus: historyStatus,
    ...searchClause,
  };

  const [
    t,
    orders,
    queueTotal,
    metrics,
    confirmedCount,
    historyOrders,
    historyTotal,
    agents,
    unassignedCount,
  ] = await Promise.all([
    getTranslations("Workflow"),
    prisma.order.findMany({
      where: viewingClosed ? { id: { in: [] } } : queueWhere,
      include: orderInclude,
      orderBy: { createdAt: "asc" },
      skip: viewingClosed ? 0 : (page - 1) * PAGE_SIZE,
      take: viewingClosed ? 0 : PAGE_SIZE,
    }),
    viewingClosed ? Promise.resolve(0) : prisma.order.count({ where: queueWhere }),
    prisma.order.findMany({
      where: {
        ...assignmentScope,
        confirmationStatus: { notIn: closedStatuses },
      },
      select: {
        confirmationStatus: true,
        _count: { select: { callAttempts: true } },
      },
    }),
    prisma.order.count({
      where: { ...assignmentScope, confirmationStatus: "CONFIRMED" },
    }),
    prisma.order.findMany({
      where: showHistory ? historyWhere : { id: { in: [] } },
      include: orderInclude,
      orderBy: [{ confirmedAt: "desc" }, { updatedAt: "desc" }],
      skip: showHistory ? (historyPage - 1) * PAGE_SIZE : 0,
      take: showHistory ? PAGE_SIZE : 0,
    }),
    showHistory
      ? prisma.order.count({ where: historyWhere })
      : Promise.resolve(0),
    isAdmin ? listActiveConfirmationAgents(prisma) : Promise.resolve([]),
    isAdmin
      ? prisma.order.count({
          where: {
            confirmationAgentId: null,
            confirmationStatus: { notIn: closedStatuses },
          },
        })
      : Promise.resolve(0),
  ]);

  const queuePages = Math.max(1, Math.ceil(queueTotal / PAGE_SIZE));
  const historyPages = Math.max(1, Math.ceil(historyTotal / PAGE_SIZE));
  const queueHref = (nextPage: number) => ({
    pathname: "/admin/confirmation" as const,
    query: {
      q: query.q,
      confirmation: query.confirmation,
      page: String(nextPage),
      hpage: query.hpage,
    },
  });
  const historyHref = (nextPage: number) => ({
    pathname: "/admin/confirmation" as const,
    query: {
      q: query.q,
      confirmation: query.confirmation,
      page: query.page,
      hpage: String(nextPage),
    },
  });

  const callbacks = metrics.filter(
    (order) => order.confirmationStatus === "CALL_BACK_LATER",
  ).length;
  const attempted = metrics.filter(
    (order) => order._count.callAttempts > 0,
  ).length;
  const statusOptions = confirmationFilterStatuses.map((item) => ({
    value: item,
    label: statusLabel(item, locale),
  }));
  const agentOptions = [
    {
      value: "",
      label: locale === "ar" ? "غير معيّن" : "Non attribué",
    },
    ...agents.map((agent) => ({
      value: agent.id,
      label: agent.name,
    })),
  ];

  return (
    <main>
      <WorkflowHeader
        eyebrow={t("live")}
        title={t("confirmationTitle")}
        body={
          isAgent
            ? locale === "ar"
              ? "تعرض هذه اللائحة فقط الطلبات المعيّنة لك. الأرباح والرسوم البيانية في لوحة المؤكد."
              : "Cette file ne montre que vos commandes. Consultez le tableau confirmateur pour vos gains et graphiques."
            : t("confirmationBody")
        }
        action={
          <Link
            className="button button--ghost button--compact"
            href="/admin/confirmation/dashboard"
          >
            <LayoutDashboard size={16} />
            {locale === "ar" ? "لوحة الأرباح" : "Tableau des gains"}
          </Link>
        }
      />
      <FormNotice
        status={query.status}
        messages={{
          updated:
            locale === "ar"
              ? "تم حفظ نتيجة المكالمة."
              : "Le résultat de l’appel a été enregistré.",
          assigned:
            locale === "ar"
              ? "تم تغيير مؤكد الطلب."
              : "Le confirmateur a été modifié.",
          distributed:
            locale === "ar"
              ? "تم توزيع الطلبات غير المعيّنة."
              : "Les commandes non attribuées ont été réparties.",
          "not-assigned":
            locale === "ar"
              ? "هذا الطلب معيّن لمؤكد آخر."
              : "Cette commande est attribuée à un autre confirmateur.",
          "assign-failed":
            locale === "ar"
              ? "تعذر تغيير المؤكد."
              : "Impossible de changer le confirmateur.",
          invalid: t("invalid"),
          "invalid-transition":
            locale === "ar"
              ? "لا يمكن تطبيق هذه النتيجة على الطلب."
              : "Ce résultat ne peut pas être appliqué à cette commande.",
        }}
      />

      <section
        className="operations-metrics"
        aria-label={locale === "ar" ? "ملخص اللائحة" : "Résumé de la file"}
      >
        <article>
          <ShoppingBag size={20} />
          <span>{locale === "ar" ? "في الانتظار" : "À traiter"}</span>
          <strong>{metrics.length}</strong>
        </article>
        <article>
          <RotateCcw size={20} />
          <span>{locale === "ar" ? "اتصال لاحق" : "À rappeler"}</span>
          <strong>{callbacks}</strong>
        </article>
        <article>
          <CheckCircle2 size={20} />
          <span>{locale === "ar" ? "مؤكدة" : "Confirmées"}</span>
          <strong>{confirmedCount}</strong>
        </article>
        <article>
          <PhoneCall size={20} />
          <span>{locale === "ar" ? "تم الاتصال بها" : "Déjà contactées"}</span>
          <strong>{attempted}</strong>
        </article>
      </section>

      {isAdmin && unassignedCount > 0 ? (
        <form
          action={distributeUnassignedConfirmationOrdersAction}
          className="filter-bar operations-filter-bar"
        >
          <input type="hidden" name="locale" value={locale} />
          <p>
            {locale === "ar"
              ? `${unassignedCount} طلب(ات) بدون مؤكد.`
              : `${unassignedCount} commande(s) sans confirmateur.`}
          </p>
          <button
            className="button button--primary button--compact"
            type="submit"
          >
            {locale === "ar"
              ? "توزيع تلقائي على المؤكدين"
              : "Répartir automatiquement"}
          </button>
        </form>
      ) : null}

      <form className="filter-bar operations-filter-bar" method="get">
        <label>
          <span>{locale === "ar" ? "بحث" : "Recherche"}</span>
          <input
            name="q"
            defaultValue={query.q}
          />
        </label>
        <label>
          <span>{locale === "ar" ? "الحالة" : "Statut"}</span>
          <CustomSelect
            name="confirmation"
            locale={locale}
            label={locale === "ar" ? "حالة التأكيد" : "Statut de confirmation"}
            defaultValue={confirmationFilter ?? ""}
            options={statusOptions}
          />
        </label>
        <button
          className="button button--primary button--compact"
          type="submit"
        >
          <Search size={16} />
          {locale === "ar" ? "تطبيق" : "Filtrer"}
        </button>
      </form>

      {!viewingClosed ? (
        <section className="operations-section">
          <div className="operations-section__heading">
            <div>
              <span>{locale === "ar" ? "الأقدم أولاً" : "Priorité"}</span>
              <h2>
                {locale === "ar" ? "طلبات تحتاج مكالمة" : "Commandes à appeler"}
              </h2>
            </div>
            <small>
              {queueTotal
                ? `${orders.length} / ${queueTotal}`
                : orders.length}
            </small>
          </div>
          <div className="operations-grid">
            {orders.length ? (
              orders.map((order) => {
                const total = customerOrderTotal(order.lines);
                return (
                  <article
                    className={operationsCardTone(order.confirmationStatus)}
                    key={order.id}
                  >
                    <header className="operations-card__header">
                      <div>
                        <strong>{order.code}</strong>
                        <span>
                          <Clock3 size={13} />
                          {ageLabel(order.createdAt, locale)}
                        </span>
                      </div>
                      <StatusPill status={order.confirmationStatus}>
                        {statusLabel(order.confirmationStatus, locale)}
                      </StatusPill>
                    </header>
                    {isAdmin ? (
                      <div className="operations-card__history">
                        <UserRound size={14} />
                        {order.confirmationAgent
                          ? order.confirmationAgent.name
                          : locale === "ar"
                            ? "غير معيّن"
                            : "Non attribué"}
                      </div>
                    ) : null}
                    <div className="operations-card__customer">
                      <strong>{order.customerName}</strong>
                      <a href={`tel:${order.phone}`} dir="ltr">
                        {order.phone}
                      </a>
                      <span>
                        {locale === "ar"
                          ? order.city.nameAr
                          : order.city.nameFr}
                        {order.address
                          ? ` · ${cleanDemoLabel(order.address)}`
                          : ""}
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
                    <div className="operations-card__history">
                      <PhoneCall size={14} />
                      {order._count.callAttempts}{" "}
                      {locale === "ar"
                        ? "محاولة اتصال"
                        : "tentative(s) au total"}
                    </div>
                    {isAdmin && agents.length ? (
                      <form
                        action={assignConfirmationAgentAction}
                        className="operations-card__action"
                      >
                        <input type="hidden" name="locale" value={locale} />
                        <input type="hidden" name="orderId" value={order.id} />
                        <div className="queue-form-field">
                          <span>
                            {locale === "ar" ? "المؤكد" : "Confirmateur"}
                          </span>
                          <CustomSelect
                            name="agentId"
                            label={
                              locale === "ar" ? "المؤكد" : "Confirmateur"
                            }
                            locale={locale}
                            defaultValue={order.confirmationAgentId ?? ""}
                            options={agentOptions}
                          />
                        </div>
                        <button
                          className="button button--ghost button--compact"
                          type="submit"
                        >
                          {locale === "ar" ? "تعيين" : "Attribuer"}
                        </button>
                      </form>
                    ) : null}
                    <form
                      action={confirmationTransitionAction}
                      className="operations-card__action operations-card__action--confirmation"
                    >
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="orderId" value={order.id} />
                      <div className="queue-form-field">
                        <span>{t("outcome")}</span>
                        <CustomSelect
                          name="to"
                          label={t("outcome")}
                          locale={locale}
                          options={confirmationTransitions[
                            order.confirmationStatus
                          ].map((outcome) => ({
                            value: outcome,
                            label: statusLabel(outcome, locale),
                          }))}
                          required
                        />
                      </div>
                      <label>
                        <span>{t("notes")}</span>
                        <input
                          name="note"
                        />
                      </label>
                      <button
                        className="button button--primary button--compact"
                        type="submit"
                      >
                        {locale === "ar" ? "حفظ النتيجة" : "Enregistrer"}
                      </button>
                    </form>
                  </article>
                );
              })
            ) : (
              <p className="queue-empty operations-grid__empty">
                {t("noRecords")}
              </p>
            )}
          </div>
          <OperationsPagination
            locale={locale}
            page={page}
            pages={queuePages}
            total={queueTotal}
            hrefForPage={queueHref}
          />
        </section>
      ) : null}

      {showHistory ? (
        <section className="operations-section">
          <div className="operations-section__heading">
            <div>
              <span>{locale === "ar" ? "للمراجعة" : "Historique"}</span>
              <h2>
                {historyStatus === "CANCELLED"
                  ? locale === "ar"
                    ? "طلبات ملغاة"
                    : "Commandes annulées"
                  : historyStatus === "UNREACHABLE"
                    ? locale === "ar"
                      ? "تعذر التأكيد"
                      : "Non confirmées"
                    : locale === "ar"
                      ? "طلبات مؤكدة"
                      : "Commandes confirmées"}
              </h2>
            </div>
            <small>
              {historyTotal
                ? `${historyOrders.length} / ${historyTotal}`
                : historyOrders.length}
            </small>
          </div>
          <div className="operations-grid">
            {historyOrders.length ? (
              historyOrders.map((order) => (
                <div key={order.id} className="operations-history-item">
                  <OperationsOrderSummary
                    locale={locale}
                    order={order}
                    toneStatus={order.confirmationStatus}
                    badgeStatus={order.confirmationStatus}
                    meta={[
                      order.confirmedAt
                        ? formatAppDateTime(order.confirmedAt, locale)
                        : ageLabel(order.createdAt, locale),
                      isAdmin && order.confirmationAgent
                        ? order.confirmationAgent.name
                        : null,
                      order.deliveryStatus === "DELIVERED" &&
                      order.confirmationReward != null
                        ? formatMoney(Number(order.confirmationReward), locale)
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  />
                  {isAdmin && agents.length ? (
                    <form
                      action={assignConfirmationAgentAction}
                      className="operations-card__action"
                    >
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="orderId" value={order.id} />
                      <div className="queue-form-field">
                        <span>
                          {locale === "ar" ? "المؤكد" : "Confirmateur"}
                        </span>
                        <CustomSelect
                          name="agentId"
                          label={
                            locale === "ar" ? "المؤكد" : "Confirmateur"
                          }
                          locale={locale}
                          defaultValue={order.confirmationAgentId ?? ""}
                          options={agentOptions}
                        />
                      </div>
                      <button
                        className="button button--ghost button--compact"
                        type="submit"
                      >
                        {locale === "ar" ? "تعيين" : "Attribuer"}
                      </button>
                    </form>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="queue-empty operations-grid__empty">
                {locale === "ar"
                  ? "لا توجد طلبات في هذا السجل بعد."
                  : "Aucune commande dans cet historique pour le moment."}
              </p>
            )}
          </div>
          <OperationsPagination
            locale={locale}
            page={historyPage}
            pages={historyPages}
            total={historyTotal}
            hrefForPage={historyHref}
          />
        </section>
      ) : null}
    </main>
  );
}
