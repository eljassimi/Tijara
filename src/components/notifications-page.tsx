import { Bell } from "lucide-react";
import { getTranslations } from "next-intl/server";

import {
  FormNotice,
  StatusPill,
  WorkflowHeader,
} from "@/components/workflow-ui";
import { Link } from "@/i18n/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/server/auth/session";
import { markNotificationsReadAction } from "@/server/notifications/actions";

export async function NotificationsPage({
  locale,
  area,
  status,
}: {
  locale: "fr" | "ar";
  area: "admin" | "app/partner";
  status?: string;
}) {
  const user = await requireUser(locale);
  const [t, notificationText, notifications] = await Promise.all([
    getTranslations("Workflow"),
    getTranslations("Notifications"),
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  const renderMessage = (key: string, data: unknown) => {
    try {
      return notificationText(
        key as never,
        (data && typeof data === "object" ? data : {}) as never,
      );
    } catch {
      return key;
    }
  };
  const itemHref = (type: string, data: unknown) => {
    const values =
      data && typeof data === "object" && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : {};
    if (area === "admin") {
      if (type === "PAYOUT_STATUS" || type === "PAYOUT_REQUEST") {
        if (
          typeof values.reference === "string" &&
          values.reference.startsWith("CPAY-")
        ) {
          // Confirmator payouts: agents use their payments page; finance uses the queue.
          if (user.role === "CONFIRMATION_AGENT") {
            return "/admin/confirmation/payments" as const;
          }
          return "/admin/confirmator-payouts" as const;
        }
        return "/admin/finance" as const;
      }
      if (type === "TICKET_REPLY" || type === "TICKET_CREATED")
        return "/admin/support" as const;
      if (type === "ORDER_ASSIGNED" || type === "ORDER_STATUS")
        return "/admin/confirmation" as const;
      if (type === "CHAT_MESSAGE" && typeof values.conversationId === "string")
        return `/admin/chat?c=${values.conversationId}` as const;
      if (type === "CHAT_MESSAGE") return "/admin/chat" as const;
      if (type === "ANNOUNCEMENT") return "/admin/content" as const;
      return null;
    }
    if (typeof values.orderId === "string")
      return `/app/partner/orders/${values.orderId}` as const;
    if (typeof values.ticketId === "string")
      return `/app/partner/tickets/${values.ticketId}` as const;
    if (type === "PAYOUT_STATUS" || type === "COMMISSION_CREDIT")
      return "/app/partner/wallet" as const;
    if (type === "ANNOUNCEMENT" || type === "ACCOUNT_STATUS")
      return "/app/partner/announcements" as const;
    if (type === "CHAT_MESSAGE" && typeof values.conversationId === "string")
      return `/app/partner/chat?c=${values.conversationId}` as const;
    if (type === "CHAT_MESSAGE") return "/app/partner/chat" as const;
    return null;
  };
  return (
    <main>
      <WorkflowHeader
        eyebrow={t("live")}
        title={t("notificationsTitle")}
        body={t("notificationsBody")}
        action={
          <form action={markNotificationsReadAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="area" value={area} />
            <button className="button button--primary" type="submit">
              {t("markAllRead")}
            </button>
          </form>
        }
      />
      <FormNotice status={status} messages={{ updated: t("statusUpdated") }} />
      <section className="notification-list">
        {notifications.length ? (
          notifications.map((item) => {
            const href = itemHref(item.type, item.data);
            const data =
              item.data &&
              typeof item.data === "object" &&
              !Array.isArray(item.data)
                ? (item.data as Record<string, unknown>)
                : {};
            const proofUrl =
              typeof data.proofUrl === "string" ? data.proofUrl : null;
            return (
              <article key={item.id} className={item.readAt ? "" : "is-unread"}>
                <Bell size={18} />
                <div>
                  <strong>{renderMessage(item.titleKey, item.data)}</strong>
                  <p>{renderMessage(item.bodyKey, item.data)}</p>
                  <small>
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                      hourCycle: "h23",
                    }).format(item.createdAt)}
                  </small>
                  {proofUrl ? (
                    <a
                      className="payout-proof-link"
                      href={proofUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img
                        src={proofUrl}
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
                <StatusPill>{item.readAt ? t("read") : t("unread")}</StatusPill>
                {href ? (
                  <Link
                    className="notification-card__link"
                    href={href}
                    aria-label={renderMessage(item.titleKey, item.data)}
                  />
                ) : null}
              </article>
            );
          })
        ) : (
          <p className="queue-empty">{t("noRecords")}</p>
        )}
      </section>
    </main>
  );
}
