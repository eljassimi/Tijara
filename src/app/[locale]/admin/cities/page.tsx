import { getTranslations } from "next-intl/server";

import {
  FormNotice,
  StatusPill,
  WorkflowHeader,
} from "@/components/workflow-ui";
import { formatMoney } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { statusLabel } from "@/lib/status";
import { requireRole } from "@/server/auth/session";
import {
  saveCityAction,
  syncOzonCitiesAction,
} from "@/server/operations/actions";

export default async function CitiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "fr" | "ar" }>;
  searchParams: Promise<{ status?: string; count?: string }>;
}) {
  const { locale } = await params;
  const { status, count } = await searchParams;
  await requireRole(locale, ["SUPER_ADMIN"]);
  const [t, cities] = await Promise.all([
    getTranslations("Workflow"),
    prisma.city.findMany({
      orderBy: [{ sortOrder: "asc" }, { nameFr: "asc" }],
    }),
  ]);
  const mapped = cities.filter((city) => city.ozonCityId != null).length;
  return (
    <main>
      <WorkflowHeader
        eyebrow={t("live")}
        title={
          locale === "ar"
            ? "المدن ورسوم التوصيل"
            : "Villes et frais de livraison"
        }
        body={
          locale === "ar"
            ? "حدّد رسوم كل مدينة وزامن قائمة Ozon Express لضمان المدينة الصحيحة عند الإرسال."
            : "Définissez les tarifs et synchronisez la liste Ozon Express pour envoyer avec la bonne ville."
        }
      />
      <FormNotice
        status={status}
        messages={{
          updated: t("statusUpdated"),
          invalid: t("invalid"),
          "ozon-synced":
            locale === "ar"
              ? `تمت مزامنة ${count ?? mapped} مدينة من Ozon Express.`
              : `${count ?? mapped} villes synchronisées depuis Ozon Express.`,
        }}
      />
      <form action={syncOzonCitiesAction} className="inline-create">
        <input type="hidden" name="locale" value={locale} />
        <button className="button button--secondary" type="submit">
          {locale === "ar"
            ? `مزامنة مدن Ozon (${mapped}/${cities.length})`
            : `Synchroniser Ozon (${mapped}/${cities.length})`}
        </button>
      </form>
      <form action={saveCityAction} className="inline-create">
        <input type="hidden" name="locale" value={locale} />
        <label>
          <span>Nom FR</span>
          <input name="nameFr" required />
        </label>
        <label>
          <span>الاسم</span>
          <input name="nameAr" dir="rtl" required />
        </label>
        <label>
          <span>Slug</span>
          <input name="slug" pattern="[a-z0-9-]+" required />
        </label>
        <label>
          <span>{locale === "ar" ? "رسوم التوصيل" : "Frais MAD"}</span>
          <input
            name="deliveryFee"
            type="number"
            min="0"
            step="0.01"
            required
          />
        </label>
        <label className="check-label">
          <input name="active" type="checkbox" defaultChecked />
          {locale === "ar" ? "مفعلة" : "Active"}
        </label>
        <button className="button button--primary" type="submit">
          {locale === "ar" ? "إضافة" : "Ajouter"}
        </button>
      </form>
      <div className="work-queue section-gap">
        {cities.map((city) => (
          <article className="queue-card" key={city.id}>
            <div className="queue-card__summary">
              <div>
                <strong>{locale === "ar" ? city.nameAr : city.nameFr}</strong>
                <span>
                  {city.slug}
                  {city.ozonCityId != null ? ` · Ozon #${city.ozonCityId}` : ""}
                  {" · "}
                  {formatMoney(city.deliveryFee?.toString() ?? "0", locale)}
                </span>
              </div>
              <StatusPill>
                {statusLabel(city.active ? "ACTIVE" : "INACTIVE", locale)}
              </StatusPill>
            </div>
            <form
              action={saveCityAction}
              className="queue-card__form queue-card__form--four"
            >
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="cityId" value={city.id} />
              <label>
                <span>Nom FR</span>
                <input name="nameFr" defaultValue={city.nameFr} required />
              </label>
              <label>
                <span>الاسم</span>
                <input
                  name="nameAr"
                  defaultValue={city.nameAr}
                  dir="rtl"
                  required
                />
              </label>
              <label>
                <span>Slug</span>
                <input name="slug" defaultValue={city.slug} required />
              </label>
              <label>
                <span>{locale === "ar" ? "الرسم" : "Frais"}</span>
                <input
                  name="deliveryFee"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={city.deliveryFee?.toString() ?? "0"}
                  required
                />
              </label>
              <label className="check-label">
                <input
                  name="active"
                  type="checkbox"
                  defaultChecked={city.active}
                />
                {locale === "ar" ? "مفعلة" : "Active"}
              </label>
              <button
                className="button button--primary button--compact"
                type="submit"
              >
                {locale === "ar" ? "حفظ" : "Enregistrer"}
              </button>
            </form>
          </article>
        ))}
      </div>
    </main>
  );
}
