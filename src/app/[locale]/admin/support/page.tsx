import { getTranslations } from "next-intl/server";

import {
  FormNotice,
  StatusPill,
  WorkflowHeader,
} from "@/components/workflow-ui";
import { prisma } from "@/lib/prisma";
import { statusLabel } from "@/lib/status";
import { requirePermission } from "@/server/auth/session";
import { replyTicketAction } from "@/server/operations/actions";
import { CustomSelect } from "@/components/ui/custom-select";

export default async function AdminSupportPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "fr" | "ar" }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale } = await params;
  const { status } = await searchParams;
  await requirePermission(locale, "support:manage");
  const [t, tickets] = await Promise.all([
    getTranslations("Workflow"),
    prisma.ticket.findMany({
      include: {
        affiliate: { include: { user: true } },
        messages: { include: { author: true }, orderBy: { createdAt: "asc" } },
        order: true,
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return (
    <main>
      <WorkflowHeader
        eyebrow={t("live")}
        title={t("supportTitle")}
        body={t("supportBody")}
      />
      <FormNotice
        status={status}
        messages={{ updated: t("statusUpdated"), invalid: t("invalid") }}
      />
      <div className="work-queue">
        {tickets.length ? (
          tickets.map((ticket) => (
            <article className="queue-card" key={ticket.id}>
              <div className="queue-card__summary">
                <div>
                  <strong>
                    {ticket.code} · {ticket.subject}
                  </strong>
                  <span>
                    {ticket.affiliate.user.name}
                    {ticket.order ? ` · ${ticket.order.code}` : ""}
                  </span>
                  <small>{ticket.messages.at(-1)?.message}</small>
                </div>
                <StatusPill>{statusLabel(ticket.status, locale)}</StatusPill>
              </div>
              <form action={replyTicketAction} className="queue-card__form">
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="ticketId" value={ticket.id} />
                <div className="queue-form-field">
                  <span>{t("status")}</span>
                  <CustomSelect
                    name="status"
                    label={t("status")}
                    locale={locale}
                    defaultValue={ticket.status}
                    options={(["OPEN", "IN_PROGRESS", "CLOSED"] as const).map(
                      (value) => ({
                        value,
                        label: statusLabel(value, locale),
                      }),
                    )}
                  />
                </div>
                <label>
                  <span>{t("reply")}</span>
                  <input name="message" required />
                </label>
                <button
                  className="button button--primary button--compact"
                  type="submit"
                >
                  {t("sendReply")}
                </button>
              </form>
            </article>
          ))
        ) : (
          <p className="queue-empty">{t("noRecords")}</p>
        )}
      </div>
    </main>
  );
}
