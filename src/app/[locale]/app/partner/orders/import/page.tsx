import { FileSpreadsheet, RefreshCw } from "lucide-react";

import { FormNotice, WorkflowHeader } from "@/components/workflow-ui";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/server/auth/session";
import {
  importOrdersAction,
  syncGoogleSheetOrdersAction,
} from "@/server/orders/actions";
import { affiliateIdFor } from "@/server/orders/service";

export default async function OrderImportPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "fr" | "ar" }>;
  searchParams: Promise<{
    status?: string;
    job?: string;
    orders?: string;
    lines?: string;
  }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const user = await requirePermission(locale, "orders:create");
  const affiliateId = await affiliateIdFor(user.id, user.role);
  const [profile, latestImport] = await Promise.all([
    prisma.affiliateProfile.findUnique({
      where: { id: affiliateId },
      select: { orderSheetUrl: true, orderSheetLastSyncedAt: true },
    }),
    query.job
      ? prisma.importJob.findFirst({
          where: { id: query.job, createdById: user.id, type: "EXCEL_IMPORT" },
        })
      : null,
  ]);
  const errors = latestImport?.error?.split("\n").filter(Boolean) ?? [];
  const notices = {
    imported:
      locale === "ar"
        ? "تم استيراد الطلبات بنجاح."
        : "Commandes importées avec succès.",
    "import-partial":
      locale === "ar"
        ? "تم استيراد بعض الصفوف. راجع التفاصيل أدناه."
        : "Import partiel : vérifiez les lignes ci-dessous.",
    "invalid-import":
      locale === "ar"
        ? "اختر ملف XLSX صالحاً بحجم لا يتجاوز 5 ميغابايت."
        : "Choisissez un fichier XLSX valide de 5 Mo maximum.",
    "import-failed":
      locale === "ar"
        ? "تعذر استيراد الملف."
        : "Le fichier n’a pas pu être importé.",
    "invalid-sheet-url":
      locale === "ar"
        ? "الصق رابط Google Sheets صالحاً."
        : "Collez un lien Google Sheets valide.",
    "sheet-unavailable":
      locale === "ar" ? "تعذر قراءة الجدول." : "Impossible de lire la feuille.",
    "sheet-failed":
      locale === "ar" ? "تعذرت المزامنة." : "La synchronisation a échoué.",
    "sheet-needs-catalog":
      locale === "ar"
        ? "أضف المنتجات المذكورة إلى الكتالوج ثم أعد المزامنة."
        : "Ajoutez les produits indiqués au catalogue puis relancez la synchronisation.",
    "sheet-partial":
      locale === "ar"
        ? "اكتملت المزامنة جزئياً."
        : "Synchronisation partielle.",
    "sheet-synced":
      locale === "ar"
        ? "تمت مزامنة Google Sheets."
        : "Google Sheets a été synchronisé.",
  };
  return (
    <main>
      <WorkflowHeader
        eyebrow=""
        title={locale === "ar" ? "استيراد الطلبات" : "Importer des commandes"}
        body={
          locale === "ar"
            ? "استخدم ملف Excel أو اربط Google Sheets."
            : "Utilisez un fichier Excel ou connectez Google Sheets."
        }
      />
      <FormNotice status={query.status} messages={notices} />
      <section className="order-import-grid">
        <article className="order-import-card">
          <div className="order-import-card__head">
            <FileSpreadsheet size={22} />
            <div>
              <h2>{locale === "ar" ? "ملف Excel" : "Fichier Excel"}</h2>
              <p>
                {locale === "ar"
                  ? "نزّل القالب ثم أضف طلباً في كل سطر."
                  : "Téléchargez le modèle puis ajoutez une commande par ligne."}
              </p>
            </div>
          </div>
          <a
            className="text-link"
            href={`/api/orders/import-template?locale=${locale}`}
          >
            {locale === "ar" ? "تنزيل القالب" : "Télécharger le modèle"}
          </a>
          <form action={importOrdersAction} className="import-form">
            <input type="hidden" name="locale" value={locale} />
            <input
              name="file"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              required
            />
            <button
              className="button button--primary button--compact"
              type="submit"
            >
              {locale === "ar" ? "استيراد" : "Importer"}
            </button>
          </form>
        </article>
        <article className="order-import-card">
          <div className="order-import-card__head">
            <RefreshCw size={22} />
            <div>
              <h2>Google Sheets</h2>
              <p>
                {locale === "ar"
                  ? "الصق رابط جدول متاح للقراءة."
                  : "Collez le lien d’une feuille accessible en lecture."}
              </p>
            </div>
          </div>
          <form
            action={syncGoogleSheetOrdersAction}
            className="sheet-sync-form"
          >
            <input type="hidden" name="locale" value={locale} />
            <label>
              <span>{locale === "ar" ? "الرابط" : "Lien"}</span>
              <input
                name="sheetUrl"
                type="url"
                defaultValue={profile?.orderSheetUrl ?? ""}
                required
              />
            </label>
            <button
              className="button button--primary button--compact"
              type="submit"
            >
              <RefreshCw size={15} />
              {locale === "ar" ? "مزامنة" : "Synchroniser"}
            </button>
          </form>
          {profile?.orderSheetLastSyncedAt && (
            <small className="last-sync">
              {locale === "ar" ? "آخر مزامنة:" : "Dernière synchronisation :"}{" "}
              {new Intl.DateTimeFormat(locale, {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(profile.orderSheetLastSyncedAt)}
            </small>
          )}
        </article>
        {latestImport && (
          <article
            className={`import-result ${latestImport.status === "FAILED" ? "import-result--failed" : ""}`}
          >
            <div>
              <strong>
                {locale === "ar" ? "نتيجة الاستيراد" : "Résultat de l’import"}
              </strong>
              <p>
                {locale === "ar"
                  ? `تم استيراد ${Number(query.orders ?? latestImport.processedRows)} طلب (${Number(query.lines ?? latestImport.processedRows)} سطر).`
                  : `${Number(query.orders ?? latestImport.processedRows)} commande${Number(query.orders ?? latestImport.processedRows) === 1 ? "" : "s"} (${Number(query.lines ?? latestImport.processedRows)} ligne${Number(query.lines ?? latestImport.processedRows) === 1 ? "" : "s"}) importée${Number(query.orders ?? latestImport.processedRows) === 1 ? "" : "s"}.`}
              </p>
            </div>
            <dl>
              <div>
                <dt>{locale === "ar" ? "تمت معالجة" : "Traitées"}</dt>
                <dd>{latestImport.processedRows}</dd>
              </div>
              <div>
                <dt>{locale === "ar" ? "موجودة" : "Déjà présentes"}</dt>
                <dd>{latestImport.skippedRows}</dd>
              </div>
              <div>
                <dt>{locale === "ar" ? "الصفوف" : "Lignes"}</dt>
                <dd>{latestImport.totalRows ?? 0}</dd>
              </div>
            </dl>
            {errors.length > 0 && (
              <div className="import-errors">
                <ul>
                  {errors.map((error, index) => (
                    <li key={`${error}-${index}`}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
          </article>
        )}
      </section>
    </main>
  );
}
