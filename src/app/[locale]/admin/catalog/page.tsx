import { getTranslations } from "next-intl/server";

import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import {
  FormNotice,
  StatusPill,
  WorkflowHeader,
} from "@/components/workflow-ui";
import { CreateProductForm } from "@/components/catalog/create-product-form";
import { formatMoney } from "@/lib/money";
import { cleanDemoLabel, productReference } from "@/lib/display-text";
import { prisma } from "@/lib/prisma";
import { statusLabel } from "@/lib/status";
import { requirePermission } from "@/server/auth/session";
import {
  importCatalogAction,
  toggleProductAction,
} from "@/server/operations/actions";
import { Link } from "@/i18n/navigation";

export default async function CatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "fr" | "ar" }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale } = await params;
  const { status } = await searchParams;
  await requirePermission(locale, "catalog:manage");
  const [t, categories, products] = await Promise.all([
    getTranslations("Workflow"),
    prisma.category.findMany({
      where: { published: true },
      select: { id: true, nameFr: true, nameAr: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.product.findMany({
      include: { variants: true, category: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return (
    <main>
      <WorkflowHeader
        eyebrow={t("live")}
        title={t("catalogTitle")}
        body={t("catalogBody")}
      />
      <FormNotice
        status={status}
        messages={{
          created:
            locale === "ar"
              ? "تم إنشاء المنتج كمسودة. أضف الصور والمخزون قبل النشر."
              : "Produit créé comme brouillon. Ajoutez les images et le stock avant publication.",
          updated: locale === "ar" ? "تم تحديث المنتج." : "Produit mis à jour.",
          "publish-requirements":
            locale === "ar"
              ? "يتطلب النشر صورة حقيقية، ومخزوناً متوفراً، واسماً ووصفاً بالعربية والفرنسية."
              : "La publication exige une image valide, du stock disponible et les textes français et arabes.",
          imported:
            locale === "ar" ? "تم استيراد الكتالوج." : "Catalogue importé.",
          "invalid-import":
            locale === "ar"
              ? "اختر ملف XLSX صالحاً."
              : "Choisissez un fichier XLSX valide.",
          "import-failed":
            locale === "ar"
              ? "فشل الاستيراد. راجع صفحة المهام."
              : "Import impossible. Consultez la page Tâches.",
          invalid: t("invalid"),
          failed: t("failed"),
        }}
      />
      <details className="import-panel">
        <summary>
          {locale === "ar"
            ? "استيراد الكتالوج من Excel"
            : "Importer le catalogue depuis Excel"}
        </summary>
        <p>
          {locale === "ar" ? "الأعمدة المطلوبة:" : "Colonnes requises :"} code,
          slug, categorySlug, nameFr, descriptionFr, productPrice, serviceFee,
          salePrice, commission, sku, stock.
        </p>
        <form action={importCatalogAction}>
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
      </details>
      <CreateProductForm
        categories={categories}
        locale={locale}
        labels={{
          category: t("category"),
          slug: t("slug"),
          slugHelp:
            locale === "ar"
              ? "مثال: fc-barcelona-player-kit-26-27. يمكنك أيضاً لصق رابط كامل وسيحوّله Tijara تلقائياً."
              : "Exemple : fc-barcelona-player-kit-26-27. Vous pouvez aussi coller une URL complète : Tijara la convertira automatiquement.",
          nameFr: t("nameFr"),
          nameAr: t("nameAr"),
          descriptionFr: t("descriptionFr"),
          descriptionAr: t("descriptionAr"),
          productPrice: t("productPrice"),
          serviceFee: t("serviceFee"),
          salePrice: t("salePrice"),
          commission: t("commission"),
          mediaDriveUrl:
            locale === "ar"
              ? "رابط مجلد الصور والفيديوهات"
              : "Lien du dossier photos et vidéos",
          images: locale === "ar" ? "صور المنتج" : "Images du produit",
          color: t("color"),
          sizes: locale === "ar" ? "المقاسات" : "Tailles",
          stock: t("stock"),
          imagesHelp:
            locale === "ar"
              ? "يمكنك اختيار ما يصل إلى 8 صور بصيغة JPG أو PNG أو WebP، بحجم 5 ميغابايت لكل صورة."
              : "Sélectionnez jusqu’à 8 images JPG, PNG ou WebP, 5 Mo maximum par image.",
          sizesHelp:
            locale === "ar"
              ? "افصل بين المقاسات بفواصل، مثلاً: S, M, L, XL. سيتم إنشاء اختيار مستقل لكل مقاس."
              : "Séparez les tailles par des virgules, par exemple : S, M, L, XL. Une option sera créée pour chaque taille.",
          createProduct: t("createProduct"),
          creatingProduct:
            locale === "ar" ? "جارٍ إنشاء المنتج…" : "Création du produit…",
          invalidField:
            locale === "ar" ? "تحقق من هذه القيمة." : "Vérifiez cette valeur.",
        }}
      />
      <section className="workflow-table-card section-gap">
        <div className="workflow-table workflow-table--catalog">
          <div className="workflow-table__row workflow-table__head">
            <span>{t("code")}</span>
            <span>{t("product")}</span>
            <span>{t("salePrice")}</span>
            <span>{t("stock")}</span>
            <span>{t("status")}</span>
            <span />
          </div>
          {products.map((product) => (
            <div className="workflow-table__row" key={product.id}>
              <strong>{productReference(product.code)}</strong>
              <span>
                {cleanDemoLabel(
                  locale === "ar"
                    ? product.nameAr || product.nameFr
                    : product.nameFr,
                )}
                <small>
                  {locale === "ar"
                    ? product.category.nameAr
                    : product.category.nameFr}
                </small>
              </span>
              <span>{formatMoney(String(product.salePrice), locale)}</span>
              <span>
                {product.variants.reduce((sum, item) => sum + item.stock, 0)}
              </span>
              <StatusPill>
                {statusLabel(product.published ? "PUBLISHED" : "DRAFT", locale)}
              </StatusPill>
              <div className="row-actions">
                <Link
                  className="button button--compact"
                  href={`/admin/catalog/${product.id}`}
                >
                  {locale === "ar" ? "تعديل" : "Modifier"}
                </Link>
                <form action={toggleProductAction}>
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="productId" value={product.id} />
                  <input
                    type="hidden"
                    name="published"
                    value={String(!product.published)}
                  />
                  {product.published ? (
                    <ConfirmSubmitButton
                      confirmMessage={
                        locale === "ar"
                          ? `إلغاء نشر ${cleanDemoLabel(product.nameAr || product.nameFr)}؟`
                          : `Dépublier ${cleanDemoLabel(product.nameFr)} ?`
                      }
                      className="button button--compact"
                      type="submit"
                    >
                      {t("unpublish")}
                    </ConfirmSubmitButton>
                  ) : (
                    <button className="button button--compact" type="submit">
                      {t("publish")}
                    </button>
                  )}
                </form>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
