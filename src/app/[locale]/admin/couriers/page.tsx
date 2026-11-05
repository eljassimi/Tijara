import { Building2, Cable, Link2, Radio, Truck } from "lucide-react";
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
  searchParams: Promise<{ status?: string; ref?: string; cities?: string }>;
}) {
  const { locale } = await params;
  const { status, ref, cities } = await searchParams;
  await requireRole(locale, ["SUPER_ADMIN"]);
  const [t, companies] = await Promise.all([
    getTranslations("Workflow"),
    prisma.courier.findMany({ orderBy: { createdAt: "desc" } }),
  ]);
  const activeCount = companies.filter((company) => company.active).length;
  const connectedCount = companies.filter(
    (company) => company.integrationStatus === "CONNECTED",
  ).length;
  const providerOptions = [
    {
      value: "NONE",
      label: locale === "ar" ? "يدوي (بدون API)" : "Manuel (sans API)",
    },
    { value: "OZON_EXPRESS", label: "Ozon Express (API)" },
  ];
  const appUrl = process.env.AUTH_URL?.replace(/\/$/, "") || "";

  return (
    <main>
      <WorkflowHeader
        eyebrow={t("live")}
        title={t("couriersTitle")}
        body={
          locale === "ar"
            ? "أضف الشركة ثم ضع مفتاح API في بطاقة Ozon Express بالأسفل."
            : "Ajoutez la société, puis collez la clé API dans la carte Ozon Express ci-dessous."
        }
      />
      <FormNotice
        status={status}
        messages={{
          created:
            locale === "ar"
              ? "تمت إضافة الشركة. أدخل مفتاح API في البطاقة ثم فعّل الربط."
              : "Société ajoutée. Entrez la clé API dans la carte puis activez la connexion.",
          updated:
            locale === "ar"
              ? "تم حفظ الإعدادات."
              : "Paramètres enregistrés.",
          "ozon-connected":
            locale === "ar"
              ? `Ozon Express متصل${cities ? ` · ${cities} مدينة مزامنة` : ""}.`
              : `Ozon Express connecté${cities ? ` · ${cities} villes synchronisées` : ""}.`,
          "ozon-auth-failed":
            locale === "ar"
              ? `فشل التحقق${ref ? ` : ${ref}` : "."}`
              : `Échec de vérification${ref ? ` : ${ref}` : "."}`,
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
        className="courier-create-bar"
      >
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="integrationMode" value="API" />
        <label>
          <span>
            {locale === "ar" ? "اسم الشركة" : "Nom de la société"}
          </span>
          <input name="name" required placeholder="Ozon Express" />
        </label>
        <div>
          <span>{locale === "ar" ? "النوع" : "Type"}</span>
          <CustomSelect
            name="provider"
            label={locale === "ar" ? "النوع" : "Type"}
            locale={locale}
            defaultValue="OZON_EXPRESS"
            options={providerOptions}
            required
          />
        </div>
        <button className="button button--primary" type="submit">
          <Building2 size={17} />
          {locale === "ar" ? "إضافة" : "Ajouter"}
        </button>
      </form>

      <section className="delivery-company-list section-gap">
        {companies.length ? (
          companies.map((company) => {
            const isOzon = company.provider === "OZON_EXPRESS";
            const connected = company.integrationStatus === "CONNECTED";
            const webhookUrl =
              company.webhookToken && appUrl
                ? `${appUrl}/api/webhooks/ozon-express/${company.webhookToken}`
                : null;

            return (
              <article
                className={`courier-card${isOzon ? " courier-card--ozon" : ""}`}
                key={company.id}
              >
                <header className="courier-card__header">
                  <span className="courier-card__icon">
                    <Truck size={20} />
                  </span>
                  <div>
                    <strong>{company.name}</strong>
                    <small>
                      {isOzon
                        ? "Ozon Express"
                        : locale === "ar"
                          ? "إرسال يدوي"
                          : "Transfert manuel"}
                    </small>
                  </div>
                  <div className="courier-card__pills">
                    <StatusPill status={connected ? "CONNECTED" : "NOT_CONFIGURED"}>
                      {statusLabel(
                        connected ? "CONNECTED" : company.integrationStatus,
                        locale,
                      )}
                    </StatusPill>
                    <StatusPill>
                      {statusLabel(
                        company.active ? "ACTIVE" : "INACTIVE",
                        locale,
                      )}
                    </StatusPill>
                  </div>
                </header>

                {isOzon ? (
                  <form
                    action={connectOzonCourierAction}
                    className="courier-card__api"
                  >
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="courierId" value={company.id} />
                    <input
                      type="hidden"
                      name="apiBaseUrl"
                      value={
                        company.apiBaseUrl || "https://api.ozonexpress.ma"
                      }
                    />

                    <div className="courier-card__section-title">
                      <Cable size={16} />
                      <span>
                        {locale === "ar"
                          ? "اتصال API — ضع المفتاح هنا"
                          : "Connexion API — collez la clé ici"}
                      </span>
                    </div>

                    <div className="courier-card__api-grid">
                      <label>
                        <span>
                          {locale === "ar" ? "معرّف العميل" : "ID client"}
                        </span>
                        <input
                          name="customerId"
                          defaultValue={company.externalAccountId ?? ""}
                          placeholder="75450"
                          required
                          dir="ltr"
                        />
                      </label>
                      <label className="courier-card__api-key">
                        <span>
                          {locale === "ar" ? "مفتاح API" : "Clé API"}
                          {company.apiKey ? (
                            <em>
                              {locale === "ar"
                                ? " · محفوظة — اترك فارغاً للإبقاء"
                                : " · enregistrée — laissez vide pour garder"}
                            </em>
                          ) : null}
                        </span>
                        <input
                          name="apiKey"
                          type="password"
                          autoComplete="off"
                          required={!company.apiKey}
                          placeholder={
                            company.apiKey
                              ? "••••••••••••"
                              : locale === "ar"
                                ? "الصق مفتاح API هنا"
                                : "Collez la clé API ici"
                          }
                          dir="ltr"
                        />
                      </label>
                      <div>
                        <span>
                          {locale === "ar" ? "مصدر الطرد" : "Origine"}
                        </span>
                        <CustomSelect
                          name="stockMode"
                          label={
                            locale === "ar" ? "مصدر الطرد" : "Origine"
                          }
                          locale={locale}
                          defaultValue={String(company.stockMode)}
                          options={[
                            {
                              value: "0",
                              label:
                                locale === "ar"
                                  ? "استلام من عندنا"
                                  : "Ramassage chez nous",
                            },
                            {
                              value: "1",
                              label:
                                locale === "ar"
                                  ? "مخزون Ozon"
                                  : "Stock Ozon",
                            },
                          ]}
                          required
                        />
                      </div>
                      <div>
                        <span>
                          {locale === "ar" ? "فتح الطرد" : "Ouverture"}
                        </span>
                        <CustomSelect
                          name="allowOpen"
                          label={
                            locale === "ar" ? "فتح الطرد" : "Ouverture"
                          }
                          locale={locale}
                          defaultValue={String(company.allowOpen)}
                          options={[
                            {
                              value: "1",
                              label:
                                locale === "ar" ? "مسموح" : "Autorisé",
                            },
                            {
                              value: "2",
                              label:
                                locale === "ar" ? "ممنوع" : "Interdit",
                            },
                          ]}
                          required
                        />
                      </div>
                    </div>

                    <div className="courier-card__api-actions">
                      <button
                        className="button button--primary"
                        type="submit"
                      >
                        <Cable size={16} />
                        {connected
                          ? locale === "ar"
                            ? "إعادة التحقق والحفظ"
                            : "Revérifier et enregistrer"
                          : locale === "ar"
                            ? "اختبار وتفعيل"
                            : "Tester et activer"}
                      </button>
                      {webhookUrl ? (
                        <div className="courier-card__webhook">
                          <Link2 size={14} />
                          <div>
                            <span>
                              {locale === "ar"
                                ? "رابط Webhook (الصقه في Ozon → Notifications)"
                                : "URL Webhook (à coller dans Ozon → Notifications)"}
                            </span>
                            <code dir="ltr">{webhookUrl}</code>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </form>
                ) : null}

                <form
                  action={updateCourierAction}
                  className="courier-card__meta"
                >
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="courierId" value={company.id} />
                  <input
                    type="hidden"
                    name="provider"
                    value={company.provider}
                  />
                  <input
                    type="hidden"
                    name="integrationMode"
                    value={isOzon ? "API" : "MANUAL"}
                  />
                  <input
                    type="hidden"
                    name="integrationStatus"
                    value={company.integrationStatus}
                  />
                  <input
                    type="hidden"
                    name="externalAccountId"
                    value={company.externalAccountId ?? ""}
                  />
                  <input
                    type="hidden"
                    name="apiBaseUrl"
                    value={company.apiBaseUrl ?? ""}
                  />

                  <div className="courier-card__section-title">
                    <span>
                      {locale === "ar" ? "إعدادات عامة" : "Paramètres"}
                    </span>
                  </div>

                  <div className="courier-card__meta-grid">
                    <label>
                      <span>
                        {locale === "ar" ? "الاسم" : "Nom"}
                      </span>
                      <input
                        name="name"
                        defaultValue={company.name}
                        required
                      />
                    </label>
                    <label className="check-row courier-card__active">
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
                      className="button button--secondary button--compact"
                      type="submit"
                    >
                      {locale === "ar" ? "حفظ" : "Enregistrer"}
                    </button>
                  </div>
                </form>
              </article>
            );
          })
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
