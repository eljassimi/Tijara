import { getTranslations } from "next-intl/server";
import { Headphones, MessageCircle, Phone } from "lucide-react";

import {
  FormNotice,
  StatusPill,
  WorkflowHeader,
} from "@/components/workflow-ui";
import { prisma } from "@/lib/prisma";
import { statusLabel } from "@/lib/status";
import { requirePermission } from "@/server/auth/session";
import { createTicketAction } from "@/server/operations/actions";
import { affiliateIdFor } from "@/server/orders/service";
import { Link } from "@/i18n/navigation";
import { CustomSelect } from "@/components/ui/custom-select";

export default async function TicketsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "fr" | "ar" }>;
  searchParams: Promise<{ status?: string; order?: string }>;
}) {
  const { locale } = await params;
  const { status, order: requestedOrder } = await searchParams;
  const user = await requirePermission(locale, "orders:view");
  const affiliateId = await affiliateIdFor(user.id, user.role);
  const [t, tickets, orders, affiliate] = await Promise.all([
    getTranslations("Workflow"),
    prisma.ticket.findMany({
      where: { affiliateId },
      include: { messages: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.order.findMany({
      where: {
        affiliateId,
        deliveryStatus: { in: ["IN_TRANSIT", "DELIVERED", "RETURNED"] },
      },
      select: { id: true, code: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.affiliateProfile.findUniqueOrThrow({
      where: { id: affiliateId },
      include: { supportAgent: { include: { user: true } } },
    }),
  ]);
  const agent = affiliate.supportAgent;
  return (
    <main>
      <WorkflowHeader
        eyebrow={t("live")}
        title={t("ticketsTitle")}
        body={t("ticketsBody")}
      />
      <FormNotice
        status={status}
        messages={{
          created:
            locale === "ar"
              ? "تم إنشاء طلب المساعدة."
              : "Demande d’aide créée.",
          invalid: t("invalid"),
        }}
      />
      <section className="detail-card support-agent-card help-agent-card">
        <Headphones size={28} />
        <div>
          <h2>{locale === "ar" ? "مسؤول المساعدة" : "Votre agent d’aide"}</h2>
          {agent ? (
            <strong>{agent.user.name}</strong>
          ) : (
            <p>
              {locale === "ar"
                ? "سيتم تعيين مسؤول لحسابك قريباً."
                : "Un agent sera bientôt affecté à votre compte."}
            </p>
          )}
        </div>
        {agent ? (
          <nav>
            <a href={`tel:${agent.phone}`}>
              <Phone size={16} />
              {agent.phone}
            </a>
            <a
              href={`https://wa.me/${agent.whatsapp.replace(/\D/g, "")}`}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle size={16} />
              WhatsApp
            </a>
          </nav>
        ) : null}
      </section>
      <form action={createTicketAction} className="workflow-form">
        <input type="hidden" name="locale" value={locale} />
        <div className="field">
          <span>{locale === "ar" ? "النوع" : "Type"}</span>
          <CustomSelect
            name="type"
            label={locale === "ar" ? "النوع" : "Type"}
            locale={locale}
            defaultValue={requestedOrder ? "CLAIM" : "SUPPORT"}
            options={[
              { value: "SUPPORT", label: "Support" },
              {
                value: "CLAIM",
                label:
                  locale === "ar" ? "شكاية حول طلب" : "Réclamation commande",
              },
            ]}
          />
        </div>
        <label className="field">
          <span>{t("subject")}</span>
          <input name="subject" required />
        </label>
        <div className="field">
          <span>{t("linkedOrder")}</span>
          <CustomSelect
            name="orderId"
            label={t("linkedOrder")}
            locale={locale}
            defaultValue={requestedOrder ?? ""}
            options={[
              { value: "", label: "—" },
              ...orders.map((order) => ({
                value: order.id,
                label: order.code,
              })),
            ]}
          />
        </div>
        <label className="field workflow-form__span">
          <span>{t("message")}</span>
          <textarea name="message" rows={5} required />
        </label>
        <button
          className="button button--primary workflow-form__submit"
          type="submit"
        >
          {t("createTicket")}
        </button>
      </form>
      <section className="workflow-table-card section-gap">
        <div className="workflow-table workflow-table--tickets">
          <div className="workflow-table__row workflow-table__head">
            <span>{t("reference")}</span>
            <span>{t("subject")}</span>
            <span>{t("status")}</span>
          </div>
          {tickets.map((ticket) => (
            <div className="workflow-table__row" key={ticket.id}>
              <strong>
                <Link href={`/app/partner/tickets/${ticket.id}`}>
                  {ticket.code}
                </Link>
                <small>
                  {ticket.type === "CLAIM"
                    ? locale === "ar"
                      ? "شكاية"
                      : "Réclamation"
                    : "Support"}
                </small>
              </strong>
              <span>
                {ticket.subject}
                <small>
                  {ticket.messages.length}{" "}
                  {locale === "ar"
                    ? "رسائل"
                    : ticket.messages.length === 1
                      ? "message"
                      : "messages"}
                </small>
              </span>
              <StatusPill>{statusLabel(ticket.status, locale)}</StatusPill>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
