import { getTranslations } from "next-intl/server";

import {
  FormNotice,
  StatusPill,
  WorkflowHeader,
} from "@/components/workflow-ui";
import { prisma } from "@/lib/prisma";
import { statusLabel } from "@/lib/status";
import { formatAppDate } from "@/lib/time";
import { requirePermission } from "@/server/auth/session";
import { createAnnouncementAction } from "@/server/operations/actions";

export default async function ContentPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "fr" | "ar" }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale } = await params;
  const { status } = await searchParams;
  await requirePermission(locale, "support:manage");
  const [t, announcements] = await Promise.all([
    getTranslations("Workflow"),
    prisma.announcement.findMany({ orderBy: { createdAt: "desc" } }),
  ]);
  return (
    <main>
      <WorkflowHeader
        eyebrow={t("live")}
        title={t("contentTitle")}
        body={
          locale === "ar"
            ? "أنشئ إعلانات تظهر للشركاء مع إشعار فوري لكل حساب نشط."
            : "Publiez des annonces visibles par les affiliés, avec notification immédiate pour chaque compte actif."
        }
      />
      <FormNotice
        status={status}
        messages={{ created: t("statusUpdated"), invalid: t("invalid") }}
      />
      <form action={createAnnouncementAction} className="workflow-form">
        <input type="hidden" name="locale" value={locale} />
        <label className="field">
          <span>{t("titleFr")}</span>
          <input name="titleFr" required />
        </label>
        <label className="field">
          <span>{t("titleAr")}</span>
          <input name="titleAr" dir="rtl" required />
        </label>
        <label className="field">
          <span>{t("bodyFr")}</span>
          <textarea name="bodyFr" rows={4} required />
        </label>
        <label className="field">
          <span>{t("bodyAr")}</span>
          <textarea name="bodyAr" rows={4} dir="rtl" required />
        </label>
        <label className="field">
          <span>{t("startsAt")}</span>
          <input name="startsAt" type="datetime-local" required />
        </label>
        <label className="field">
          <span>{t("endsAt")}</span>
          <input name="endsAt" type="datetime-local" required />
        </label>
        <button
          className="button button--primary workflow-form__submit"
          type="submit"
        >
          {t("publishAnnouncement")}
        </button>
      </form>
      <section className="workflow-table-card section-gap">
        <div className="workflow-table workflow-table--tickets">
          <div className="workflow-table__row workflow-table__head">
            <span>{t("reference")}</span>
            <span>{t("startsAt")}</span>
            <span>{t("status")}</span>
          </div>
          {announcements.map((item) => (
            <div className="workflow-table__row" key={item.id}>
              <strong>{locale === "ar" ? item.titleAr : item.titleFr}</strong>
              <span>
                {formatAppDate(item.startsAt, locale)} –{" "}
                {formatAppDate(item.endsAt, locale)}
              </span>
              <StatusPill>
                {statusLabel(item.published ? "PUBLISHED" : "DRAFT", locale)}
              </StatusPill>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
