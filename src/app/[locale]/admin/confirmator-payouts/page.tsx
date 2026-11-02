import { getTranslations } from "next-intl/server";

import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { PayoutHistoryCard } from "@/components/payouts/payout-history-card";
import { CustomSelect } from "@/components/ui/custom-select";
import {
  FormNotice,
  StatusPill,
  WorkflowHeader,
} from "@/components/workflow-ui";
import { formatMoney } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { statusLabel } from "@/lib/status";
import { formatAppDateTime } from "@/lib/time";
import { requireRole } from "@/server/auth/session";
import { confirmatorPayoutStatusAction } from "@/server/operations/actions";

export default async function ConfirmatorPayoutsAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "fr" | "ar" }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale } = await params;
  const { status } = await searchParams;
  await requireRole(locale, ["SUPER_ADMIN", "FINANCE"]);
  const [t, openPayouts, history] = await Promise.all([
    getTranslations("Workflow"),
    prisma.confirmatorPayoutRequest.findMany({
      where: { status: { in: ["PENDING", "APPROVED"] } },
      include: { agent: { select: { name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.confirmatorPayoutRequest.findMany({
      where: { status: { in: ["PAID", "REJECTED"] } },
      include: { agent: { select: { name: true, email: true } } },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
  ]);

  return (
    <main>
      <WorkflowHeader
        eyebrow={t("live")}
        title={
          locale === "ar" ? "تحويلات المؤكدين" : "Virements confirmateurs"
        }
        body={
          locale === "ar"
            ? "راجع طلبات دفع أرباح التأكيد، غيّر الحالة، وارفق صورة التحويل عند الدفع."
            : "Validez les gains des confirmateurs, changez le statut et joignez la capture du virement au paiement."
        }
      />
      <FormNotice
        status={status}
        messages={{
          updated: t("statusUpdated"),
          invalid: t("invalid"),
          proof_required:
            locale === "ar"
              ? "صورة التحويل مطلوبة عند الدفع."
              : "La capture du virement est obligatoire pour payer.",
          "invalid-proof":
            locale === "ar"
              ? "صورة غير صالحة (JPG/PNG/WebP، حتى 5MB)."
              : "Image invalide (JPG/PNG/WebP, max 5 Mo).",
          failed: t("failed"),
        }}
      />

      <section className="finance-section">
        <h2>
          {locale === "ar" ? "طلبات قيد المعالجة" : "Demandes en cours"}
        </h2>
        <p className="workflow-form__notice" style={{ marginBottom: 14 }}>
          {locale === "ar"
            ? "الموافقة لا تغلق الطلب. يبقى هنا حتى تختار «مدفوع» وترفق صورة التحويل."
            : "Approuver ne clôture pas la demande. Elle reste ici jusqu’à « Payée » avec la capture du virement."}
        </p>
        <div className="work-queue">
          {openPayouts.length ? (
            openPayouts.map((payout) => (
              <article className="queue-card" key={payout.id}>
                <div className="queue-card__summary">
                  <div>
                    <strong>{payout.reference}</strong>
                    <span>
                      {payout.agent.name} ·{" "}
                      {formatMoney(String(payout.amount), locale)}
                    </span>
                    <small>
                      {payout.bankName} · •••• {payout.rib.slice(-4)} ·{" "}
                      {formatAppDateTime(payout.createdAt, locale)}
                    </small>
                    {payout.status === "APPROVED" ? (
                      <small>
                        {locale === "ar"
                          ? "الخطوة التالية: ارفع صورة التحويل لتأكيد الدفع."
                          : "Étape suivante : uploader la capture du virement pour confirmer le paiement."}
                      </small>
                    ) : null}
                  </div>
                  <StatusPill>{statusLabel(payout.status, locale)}</StatusPill>
                </div>
                <form
                  action={confirmatorPayoutStatusAction}
                  className="queue-card__form"
                  encType="multipart/form-data"
                >
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="payoutId" value={payout.id} />
                  <div className="queue-form-field">
                    <span>{t("status")}</span>
                    <CustomSelect
                      name="status"
                      label={t("status")}
                      locale={locale}
                      defaultValue={payout.status === "APPROVED" ? "PAID" : ""}
                      options={[
                        ...(payout.status === "PENDING"
                          ? [
                              {
                                value: "APPROVED",
                                label: statusLabel("APPROVED", locale),
                              },
                            ]
                          : []),
                        {
                          value: "REJECTED",
                          label: statusLabel("REJECTED", locale),
                        },
                        ...(payout.status === "APPROVED"
                          ? [
                              {
                                value: "PAID",
                                label: statusLabel("PAID", locale),
                              },
                            ]
                          : []),
                      ]}
                      required
                    />
                  </div>
                  {payout.status === "APPROVED" ? (
                    <>
                      <label>
                        <span>
                          {locale === "ar"
                            ? "صورة التحويل"
                            : "Capture du virement"}
                        </span>
                        <input
                          name="proof"
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          required
                        />
                        <small>
                          {locale === "ar"
                            ? "إلزامية لتأكيد الدفع."
                            : "Obligatoire pour confirmer le paiement."}
                        </small>
                      </label>
                      <label>
                        <span>
                          {locale === "ar"
                            ? "مرجع بنكي (اختياري)"
                            : "Référence bancaire (facultatif)"}
                        </span>
                        <input
                          name="bankReference"
                        />
                      </label>
                      <label>
                        <span>
                          {locale === "ar"
                            ? "سبب الرفض (إن رفضت)"
                            : "Motif du refus (si refus)"}
                        </span>
                        <input name="reason" />
                      </label>
                    </>
                  ) : (
                    <label>
                      <span>
                        {locale === "ar" ? "سبب الرفض" : "Motif du refus"}
                      </span>
                      <input name="reason" />
                    </label>
                  )}
                  <ConfirmSubmitButton
                    confirmMessage={
                      locale === "ar"
                        ? `تأكيد العملية ${payout.reference}؟`
                        : `Confirmer l’action sur ${payout.reference} ?`
                    }
                    className="button button--primary button--compact"
                    type="submit"
                  >
                    {payout.status === "APPROVED"
                      ? locale === "ar"
                        ? "تأكيد الدفع"
                        : "Confirmer le paiement"
                      : t("apply")}
                  </ConfirmSubmitButton>
                </form>
              </article>
            ))
          ) : (
            <p className="queue-empty">{t("noRecords")}</p>
          )}
        </div>
      </section>

      <section className="finance-section section-gap">
        <h2>{locale === "ar" ? "السجل" : "Historique"}</h2>
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
                personLabel={payout.agent.name}
                bankName={payout.bankName}
                ribLast4={payout.rib.slice(-4)}
                bankReference={payout.bankReference}
                rejectionReason={payout.rejectionReason}
                proofUrl={payout.proofUrl}
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
