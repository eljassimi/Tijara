import {
  Building2,
  CircleAlert,
  PackageCheck,
  Search,
  Truck,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { DeliveryStatus, Prisma } from "@prisma/client";

import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { PreserveScrollForm } from "@/components/preserve-scroll-form";
import { CustomSelect } from "@/components/ui/custom-select";
import { OperationsPagination } from "@/components/ui/operations-pagination";
import {
  FormNotice,
  StatusPill,
  WorkflowHeader,
} from "@/components/workflow-ui";
import { OrderLineVariant } from "@/components/orders/order-line-variant";
import { OperationsOrderSummary } from "@/components/orders/operations-order-summary";
import { cleanDemoLabel } from "@/lib/display-text";
import {
  logisticsFilterStatuses,
  operationsCardTone,
  orderLineInclude,
} from "@/lib/operations-status";
import { prisma } from "@/lib/prisma";
import { statusLabel } from "@/lib/status";
import { formatAppDateTime } from "@/lib/time";
import { requirePermission } from "@/server/auth/session";
import { confirmationAssignmentScope } from "@/server/orders/confirmation-assignment";
import {
  deliveryHandoffAction,
  deliveryTransitionAction,
} from "@/server/orders/actions";
import { deliveryTransitions } from "@/server/orders/state-machine";

const PAGE_SIZE = 12;

type SearchParams = {
  status?: string;
  ref?: string;
  q?: string;
  delivery?: string;
  page?: string;
  tpage?: string;
  hpage?: string;
};

export default async function LogisticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "fr" | "ar" }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const user = await requirePermission(locale, "orders:deliver");
  const assignmentScope = confirmationAssignmentScope(user);

  const deliveryFilter = logisticsFilterStatuses.includes(
    query.delivery as (typeof logisticsFilterStatuses)[number],
  )
    ? query.delivery
    : undefined;
  const search = query.q?.trim() ?? "";
  const closedDelivery: DeliveryStatus[] = [
    "DELIVERED",
    "RETURNED",
    "REFUSED",
  ];
  const viewingClosed =
    deliveryFilter != null &&
    closedDelivery.includes(deliveryFilter as DeliveryStatus);

  const searchClause: Prisma.OrderWhereInput | undefined = search
    ? {
        OR: [
          { code: { contains: search, mode: "insensitive" } },
          { phone: { contains: search, mode: "insensitive" } },
          { customerName: { contains: search, mode: "insensitive" } },
          { address: { contains: search, mode: "insensitive" } },
          { parcelCode: { contains: search, mode: "insensitive" } },
          {
            city: {
              OR: [
                { nameFr: { contains: search, mode: "insensitive" } },
                { nameAr: { contains: search, mode: "insensitive" } },
              ],
            },
          },
        ],
      }
    : undefined;

  const activeWhere: Prisma.OrderWhereInput = {
    ...assignmentScope,
    confirmationStatus: "CONFIRMED",
    deliveryStatus: { notIn: closedDelivery },
    ...searchClause,
  };

  const historyStatus: DeliveryStatus =
    deliveryFilter === "RETURNED" || deliveryFilter === "REFUSED"
      ? deliveryFilter
      : "DELIVERED";
  const showHistory =
    !deliveryFilter ||
    deliveryFilter === "DELIVERED" ||
    deliveryFilter === "RETURNED" ||
    deliveryFilter === "REFUSED";

  const orderInclude = {
    city: true,
    courier: true,
    lines: { include: orderLineInclude },
  };

  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const trackingPage = Math.max(
    1,
    Number.parseInt(query.tpage ?? "1", 10) || 1,
  );
  const historyPage = Math.max(
    1,
    Number.parseInt(query.hpage ?? "1", 10) || 1,
  );

  const readyWhere: Prisma.OrderWhereInput = {
    ...activeWhere,
    deliverySyncStatus: { in: ["NOT_SENT", "FAILED"] },
    ...(deliveryFilter === "AWAITING_PICKUP" ||
    deliveryFilter === "IN_TRANSIT" ||
    deliveryFilter === "NOT_DELIVERED"
      ? { deliveryStatus: deliveryFilter }
      : {}),
    ...(deliveryFilter === "NOT_SENT" || deliveryFilter === "FAILED"
      ? { deliverySyncStatus: deliveryFilter }
      : {}),
  };
  const trackingWhere: Prisma.OrderWhereInput = {
    ...activeWhere,
    deliverySyncStatus: { in: ["SENT_MANUALLY", "SYNCED"] },
    ...(deliveryFilter === "AWAITING_PICKUP" ||
    deliveryFilter === "IN_TRANSIT" ||
    deliveryFilter === "NOT_DELIVERED"
      ? { deliveryStatus: deliveryFilter }
      : {}),
  };
  const historyWhere: Prisma.OrderWhereInput = {
    ...assignmentScope,
    confirmationStatus: "CONFIRMED",
    deliveryStatus: historyStatus,
    ...searchClause,
  };

  const showReady =
    !viewingClosed &&
    (!deliveryFilter ||
      deliveryFilter === "NOT_SENT" ||
      deliveryFilter === "FAILED" ||
      deliveryFilter === "AWAITING_PICKUP" ||
      deliveryFilter === "IN_TRANSIT" ||
      deliveryFilter === "NOT_DELIVERED");
  const showTracking =
    !viewingClosed &&
    (!deliveryFilter ||
      deliveryFilter === "AWAITING_PICKUP" ||
      deliveryFilter === "IN_TRANSIT" ||
      deliveryFilter === "NOT_DELIVERED");

  const [
    t,
    ready,
    readyCount,
    tracking,
    trackingCount,
    companies,
    metrics,
    deliveredCount,
    historyOrders,
    historyTotal,
  ] = await Promise.all([
    getTranslations("Workflow"),
    prisma.order.findMany({
      where: showReady ? readyWhere : { id: { in: [] } },
      include: orderInclude,
      orderBy: { confirmedAt: "asc" },
      skip: showReady ? (page - 1) * PAGE_SIZE : 0,
      take: showReady ? PAGE_SIZE : 0,
    }),
    showReady ? prisma.order.count({ where: readyWhere }) : Promise.resolve(0),
    prisma.order.findMany({
      where: showTracking ? trackingWhere : { id: { in: [] } },
      include: orderInclude,
      orderBy: { confirmedAt: "asc" },
      skip: showTracking ? (trackingPage - 1) * PAGE_SIZE : 0,
      take: showTracking ? PAGE_SIZE : 0,
    }),
    showTracking
      ? prisma.order.count({ where: trackingWhere })
      : Promise.resolve(0),
    prisma.courier.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    }),
    prisma.order.findMany({
      where: {
        ...assignmentScope,
        confirmationStatus: "CONFIRMED",
        deliveryStatus: { notIn: closedDelivery },
      },
      select: { deliveryStatus: true, deliverySyncStatus: true },
    }),
    prisma.order.count({
      where: { ...assignmentScope, deliveryStatus: "DELIVERED" },
    }),
    prisma.order.findMany({
      where: showHistory ? historyWhere : { id: { in: [] } },
      include: orderInclude,
      orderBy: [{ deliveredAt: "desc" }, { updatedAt: "desc" }],
      skip: showHistory ? (historyPage - 1) * PAGE_SIZE : 0,
      take: showHistory ? PAGE_SIZE : 0,
    }),
    showHistory
      ? prisma.order.count({ where: historyWhere })
      : Promise.resolve(0),
  ]);

  const readyTotal = metrics.filter((order) =>
    ["NOT_SENT", "FAILED"].includes(order.deliverySyncStatus),
  ).length;
  const trackingTotal = metrics.filter((order) =>
    ["SENT_MANUALLY", "SYNCED"].includes(order.deliverySyncStatus),
  ).length;
  const inTransit = metrics.filter(
    (order) => order.deliveryStatus === "IN_TRANSIT",
  ).length;
  const readyPages = Math.max(1, Math.ceil(readyCount / PAGE_SIZE));
  const trackingPages = Math.max(1, Math.ceil(trackingCount / PAGE_SIZE));
  const historyPages = Math.max(1, Math.ceil(historyTotal / PAGE_SIZE));
  const defaultCourierId = companies.length === 1 ? companies[0].id : "";
  const statusOptions = logisticsFilterStatuses.map((item) => ({
    value: item,
    label: statusLabel(item, locale),
  }));
  const baseQuery = {
    q: query.q,
    delivery: query.delivery,
  };
  const readyHref = (nextPage: number) => ({
    pathname: "/admin/logistics" as const,
    query: {
      ...baseQuery,
      page: String(nextPage),
      tpage: query.tpage,
      hpage: query.hpage,
    },
  });
  const trackingHref = (nextPage: number) => ({
    pathname: "/admin/logistics" as const,
    query: {
      ...baseQuery,
      page: query.page,
      tpage: String(nextPage),
      hpage: query.hpage,
    },
  });
  const historyHref = (nextPage: number) => ({
    pathname: "/admin/logistics" as const,
    query: {
      ...baseQuery,
      page: query.page,
      tpage: query.tpage,
      hpage: String(nextPage),
    },
  });

  return (
    <main>
      <WorkflowHeader
        eyebrow={t("live")}
        title={t("logisticsTitle")}
        body={t("logisticsBody")}
      />
      <FormNotice
        status={query.status}
        messages={{
          "sent-to-company":
            locale === "ar"
              ? "تم تسجيل إرسال الطلب إلى شركة التوصيل."
              : "La remise à la société de livraison a été enregistrée.",
          updated:
            locale === "ar"
              ? "تم تحديث حالة التوصيل."
              : "Le statut de livraison a été mis à jour.",
          invalid:
            locale === "ar"
              ? "تحقق من الحقول: الشركة مطلوبة."
              : "Vérifiez les champs : la société de livraison est obligatoire.",
          "handoff-company-required":
            locale === "ar"
              ? "اختر شركة التوصيل قبل تعليم الطلب كـ مُرسل."
              : "Choisissez une société de livraison avant de marquer la commande comme envoyée.",
          "handoff-company-inactive":
            locale === "ar"
              ? "شركة التوصيل غير موجودة أو غير نشطة. اختر شركة أخرى من القائمة."
              : "Cette société de livraison est introuvable ou inactive. Choisissez une autre société.",
          "handoff-not-confirmed":
            locale === "ar"
              ? "لا يمكن الإرسال: الطلب غير مؤكد بعد. أكّده أولاً من صفحة التأكيد."
              : "Envoi impossible : la commande n’est pas encore confirmée. Confirmez-la d’abord.",
          "handoff-already-sent":
            locale === "ar"
              ? "تم إرسال هذا الطلب إلى شركة التوصيل مسبقاً."
              : "Cette commande a déjà été remise à une société de livraison.",
          "handoff-order-closed":
            locale === "ar"
              ? "لا يمكن الإرسال: الطلب مسلم أو مرتجع أو مرفوض."
              : "Envoi impossible : la commande est déjà livrée, retournée ou refusée.",
          "handoff-duplicate-parcel":
            locale === "ar"
              ? `رمز الطرد مستخدم بالفعل في الطلب ${query.ref || "آخر"}. استخدم رمزاً مختلفاً.`
              : `Ce code colis est déjà utilisé sur la commande ${query.ref || "existante"}. Choisissez un autre code.`,
          "handoff-forbidden":
            locale === "ar"
              ? "ليس لديك صلاحية لإرسال الطلبات إلى شركات التوصيل."
              : "Vous n’avez pas l’autorisation d’envoyer des commandes aux sociétés de livraison.",
          "handoff-failed":
            locale === "ar"
              ? "تعذر إرسال الطلب. تحقق من شركة التوصيل وحالة الطلب ثم أعد المحاولة."
              : "Impossible d’envoyer la commande. Vérifiez la société de livraison et l’état du dossier, puis réessayez.",
          "invalid-transition":
            locale === "ar"
              ? "هذا التغيير غير مسموح في حالة الطلب الحالية."
              : "Ce changement n’est pas permis depuis l’état actuel.",
        }}
      />

      <section
        className="operations-metrics"
        aria-label={locale === "ar" ? "ملخص التسليم" : "Résumé des remises"}
      >
        <article>
          <PackageCheck size={20} />
          <span>{locale === "ar" ? "جاهزة للإرسال" : "Prêtes à envoyer"}</span>
          <strong>{readyTotal}</strong>
        </article>
        <article>
          <Building2 size={20} />
          <span>{locale === "ar" ? "عند الشركات" : "Chez les sociétés"}</span>
          <strong>{trackingTotal}</strong>
        </article>
        <article>
          <Truck size={20} />
          <span>{locale === "ar" ? "قيد التوصيل" : "En livraison"}</span>
          <strong>{inTransit}</strong>
        </article>
        <article>
          <PackageCheck size={20} />
          <span>{locale === "ar" ? "مُسلّمة" : "Livrées"}</span>
          <strong>{deliveredCount}</strong>
        </article>
      </section>

      <form className="filter-bar operations-filter-bar" method="get">
        <label>
          <span>{locale === "ar" ? "بحث" : "Recherche"}</span>
          <input
            name="q"
            defaultValue={query.q}
            placeholder={
              locale === "ar"
                ? "الرمز، الهاتف، الزبون أو المدينة"
                : "Code, téléphone, client ou ville"
            }
          />
        </label>
        <label>
          <span>{locale === "ar" ? "الحالة" : "Statut"}</span>
          <CustomSelect
            name="delivery"
            locale={locale}
            label={locale === "ar" ? "حالة التوصيل" : "Statut de livraison"}
            defaultValue={deliveryFilter ?? ""}
            placeholder={locale === "ar" ? "الكل" : "Tous"}
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

      {!companies.length && readyTotal ? (
        <div className="operations-warning">
          <CircleAlert size={18} />
          <p>
            {locale === "ar"
              ? "لا توجد شركة توصيل نشطة. اطلب من المدير إضافتها أولاً."
              : "Aucune société de livraison active. Un administrateur doit d’abord en ajouter une."}
          </p>
        </div>
      ) : null}

      {showReady ? (
      <section className="operations-section">
        <div className="operations-section__heading">
          <div>
            <span>{locale === "ar" ? "الخطوة 1" : "Étape 1"}</span>
            <h2>
              {locale === "ar"
                ? "تسليم الطلبات للشركة"
                : "Remettre à une société"}
            </h2>
          </div>
          <small>
            {readyCount ? `${ready.length} / ${readyCount}` : ready.length}
          </small>
        </div>
        <div className="operations-grid">
          {ready.length ? (
            ready.map((order) => (
              <article
                className={operationsCardTone(order.deliverySyncStatus)}
                id={`order-${order.id}`}
                key={order.id}
              >
                <header className="operations-card__header">
                  <div>
                    <strong>{order.code}</strong>
                    <span>
                      {locale === "ar" ? order.city.nameAr : order.city.nameFr}
                    </span>
                  </div>
                  <StatusPill status={order.deliverySyncStatus}>
                    {statusLabel(order.deliverySyncStatus, locale)}
                  </StatusPill>
                </header>
                <div className="operations-card__customer">
                  <strong>{order.customerName}</strong>
                  <a href={`tel:${order.phone}`} dir="ltr">
                    {order.phone}
                  </a>
                  <span>
                    {order.address ? cleanDemoLabel(order.address) : "—"}
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
                </div>
                <PreserveScrollForm
                  action={deliveryHandoffAction}
                  className="operations-card__action operations-card__action--handoff"
                >
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="orderId" value={order.id} />
                  <div className="queue-form-field">
                    <span>
                      {locale === "ar"
                        ? "شركة التوصيل"
                        : "Société de livraison"}
                    </span>
                    <CustomSelect
                      name="courierId"
                      label={t("courier")}
                      locale={locale}
                      defaultValue={defaultCourierId}
                      placeholder={
                        locale === "ar" ? "اختر الشركة" : "Choisir la société"
                      }
                      options={companies.map((company) => ({
                        value: company.id,
                        label: company.name,
                      }))}
                      required
                    />
                  </div>
                  <label>
                    <span>{t("parcelCode")}</span>
                    <input
                      name="parcelCode"
                      placeholder={
                        locale === "ar"
                          ? "اختياري الآن"
                          : "Facultatif pour le moment"
                      }
                    />
                  </label>
                  <label>
                    <span>{t("notes")}</span>
                    <input
                      name="note"
                      placeholder={
                        locale === "ar" ? "ملاحظة داخلية" : "Note interne"
                      }
                    />
                  </label>
                  <button
                    className="button button--primary button--compact"
                    type="submit"
                    disabled={!companies.length}
                  >
                    {locale === "ar"
                      ? "تسجيل الإرسال"
                      : "Marquer comme envoyée"}
                  </button>
                </PreserveScrollForm>
              </article>
            ))
          ) : (
            <p className="queue-empty operations-grid__empty">
              {locale === "ar"
                ? "لا توجد طلبات جاهزة للإرسال."
                : "Aucune commande à remettre."}
            </p>
          )}
        </div>
        <OperationsPagination
          locale={locale}
          page={page}
          pages={readyPages}
          total={readyCount}
          hrefForPage={readyHref}
        />
      </section>
      ) : null}

      {showTracking ? (
      <section className="operations-section">
        <div className="operations-section__heading">
          <div>
            <span>{locale === "ar" ? "الخطوة 2" : "Étape 2"}</span>
            <h2>
              {locale === "ar" ? "متابعة حالات التوصيل" : "Suivre la livraison"}
            </h2>
          </div>
          <small>
            {trackingCount
              ? `${tracking.length} / ${trackingCount}`
              : tracking.length}
          </small>
        </div>
        <div className="operations-grid">
          {tracking.length ? (
            tracking.map((order) => {
              const transitions = deliveryTransitions[order.deliveryStatus];
              return (
                <article
                  className={operationsCardTone(order.deliveryStatus)}
                  id={`order-${order.id}`}
                  key={order.id}
                >
                  <header className="operations-card__header">
                    <div>
                      <strong>{order.code}</strong>
                      <span>{order.courier?.name ?? "—"}</span>
                    </div>
                    <StatusPill status={order.deliveryStatus}>
                      {statusLabel(order.deliveryStatus, locale)}
                    </StatusPill>
                  </header>
                  <div className="operations-card__customer">
                    <strong>{order.customerName}</strong>
                    <a href={`tel:${order.phone}`} dir="ltr">
                      {order.phone}
                    </a>
                    <span>
                      {locale === "ar" ? order.city.nameAr : order.city.nameFr}{" "}
                      ·{" "}
                      {order.parcelCode ??
                        (locale === "ar" ? "بدون رمز طرد" : "Sans code colis")}
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
                  </div>
                  <PreserveScrollForm
                    action={deliveryTransitionAction}
                    className="operations-card__action operations-card__action--tracking"
                  >
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="orderId" value={order.id} />
                    <div className="queue-form-field">
                      <span>{t("deliveryStatus")}</span>
                      <CustomSelect
                        name="to"
                        label={t("deliveryStatus")}
                        locale={locale}
                        placeholder={
                          locale === "ar"
                            ? "اختر الحالة الجديدة"
                            : "Choisir le nouvel état"
                        }
                        options={transitions.map((item) => ({
                          value: item,
                          label: statusLabel(item, locale),
                        }))}
                        required
                        disabled={!transitions.length}
                      />
                    </div>
                    <label>
                      <span>{t("notes")}</span>
                      <input
                        name="note"
                        placeholder={
                          locale === "ar"
                            ? "ملاحظة اختيارية"
                            : "Note facultative"
                        }
                      />
                    </label>
                    <ConfirmSubmitButton
                      locale={locale}
                      confirmTitle={
                        locale === "ar"
                          ? "تحديث حالة التوصيل"
                          : "Mettre à jour la livraison"
                      }
                      confirmMessage={
                        locale === "ar"
                          ? `هل تريد حفظ الحالة الجديدة للطلب ${order.code}؟`
                          : `Enregistrer le nouvel état pour la commande ${order.code} ?`
                      }
                      confirmLabel={
                        locale === "ar" ? "حفظ الحالة" : "Enregistrer"
                      }
                      className="button button--primary button--compact"
                      type="submit"
                      disabled={!transitions.length}
                    >
                      {locale === "ar" ? "تحديث الحالة" : "Mettre à jour"}
                    </ConfirmSubmitButton>
                  </PreserveScrollForm>
                </article>
              );
            })
          ) : (
            <p className="queue-empty operations-grid__empty">
              {locale === "ar"
                ? "لم يتم إرسال أي طلب بعد."
                : "Aucune commande remise pour le moment."}
            </p>
          )}
        </div>
        <OperationsPagination
          locale={locale}
          page={trackingPage}
          pages={trackingPages}
          total={trackingCount}
          hrefForPage={trackingHref}
        />
      </section>
      ) : null}

      {showHistory ? (
        <section className="operations-section">
          <div className="operations-section__heading">
            <div>
              <span>{locale === "ar" ? "للمراجعة" : "Historique"}</span>
              <h2>
                {historyStatus === "RETURNED"
                  ? locale === "ar"
                    ? "طلبات مرتجعة"
                    : "Commandes retournées"
                  : historyStatus === "REFUSED"
                    ? locale === "ar"
                      ? "طلبات مرفوضة"
                      : "Commandes refusées"
                    : locale === "ar"
                      ? "طلبات مُسلّمة"
                      : "Commandes livrées"}
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
                <OperationsOrderSummary
                  key={order.id}
                  locale={locale}
                  order={order}
                  toneStatus={order.deliveryStatus}
                  badgeStatus={order.deliveryStatus}
                  meta={
                    order.deliveredAt
                      ? formatAppDateTime(order.deliveredAt, locale)
                      : order.confirmedAt
                        ? formatAppDateTime(order.confirmedAt, locale)
                        : null
                  }
                />
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
