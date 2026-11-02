/* eslint-disable @next/next/no-img-element */
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { FormNotice, WorkflowHeader } from "@/components/workflow-ui";
import { CustomSelect } from "@/components/ui/custom-select";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/server/auth/session";
import {
  addProductVariantAction,
  deleteProductImageAction,
  reorderProductImageAction,
  updateProductVariantAction,
  updateProductAction,
  uploadProductImageAction,
} from "@/server/operations/actions";

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "fr" | "ar"; id: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale, id } = await params;
  const { status } = await searchParams;
  await requirePermission(locale, "catalog:manage");
  const [t, product, categories] = await Promise.all([
    getTranslations("Workflow"),
    prisma.product.findUnique({
      where: { id },
      include: {
        images: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
        variants: {
          orderBy: { createdAt: "asc" },
          include: {
            stockMovements: {
              orderBy: { createdAt: "desc" },
              take: 5,
              include: { actor: { select: { name: true } } },
            },
          },
        },
      },
    }),
    prisma.category.findMany({
      where: { published: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);
  if (!product) notFound();
  return (
    <main>
      <WorkflowHeader
        eyebrow={product.code}
        title={locale === "ar" ? "تعديل المنتج" : "Modifier le produit"}
        body={
          locale === "ar"
            ? "حدّث المعلومات والأسعار ثم احفظ التغييرات."
            : "Mettez à jour les informations et les prix, puis enregistrez."
        }
      />
      <FormNotice
        status={status}
        messages={{
          updated: t("statusUpdated"),
          invalid: t("invalid"),
          failed: t("failed"),
          "variant-added":
            locale === "ar" ? "تمت إضافة المقاس." : "Taille ajoutée.",
          "duplicate-variant":
            locale === "ar"
              ? "هذا المقاس واللون موجودان بالفعل."
              : "Cette taille et cette couleur existent déjà.",
          "invalid-variant":
            locale === "ar"
              ? "تحقق من المقاس والمخزون."
              : "Vérifiez la taille et le stock.",
          "variant-updated":
            locale === "ar"
              ? "تم تحديث المخزون وحالة المقاس."
              : "Le stock et l’état de la variante ont été mis à jour.",
          "invalid-stock":
            locale === "ar"
              ? "أدخل مخزوناً صالحاً وسبب التعديل."
              : "Saisissez un stock valide et le motif de la modification.",
          "invalid-image":
            locale === "ar"
              ? "اختر صورة JPG أو PNG أو WebP أصغر من 5MB."
              : "Choisissez une image JPG, PNG ou WebP de moins de 5 Mo.",
          "storage-failed":
            locale === "ar"
              ? "تعذر الاتصال بمخزن الصور."
              : "Le stockage d’images est indisponible.",
          "image-uploaded":
            locale === "ar" ? "تم رفع الصورة." : "Image ajoutée.",
        }}
      />
      <form action={updateProductAction} className="workflow-form catalog-form">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="productId" value={product.id} />
        <div className="field">
          <span>{t("category")}</span>
          <CustomSelect
            name="categoryId"
            label={t("category")}
            locale={locale}
            defaultValue={product.categoryId}
            options={categories.map((item) => ({
              value: item.id,
              label: locale === "ar" ? item.nameAr : item.nameFr,
            }))}
          />
        </div>
        <label className="field">
          <span>{t("slug")}</span>
          <input name="slug" defaultValue={product.slug} required />
        </label>
        <label className="field">
          <span>{t("nameFr")}</span>
          <input name="nameFr" defaultValue={product.nameFr} required />
        </label>
        <label className="field">
          <span>{t("nameAr")}</span>
          <input name="nameAr" defaultValue={product.nameAr ?? ""} dir="rtl" />
        </label>
        <label className="field">
          <span>{t("descriptionFr")}</span>
          <textarea
            name="descriptionFr"
            rows={5}
            defaultValue={product.descriptionFr}
            required
          />
        </label>
        <label className="field">
          <span>{t("descriptionAr")}</span>
          <textarea
            name="descriptionAr"
            rows={5}
            defaultValue={product.descriptionAr ?? ""}
            dir="rtl"
          />
        </label>
        {(
          ["productPrice", "serviceFee", "salePrice", "commission"] as const
        ).map((key) => (
          <label className="field" key={key}>
            <span>{t(key)}</span>
            <input
              name={key}
              type="number"
              min="0"
              step="0.01"
              defaultValue={product[key].toString()}
              required
            />
          </label>
        ))}
        <label className="field">
          <span>Vidéo URL</span>
          <input
            name="videoUrl"
            type="url"
            defaultValue={product.videoUrl ?? ""}
          />
        </label>
        <label className="field">
          <span>
            {locale === "ar"
              ? "رابط مجلد الصور والفيديوهات"
              : "Lien du dossier photos et vidéos"}
          </span>
          <input
            name="mediaDriveUrl"
            type="url"
            defaultValue={product.mediaDriveUrl ?? ""}
          />
        </label>
        <label className="check-label">
          <input
            name="allowCustomSalePrice"
            type="checkbox"
            defaultChecked={product.allowCustomSalePrice}
          />
          {locale === "ar"
            ? "السماح بسعر بيع مخصص"
            : "Autoriser un prix de vente personnalisé"}
        </label>
        <label className="field">
          <span>
            {locale === "ar" ? "أدنى سعر بيع" : "Prix de vente minimum"}
          </span>
          <input
            name="minSalePrice"
            type="number"
            min="0.01"
            step="0.01"
            defaultValue={product.minSalePrice?.toString() ?? ""}
          />
        </label>
        <button
          className="button button--primary workflow-form__submit"
          type="submit"
        >
          {locale === "ar" ? "حفظ التغييرات" : "Enregistrer les modifications"}
        </button>
      </form>
      <section className="detail-card section-gap">
        <h2>{locale === "ar" ? "المقاسات والمخزون" : "Tailles et stock"}</h2>
        <p>
          {locale === "ar"
            ? "كل مقاس تضيفه يصبح اختياراً مستقلاً للبائع في صفحة المنتج."
            : "Chaque taille ajoutée devient une option indépendante pour le vendeur sur la page produit."}
        </p>
        <form
          action={addProductVariantAction}
          className="inline-create variant-create-form"
        >
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="productId" value={product.id} />
          <label>
            <span>{locale === "ar" ? "المقاس" : "Taille"}</span>
            <input name="size" maxLength={40} required />
          </label>
          <label>
            <span>{locale === "ar" ? "اللون" : "Couleur"}</span>
            <input name="color" maxLength={80} />
          </label>
          <label>
            <span>{locale === "ar" ? "المخزون" : "Stock"}</span>
            <input
              name="stock"
              type="number"
              min="0"
              step="1"
              defaultValue="0"
              required
            />
          </label>
          <button className="button button--primary" type="submit">
            {locale === "ar" ? "إضافة المقاس" : "Ajouter la taille"}
          </button>
        </form>
        <div className="variant-admin-list">
          {product.variants.map((variant) => (
            <article key={variant.id}>
              <div className="variant-admin-list__identity">
                <strong>
                  {variant.size ||
                    (locale === "ar" ? "مقاس موحد" : "Taille unique")}
                </strong>
                <span>
                  {variant.color || "—"} · {variant.sku}
                </span>
              </div>
              <form
                action={updateProductVariantAction}
                className="variant-stock-form"
              >
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="productId" value={product.id} />
                <input type="hidden" name="variantId" value={variant.id} />
                <label>
                  <span>
                    {locale === "ar" ? "المخزون المتاح" : "Stock disponible"}
                  </span>
                  <input
                    name="stock"
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={variant.stock}
                    required
                  />
                </label>
                <label>
                  <span>{locale === "ar" ? "سبب التعديل" : "Motif"}</span>
                  <input
                    name="reason"
                    minLength={3}
                    maxLength={500}
                    required
                  />
                </label>
                <label className="check-row">
                  <input
                    name="active"
                    type="checkbox"
                    defaultChecked={variant.active}
                  />
                  <span>
                    {locale === "ar" ? "متاح للبيع" : "Disponible à la vente"}
                  </span>
                </label>
                <button className="button button--compact" type="submit">
                  {locale === "ar" ? "حفظ المخزون" : "Enregistrer le stock"}
                </button>
              </form>
              {variant.stockMovements.length ? (
                <details className="variant-stock-history">
                  <summary>
                    {locale === "ar"
                      ? "آخر حركات المخزون"
                      : "Derniers mouvements"}
                  </summary>
                  <ul>
                    {variant.stockMovements.map((movement) => (
                      <li key={movement.id}>
                        <strong>
                          {movement.quantityDelta > 0 ? "+" : ""}
                          {movement.quantityDelta}
                        </strong>
                        <span>
                          {movement.stockBefore} → {movement.stockAfter}
                        </span>
                        <span>{movement.reason || movement.type}</span>
                        <small>{movement.actor?.name ?? "Tijara"}</small>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </article>
          ))}
        </div>
      </section>
      <section className="detail-card section-gap">
        <div className="section-title-row">
          <h2>{locale === "ar" ? "صور المنتج" : "Images du produit"}</h2>
          {product.images.length > 0 && (
            <a
              className="button button--compact"
              href={`/api/products/${product.id}/images`}
            >
              {locale === "ar"
                ? "تنزيل كل الصور"
                : "Télécharger toutes les images"}
            </a>
          )}
        </div>
        <form
          action={uploadProductImageAction}
          className="inline-create image-upload-form"
        >
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="productId" value={product.id} />
          <label>
            <span>{locale === "ar" ? "الصورة" : "Image"}</span>
            <input
              name="image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required
            />
          </label>
          <label>
            <span>Alt FR</span>
            <input name="altFr" />
          </label>
          <label>
            <span>Alt AR</span>
            <input name="altAr" dir="rtl" />
          </label>
          <button className="button button--primary" type="submit">
            {locale === "ar" ? "رفع الصورة" : "Ajouter l’image"}
          </button>
        </form>
        <div className="product-image-admin">
          {product.images.map((image, index) => (
            <article key={image.id}>
              <img
                src={image.url}
                alt={
                  locale === "ar"
                    ? image.altAr || image.altFr || product.nameFr
                    : image.altFr || product.nameFr
                }
              />
              <div>
                <strong>{image.altFr || product.nameFr}</strong>
                <span>#{index + 1}</span>
              </div>
              <div className="row-actions">
                <form action={reorderProductImageAction}>
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="productId" value={product.id} />
                  <input type="hidden" name="imageId" value={image.id} />
                  <button
                    className="button button--compact"
                    name="direction"
                    value="up"
                    disabled={index === 0}
                  >
                    ↑
                  </button>
                  <button
                    className="button button--compact"
                    name="direction"
                    value="down"
                    disabled={index === product.images.length - 1}
                  >
                    ↓
                  </button>
                </form>
                <form action={deleteProductImageAction}>
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="productId" value={product.id} />
                  <input type="hidden" name="imageId" value={image.id} />
                  <button className="button button--compact" type="submit">
                    {locale === "ar" ? "حذف" : "Supprimer"}
                  </button>
                </form>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
