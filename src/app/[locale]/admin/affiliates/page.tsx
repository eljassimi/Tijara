import { getTranslations } from "next-intl/server";

import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import {
  FormNotice,
  StatusPill,
  WorkflowHeader,
} from "@/components/workflow-ui";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/server/auth/session";
import { affiliateStatusAction } from "@/server/operations/actions";
import { statusLabel } from "@/lib/status";

export default async function AffiliatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "fr" | "ar" }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale } = await params;
  const { status } = await searchParams;
  await requireRole(locale, ["SUPER_ADMIN"]);
  const [t, affiliates] = await Promise.all([
    getTranslations("Workflow"),
    prisma.user.findMany({
      where: { role: "AFFILIATE" },
      include: { affiliateProfile: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return (
    <main>
      <WorkflowHeader
        eyebrow={t("live")}
        title={t("affiliatesTitle")}
        body={t("affiliatesBody")}
      />
      <FormNotice
        status={status}
        messages={{
          updated:
            locale === "ar"
              ? "تم تحديث حالة الشريك وإغلاق الجلسات المتأثرة."
              : "Le statut de l’affilié a été mis à jour et les sessions concernées ont été fermées.",
          invalid:
            locale === "ar"
              ? "اختر شريكاً صالحاً وأدخل سبب الإيقاف."
              : "Choisissez un affilié valide et indiquez le motif de suspension.",
        }}
      />
      <section className="workflow-table-card">
        <div className="workflow-table workflow-table--affiliates">
          <div className="workflow-table__row workflow-table__head">
            <span>{t("name")}</span>
            <span>Email</span>
            <span>{t("city")}</span>
            <span>{t("status")}</span>
            <span />
          </div>
          {affiliates.map((item) => (
            <div className="workflow-table__row" key={item.id}>
              <strong>{item.name}</strong>
              <span>{item.email}</span>
              <span>{item.affiliateProfile?.city ?? "—"}</span>
              <StatusPill>{statusLabel(item.status, locale)}</StatusPill>
              <form action={affiliateStatusAction}>
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="userId" value={item.id} />
                <input
                  type="hidden"
                  name="status"
                  value={item.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"}
                />
                {item.status === "ACTIVE" ? (
                  <input
                    name="reason"
                    required
                    maxLength={500}
                  />
                ) : null}
                <ConfirmSubmitButton
                  confirmMessage={
                    locale === "ar"
                      ? `تأكيد تغيير حالة ${item.name}؟`
                      : `Confirmer le changement de statut de ${item.name} ?`
                  }
                  className="button button--compact"
                  type="submit"
                >
                  {item.status === "ACTIVE" ? t("suspend") : t("activate")}
                </ConfirmSubmitButton>
              </form>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
