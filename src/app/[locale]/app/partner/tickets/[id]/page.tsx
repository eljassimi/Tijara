import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import {
  FormNotice,
  StatusPill,
  WorkflowHeader,
} from "@/components/workflow-ui";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/server/auth/session";
import { affiliateIdFor } from "@/server/orders/service";
import { replyPartnerTicketAction } from "@/server/operations/actions";
import { statusLabel } from "@/lib/status";

export default async function TicketDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "fr" | "ar"; id: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale, id } = await params;
  const { status } = await searchParams;
  const user = await requirePermission(locale, "orders:view");
  const affiliateId = await affiliateIdFor(user.id, user.role);
  const [t, ticket] = await Promise.all([
    getTranslations("Workflow"),
    prisma.ticket.findFirst({
      where: { id, affiliateId },
      include: {
        order: true,
        messages: { include: { author: true }, orderBy: { createdAt: "asc" } },
      },
    }),
  ]);
  if (!ticket) notFound();
  return (
    <main>
      <WorkflowHeader
        eyebrow={`${ticket.code} · ${ticket.type === "CLAIM" ? (locale === "ar" ? "شكاية" : "Réclamation") : "Support"}`}
        title={ticket.subject}
        body={
          ticket.order?.code ??
          (locale === "ar" ? "طلب دعم عام" : "Demande de support générale")
        }
        action={<StatusPill>{statusLabel(ticket.status, locale)}</StatusPill>}
      />
      <FormNotice
        status={status}
        messages={{
          updated:
            locale === "ar"
              ? "تم إرسال جوابك."
              : "Votre réponse a été envoyée.",
          invalid: t("invalid"),
        }}
      />
      <section className="ticket-thread">
        {ticket.messages.map((message) => (
          <article
            key={message.id}
            className={message.authorId === user.id ? "is-own" : ""}
          >
            <div>
              <strong>{message.author.name}</strong>
              <small>
                {new Intl.DateTimeFormat(locale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                  hourCycle: "h23",
                }).format(message.createdAt)}
              </small>
            </div>
            <p>{message.message}</p>
          </article>
        ))}
      </section>
      <form
        action={replyPartnerTicketAction}
        className="workflow-form section-gap"
      >
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="ticketId" value={ticket.id} />
        <label className="field workflow-form__span">
          <span>{t("reply")}</span>
          <textarea name="message" rows={4} required />
        </label>
        <button
          className="button button--primary workflow-form__submit"
          type="submit"
        >
          {t("sendReply")}
        </button>
      </form>
    </main>
  );
}
