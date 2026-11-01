import { BadgeDollarSign, WalletCards } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { PayoutHistoryCard } from "@/components/payouts/payout-history-card";
import {
  FormNotice,
  StatusPill,
  WorkflowHeader,
} from "@/components/workflow-ui";
import { Link } from "@/i18n/navigation";
import { formatMoney } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { statusLabel } from "@/lib/status";
import { requireRole } from "@/server/auth/session";
import { requestConfirmatorPayoutAction } from "@/server/operations/actions";
import { confirmatorAvailableBalance } from "@/server/payouts/confirmator";

export default async function ConfirmatorPaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "fr" | "ar" }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale } = await params;
  const { status } = await searchParams;
  const user = await requireRole(locale, ["CONFIRMATION_AGENT"]);
  const [t, balance, payouts, profile] = await Promise.all([
    getTranslations("Workflow"),
    confirmatorAvailableBalance(user.id),
    prisma.confirmatorPayoutRequest.findMany({
      where: { agentId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { bankName: true, rib: true },
    }),
  ]);
  const hasOpen = payouts.some(
    (item) => item.status === "PENDING" || item.status === "APPROVED",
  );
  const hasBank = Boolean(profile.bankName?.trim() && profile.rib?.trim());
  const available = Number(balance.available);
  const earned = Number(balance.earned);
  const reserved = Number(balance.reserved);
  const maskedRib = profile.rib
    ? `•••• •••• •••• •••• •••• ${profile.rib.slice(-4)}`
    : "—";
  const openPayouts = payouts.filter(
    (item) => item.status === "PENDING" || item.status === "APPROVED",
  );
  const history = payouts.filter(
    (item) => item.status === "PAID" || item.status === "REJECTED",
  );

  return (
    <main>
      <WorkflowHeader
        eyebrow={t("live")}
        title={locale === "ar" ? "طلب تحويل الأرباح" : "Demande de virement"}
        body={
          locale === "ar"
            ? "اطلب تحويل أرباح التأكيد. البنك وRIB محفوظان في الإعدادات."
            : "Demandez le virement de vos gains. Banque et RIB sont enregistrés dans Paramètres."
        }
        action={
          <Link
            className="button button--ghost button--compact"
            href="/admin/settings?tab=bank"
          >
            {locale === "ar" ? "تعديل البنك" : "Modifier la banque"}
          </Link>
        }
      />
      <FormNotice
        status={status}
        messages={{
          requested:
            locale === "ar"
              ? "تم إرسال طلب التحويل."
              : "Demande de virement envoyée.",
          invalid: t("invalid"),
          insufficient:
            locale === "ar"
              ? "المبلغ أكبر من الرصيد المتاح."
              : "Le montant dépasse le solde disponible.",
          "open-request":
            locale === "ar"
              ? "لديك طلب تحويل قيد المعالجة."
              : "Une demande est déjà en cours.",
          "negative-balance":
            locale === "ar"
              ? "الرصيد غير صالح لطلب تحويل."
              : "Solde invalide pour une demande.",
          failed: t("failed"),
        }}
      />

      <div className="metric-grid metric-grid--confirmator">
        <article className="metric-card metric-card--featured">
          <span className="metric-card__icon">
            <BadgeDollarSign size={19} />
          </span>
          <p>{locale === "ar" ? "المتاح للسحب" : "Disponible"}</p>
          <strong>{formatMoney(available, locale)}</strong>
        </article>
        <article className="metric-card">
          <span className="metric-card__icon">
            <WalletCards size={19} />
          </span>
          <p>{locale === "ar" ? "إجمالي المكتسب" : "Total gagné"}</p>
          <strong>{formatMoney(earned, locale)}</strong>
        </article>
        <article className="metric-card">
          <span className="metric-card__icon">
            <WalletCards size={19} />
          </span>
          <p>{locale === "ar" ? "محجوز / مدفوع" : "Réservé / payé"}</p>
          <strong>{formatMoney(reserved, locale)}</strong>
        </article>
      </div>

      <section className="payout-bank-card section-gap">
        <div>
          <strong>
            {locale === "ar" ? "الحساب البنكي" : "Compte bancaire"}
          </strong>
          {hasBank ? (
            <p>
              {profile.bankName} · <bdi>{maskedRib}</bdi>
            </p>
          ) : (
            <p>
              {locale === "ar"
                ? "أضف بنكك وRIB قبل طلب تحويل."
                : "Ajoutez votre banque et votre RIB avant de demander un virement."}
            </p>
          )}
        </div>
        <Link className="button button--ghost button--compact" href="/admin/settings?tab=bank">
          {hasBank
            ? locale === "ar"
              ? "تعديل"
              : "Modifier"
            : locale === "ar"
              ? "إضافة"
              : "Ajouter"}
        </Link>
      </section>

      <section className="finance-section section-gap">
        <h2>{locale === "ar" ? "طلب جديد" : "Nouvelle demande"}</h2>
        {!hasBank ? (
          <p className="queue-empty">
            {locale === "ar"
              ? "أكمل معلوماتك البنكية أولاً."
              : "Complétez d’abord vos coordonnées bancaires."}
          </p>
        ) : hasOpen ? (
          <div className="payout-history-list">
            {openPayouts.map((payout) => (
              <article className="payout-history-card" key={payout.id}>
                <div className="payout-history-card__body">
                  <div className="payout-history-card__top">
                    <div>
                      <strong className="payout-history-card__ref">
                        {payout.reference}
                      </strong>
                      <p className="payout-history-card__amount">
                        {formatMoney(String(payout.amount), locale)}
                      </p>
                    </div>
                    <StatusPill>
                      {statusLabel(payout.status, locale)}
                    </StatusPill>
                  </div>
                  <p className="payout-history-card__note">
                    {locale === "ar"
                      ? "طلب قيد المعالجة. يمكنك إرسال طلب جديد بعد الدفع أو الرفض."
                      : "Demande en cours. Vous pourrez en créer une nouvelle après paiement ou refus."}
                  </p>
                </div>
              </article>
            ))}
          </div>
        ) : available <= 0 ? (
          <p className="queue-empty">
            {locale === "ar"
              ? "لا يوجد رصيد متاح للسحب حالياً."
              : "Aucun solde disponible pour le moment."}
          </p>
        ) : (
          <form
            action={requestConfirmatorPayoutAction}
            className="workflow-form workflow-form--wide"
          >
            <input type="hidden" name="locale" value={locale} />
            <label className="field">
              <span>{locale === "ar" ? "المبلغ (درهم)" : "Montant (MAD)"}</span>
              <input
                name="amount"
                type="number"
                min="1"
                step="0.5"
                max={available}
                defaultValue={available.toFixed(2)}
                required
              />
              <small>
                {locale === "ar"
                  ? `الحد الأقصى: ${formatMoney(available, locale)} · يُحوَّل إلى ${profile.bankName}`
                  : `Maximum : ${formatMoney(available, locale)} · vers ${profile.bankName}`}
              </small>
            </label>
            <ConfirmSubmitButton
              className="button button--primary workflow-form__submit"
              type="submit"
              confirmMessage={
                locale === "ar"
                  ? "تأكيد إرسال طلب التحويل؟"
                  : "Confirmer l’envoi de la demande de virement ?"
              }
            >
              {locale === "ar" ? "إرسال الطلب" : "Envoyer la demande"}
            </ConfirmSubmitButton>
          </form>
        )}
      </section>

      <section className="finance-section">
        <h2>{locale === "ar" ? "سجل الطلبات" : "Historique des demandes"}</h2>
        <div className="payout-history-list">
          {history.length ? (
            history.map((payout) => (
              <PayoutHistoryCard
                key={payout.id}
                locale={locale}
                reference={payout.reference}
                amount={String(payout.amount)}
                status={payout.status}
                createdAt={payout.updatedAt}
                bankName={payout.bankName}
                ribLast4={payout.rib.slice(-4)}
                bankReference={payout.bankReference}
                rejectionReason={payout.rejectionReason}
                proofUrl={payout.proofUrl}
                waitingProofHint={
                  payout.status === "APPROVED" && !payout.proofUrl
                    ? locale === "ar"
                      ? "صورة التحويل تظهر بعد تأكيد الدفع من الإدارة."
                      : "La capture du virement apparaîtra après le paiement par l’admin."
                    : null
                }
              />
            ))
          ) : (
            <p className="queue-empty">{t("noRecords")}</p>
          )}
        </div>
      </section>
    </main>
  );
}
