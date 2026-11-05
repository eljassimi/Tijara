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
  connectOzonCourierAction,
  createCourierAction,
  updateCourierAction,
} from "@/server/operations/actions";

export default async function CouriersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "fr" | "ar" }>;
  searchParams: Promise<{ status?: string; ref?: string }>;
}) {
  const { locale } = await params;
  const { status, ref } = await searchParams;
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
      label: locale === "ar" ? "يدوي" : "Manuel",
    },
    {
      value: "API",
      label: locale === "ar" ? "واجهة API" : "API",
    },
  ];
  const providerOptions = [
    { value: "NONE", label: locale === "ar" ? "بدون مزوّد" : "Aucun fournisseur" },
    { value: "OZON_EXPRESS", label: "Ozon Express" },
  ];
  const statusOptions = [
    { value: "NOT_CONFIGURED", label: statusLabel("NOT_CONFIGURED", locale) },
    { value: "CONNECTED", label: statusLabel("CONNECTED", locale) },
    { value: "PAUSED", label: statusLabel("PAUSED", locale) },
  ];
  const appUrl = process.env.AUTH_URL?.replace(/\/$/, "") || "";

  return (
    <main>
      <WorkflowHeader
        eyebrow={t("live")}
        title={t("couriersTitle")}
        body={
          locale === "ar"
            ? "أضف شركات التوصيل وفعّل ربط Ozon Express لإرسال الطرود وتتبعها تلقائياً."
            : "Ajoutez les sociétés et connectez Ozon Express pour envoyer et suivre les colis automatiquement."
        }
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
          "ozon-connected":
            locale === "ar"
              ? "تم التحقق من مفاتيح Ozon Express وتفعيل الربط."
              : "Clés Ozon Express validées et intégration activée.",
          "ozon-auth-failed":
            locale === "ar"
              ? `فشل التحقق من Ozon Express${ref ? ` : ${ref}` : "."}`
              : `Échec de l’authentification Ozon Express${ref ? ` : ${ref}` : "."}`,
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
          <input name="name" required defaultValue="Ozon Express" />
        </label>
        <div className="field">
          <span>{locale === "ar" ? "المزوّد" : "Fournisseur"}</span>
          <CustomSelect
            name="provider"
            label={locale === "ar" ? "المزوّد" : "Fournisseur"}
            locale={locale}
            defaultValue="OZON_EXPRESS"
            options={providerOptions}
            required
          />
        </div>
        <div className="field">
          <span>{locale === "ar" ? "طريقة الإرسال" : "Mode de transfert"}</span>
          <CustomSelect
            name="integrationMode"
            label={locale === "ar" ? "طريقة الإرسال" : "Mode de transfert"}
            locale={locale}
            defaultValue="API"
            options={modeOptions}
            required
          />
        </div>
        <label className="field">
          <span>
            {locale === "ar" ? "معرّف العميل Ozon" : "ID client Ozon"}
          </span>
          <input name="externalAccountId" placeholder="75450" />
        </label>
        <label className="field">
          <span>{locale === "ar" ? "رابط API" : "URL de l’API"}</span>
          <input
            name="apiBaseUrl"
            type="url"
            defaultValue="https://api.ozonexpress.ma"
          />
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
                  <small>
                    {company.provider === "OZON_EXPRESS"
                      ? "Ozon Express"
                      : statusLabel(company.integrationMode, locale)}
                  </small>
                </div>
                <StatusPill>
                  {statusLabel(company.active ? "ACTIVE" : "INACTIVE", locale)}
                </StatusPill>
              </header>

              {company.provider === "OZON_EXPRESS" ? (
                <form
                  action={connectOzonCourierAction}
                  className="delivery-company-card__connect"
                >
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="courierId" value={company.id} />
                  <label>
                    <span>
                      {locale === "ar" ? "معرّف العميل" : "ID client"}
                    </span>
                    <input
                      name="customerId"
                      defaultValue={company.externalAccountId ?? ""}
                      required
                    />
                  </label>
                  <label>
                    <span>{locale === "ar" ? "مفتاح API" : "Clé API"}</span>
                    <input
                      name="apiKey"
                      type="password"
                      placeholder={
                        company.apiKey
                          ? locale === "ar"
                            ? "اتركه فارغاً للإبقاء على المفتاح"
                            : "Laisser vide pour conserver la clé"
                          : undefined
                      }
                      required={!company.apiKey}
                    />
                  </label>
                  <label>
                    <span>URL API</span>
                    <input
                      name="apiBaseUrl"
                      type="url"
                      defaultValue={
                        company.apiBaseUrl ?? "https://api.ozonexpress.ma"
                      }
                    />
                  </label>
                  <div className="queue-form-field">
                    <span>
                      {locale === "ar" ? "مصدر الطرد" : "Origine du colis"}
                    </span>
                    <CustomSelect
                      name="stockMode"
                      label={
                        locale === "ar" ? "مصدر الطرد" : "Origine du colis"
                      }
                      locale={locale}
                      defaultValue={String(company.stockMode)}
                      options={[
                        {
                          value: "0",
                          label:
                            locale === "ar"
                              ? "استلام من عندنا (0)"
                              : "Ramassage chez nous (0)",
                        },
                        {
                          value: "1",
                          label:
                            locale === "ar"
                              ? "مخزون Ozon (1)"
                              : "Stock Ozon (1)",
                        },
                      ]}
                      required
                    />
                  </div>
                  <div className="queue-form-field">
                    <span>
                      {locale === "ar" ? "فتح الطرد" : "Ouverture du colis"}
                    </span>
                    <CustomSelect
                      name="allowOpen"
                      label={
                        locale === "ar" ? "فتح الطرد" : "Ouverture du colis"
                      }
                      locale={locale}
                      defaultValue={String(company.allowOpen)}
                      options={[
                        {
                          value: "1",
                          label: locale === "ar" ? "مسموح (1)" : "Autorisé (1)",
                        },
                        {
                          value: "2",
                          label:
                            locale === "ar" ? "غير مسموح (2)" : "Interdit (2)",
                        },
                      ]}
                      required
                    />
                  </div>
                  <button
                    className="button button--primary button--compact"
                    type="submit"
                  >
                    <Cable size={16} />
                    {locale === "ar"
                      ? "اختبار وتفعيل Ozon"
                      : "Tester et activer Ozon"}
                  </button>
                  {company.webhookToken && appUrl ? (
                    <p className="muted" dir="ltr">
                      Webhook: {appUrl}/api/webhooks/ozon-express/
                      {company.webhookToken}
                    </p>
                  ) : null}
                </form>
              ) : null}

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
                  <span>{locale === "ar" ? "المزوّد" : "Fournisseur"}</span>
                  <CustomSelect
                    name="provider"
                    label={locale === "ar" ? "المزوّد" : "Fournisseur"}
                    locale={locale}
                    defaultValue={company.provider}
                    options={providerOptions}
                    required
                  />
                </div>
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
                  />
                </label>
                <label>
                  <span>
                    {locale === "ar"
                      ? "مفتاح API (اختياري للتحديث)"
                      : "Clé API (optionnel)"}
                  </span>
                  <input name="apiKey" type="password" autoComplete="off" />
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
