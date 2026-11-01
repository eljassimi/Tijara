import { Building2, Cable, Radio, Truck } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { CustomSelect } from "@/components/ui/custom-select";
import {
  FormNotice,
  StatusPill,
  WorkflowHeader,
} from "@/components/workflow-ui";
import { prisma } from "@/lib/prisma";
import { statusLabel } from "@/lib/status";
import { requireRole } from "@/server/auth/session";
import {
  createCourierAction,
  updateCourierAction,
} from "@/server/operations/actions";

export default async function CouriersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "fr" | "ar" }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale } = await params;
  const { status } = await searchParams;
  await requireRole(locale, ["SUPER_ADMIN"]);
  const [t, companies] = await Promise.all([
    getTranslations("Workflow"),
    prisma.courier.findMany({ orderBy: { createdAt: "desc" } }),
  ]);
  const activeCount = companies.filter((company) => company.active).length;
  const connectedCount = companies.filter(
    (company) => company.integrationStatus === "CONNECTED",
  ).length;
  const modeOptions = [
    {
      value: "MANUAL",
      label: locale === "ar" ? "يدوي حالياً" : "Manuel pour le moment",
    },
    {
      value: "API",
      label: locale === "ar" ? "واجهة API لاحقاً" : "API à connecter",
    },
  ];
  const statusOptions = [
    { value: "NOT_CONFIGURED", label: statusLabel("NOT_CONFIGURED", locale) },
    { value: "CONNECTED", label: statusLabel("CONNECTED", locale) },
    { value: "PAUSED", label: statusLabel("PAUSED", locale) },
  ];

  return (
    <main>
      <WorkflowHeader
        eyebrow={t("live")}
        title={t("couriersTitle")}
        body={t("couriersBody")}
      />
      <FormNotice
        status={status}
        messages={{
          created:
            locale === "ar"
              ? "تمت إضافة شركة التوصيل."
              : "La société de livraison a été ajoutée.",
          updated:
            locale === "ar"
              ? "تم تحديث إعدادات الشركة."
              : "Les paramètres de la société ont été enregistrés.",
          invalid: t("invalid"),
        }}
      />

      <section className="operations-metrics">
        <article>
          <Building2 size={20} />
          <span>{locale === "ar" ? "الشركات" : "Sociétés"}</span>
          <strong>{companies.length}</strong>
        </article>
        <article>
          <Truck size={20} />
          <span>{locale === "ar" ? "نشطة" : "Actives"}</span>
          <strong>{activeCount}</strong>
        </article>
        <article>
          <Radio size={20} />
          <span>{locale === "ar" ? "متصلة" : "Connectées"}</span>
          <strong>{connectedCount}</strong>
        </article>
      </section>

      <form
        action={createCourierAction}
        className="workflow-form delivery-company-create"
      >
        <input type="hidden" name="locale" value={locale} />
        <label className="field">
          <span>
            {locale === "ar" ? "اسم شركة التوصيل" : "Nom de la société"}
          </span>
          <input name="name" required />
        </label>
        <div className="field">
          <span>{locale === "ar" ? "طريقة الإرسال" : "Mode de transfert"}</span>
          <CustomSelect
            name="integrationMode"
            label={locale === "ar" ? "طريقة الإرسال" : "Mode de transfert"}
            locale={locale}
            defaultValue="MANUAL"
            options={modeOptions}
            required
          />
        </div>
        <label className="field">
          <span>
            {locale === "ar"
              ? "معرّف الحساب (اختياري)"
              : "Identifiant du compte (facultatif)"}
          </span>
          <input name="externalAccountId" />
        </label>
        <label className="field">
          <span>
            {locale === "ar" ? "رابط API (لاحقاً)" : "URL de l’API (plus tard)"}
          </span>
          <input name="apiBaseUrl" type="url" placeholder="https://" />
        </label>
        <button
          className="button button--primary workflow-form__submit"
          type="submit"
        >
          <Building2 size={17} />
          {locale === "ar" ? "إضافة الشركة" : "Ajouter la société"}
        </button>
      </form>

      <section className="delivery-company-list section-gap">
        {companies.length ? (
          companies.map((company) => (
            <article className="delivery-company-card" key={company.id}>
              <header>
                <span className="delivery-company-card__icon">
                  <Truck size={21} />
                </span>
                <div>
                  <strong>{company.name}</strong>
                  <small>{statusLabel(company.integrationMode, locale)}</small>
                </div>
                <StatusPill>
                  {statusLabel(company.active ? "ACTIVE" : "INACTIVE", locale)}
                </StatusPill>
              </header>
              <form action={updateCourierAction}>
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="courierId" value={company.id} />
                <label>
                  <span>
                    {locale === "ar" ? "اسم الشركة" : "Nom de la société"}
                  </span>
                  <input name="name" defaultValue={company.name} required />
                </label>
                <div className="queue-form-field">
                  <span>
                    {locale === "ar" ? "طريقة الإرسال" : "Mode de transfert"}
                  </span>
                  <CustomSelect
                    name="integrationMode"
                    label={
                      locale === "ar" ? "طريقة الإرسال" : "Mode de transfert"
                    }
                    locale={locale}
                    defaultValue={company.integrationMode}
                    options={modeOptions}
                    required
                  />
                </div>
                <div className="queue-form-field">
                  <span>
                    {locale === "ar" ? "حالة الربط" : "État de l’intégration"}
                  </span>
                  <CustomSelect
                    name="integrationStatus"
                    label={
                      locale === "ar" ? "حالة الربط" : "État de l’intégration"
                    }
                    locale={locale}
                    defaultValue={company.integrationStatus}
                    options={statusOptions}
                    required
                  />
                </div>
                <label>
                  <span>
                    {locale === "ar" ? "معرّف الحساب" : "Identifiant du compte"}
                  </span>
                  <input
                    name="externalAccountId"
                    defaultValue={company.externalAccountId ?? ""}
                  />
                </label>
                <label className="delivery-company-card__wide">
                  <span>{locale === "ar" ? "رابط API" : "URL de l’API"}</span>
                  <input
                    name="apiBaseUrl"
                    type="url"
                    defaultValue={company.apiBaseUrl ?? ""}
                    placeholder="https://"
                  />
                </label>
                <label className="check-row delivery-company-card__active">
                  <input
                    type="checkbox"
                    name="active"
                    defaultChecked={company.active}
                  />
                  <span>
                    {locale === "ar"
                      ? "متاحة لفريق التأكيد"
                      : "Disponible pour l’équipe de confirmation"}
                  </span>
                </label>
                <button
                  className="button button--primary button--compact"
                  type="submit"
                >
                  <Cable size={16} />
                  {locale === "ar" ? "حفظ الإعدادات" : "Enregistrer"}
                </button>
              </form>
            </article>
          ))
        ) : (
          <p className="queue-empty">
            {locale === "ar"
              ? "أضف شركة التوصيل الأولى."
              : "Ajoutez votre première société de livraison."}
          </p>
        )}
      </section>
    </main>
  );
}
