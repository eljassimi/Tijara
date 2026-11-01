import {
  ArrowLeft,
  Coins,
  Download,
  FolderOpen,
  PlayCircle,
  ShoppingBag,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { Link } from "@/i18n/navigation";
import { formatMoney } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { addToCartAction } from "@/server/cart/actions";
import { FormNotice } from "@/components/workflow-ui";
import { CopyTextButton } from "@/components/copy-text-button";
import { cleanDemoLabel, productDescription } from "@/lib/display-text";
import { ProductGallery } from "@/components/catalog/product-gallery";
import { ProductVariantPicker } from "@/components/catalog/product-variant-picker";

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "fr" | "ar"; slug: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale, slug } = await params;
  const { status } = await searchParams;
  const t = await getTranslations("Catalog");
  const product = await prisma.product.findUnique({
    where: { slug },
    include: {
      category: true,
      variants: { orderBy: { createdAt: "asc" } },
      images: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!product?.published) notFound();
  const availableVariants = product.variants.filter(
    (variant) => variant.active && variant.stock > 0,
  );
  const displayName = cleanDemoLabel(
    locale === "ar" ? product.nameAr || product.nameFr : product.nameFr,
  );
  const description = productDescription(
    locale === "ar"
      ? product.descriptionAr || product.descriptionFr
      : product.descriptionFr,
    locale,
  );
  return (
    <main>
      <Link href="/app/partner/products" className="legal-back">
        <ArrowLeft size={17} />
        {t("title")}
      </Link>
      {status && (
        <FormNotice
          status={status}
          messages={{
            added: t("added"),
            invalid:
              locale === "ar"
                ? "أدخل كمية بين 1 و20."
                : "Saisissez une quantité entre 1 et 20.",
            "cap-20":
              locale === "ar"
                ? `الحد الأقصى 20 في الطلب (المخزون: ${availableVariants.reduce((sum, item) => sum + item.stock, 0)}).`
                : `Maximum 20 par commande (stock : ${availableVariants.reduce((sum, item) => sum + item.stock, 0)}).`,
            unavailable: t("unavailable"),
            "invalid-price":
              locale === "ar"
                ? "سعر البيع أقل من الحد المسموح."
                : "Le prix de vente est inférieur au minimum autorisé.",
          }}
        />
      )}
      <div className="product-detail">
        <ProductGallery
          images={product.images.map((image) => ({
            id: image.id,
            url: image.url,
            alt:
              locale === "ar"
                ? image.altAr || image.altFr || displayName
                : image.altFr || displayName,
          }))}
          locale={locale}
          productName={displayName}
        />
        <div className="product-detail__content">
          <p className="app-kicker">
            {locale === "ar"
              ? product.category.nameAr
              : product.category.nameFr}
          </p>
          <h1>{displayName}</h1>
          <p>{description}</p>
          <div className="product-media-actions">
            {product.videoUrl && (
              <a
                className="button product-video-button"
                href={product.videoUrl}
                target="_blank"
                rel="noreferrer"
              >
                <PlayCircle size={19} />
                {locale === "ar" ? "مشاهدة الفيديو" : "Voir la vidéo"}
              </a>
            )}
            <CopyTextButton
              text={description}
              label={locale === "ar" ? "نسخ الوصف" : "Copier la description"}
              copiedLabel={locale === "ar" ? "تم النسخ" : "Description copiée"}
            />
            {product.mediaDriveUrl && (
              <a
                className="button"
                href={product.mediaDriveUrl}
                target="_blank"
                rel="noreferrer"
              >
                <FolderOpen size={17} />
                {locale === "ar"
                  ? "فتح مجلد الصور والفيديوهات"
                  : "Ouvrir le dossier photos et vidéos"}
              </a>
            )}
            {product.images.length > 0 && (
              <a className="button" href={`/api/products/${product.id}/images`}>
                <Download size={17} />
                {locale === "ar"
                  ? "تنزيل كل الصور"
                  : "Télécharger toutes les images"}
              </a>
            )}
          </div>
          <div className="product-detail__prices">
            <div>
              <small>{t("salePrice")}</small>
              <strong>{formatMoney(String(product.salePrice), locale)}</strong>
            </div>
            <div>
              <small>{t("commission")}</small>
              <strong>
                <Coins size={20} />
                {formatMoney(String(product.commission), locale)}
              </strong>
            </div>
          </div>
          {availableVariants.length > 0 && (
            <form action={addToCartAction} className="add-cart-form">
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="returnSlug" value={product.slug} />
              <ProductVariantPicker
                locale={locale}
                variants={product.variants.map((variant) => ({
                  id: variant.id,
                  size: variant.size,
                  color: variant.color,
                  stock: variant.stock,
                  active: variant.active,
                }))}
              />
              <label className="add-cart-form__quantity">
                <span>{locale === "ar" ? "الكمية" : "Quantité"}</span>
                <input
                  name="quantity"
                  type="number"
                  min="1"
                  max="20"
                  defaultValue="1"
                />
              </label>
              {product.allowCustomSalePrice && (
                <label>
                  <span>{locale === "ar" ? "سعر البيع" : "Prix de vente"}</span>
                  <input
                    name="customSalePrice"
                    type="number"
                    min={
                      product.minSalePrice?.toString() ??
                      product.salePrice.toString()
                    }
                    step="0.01"
                    defaultValue={product.salePrice.toString()}
                    aria-label={locale === "ar" ? "سعر البيع" : "Prix de vente"}
                  />
                </label>
              )}
              <button className="button button--primary" type="submit">
                <ShoppingBag size={17} />
                {t("orderNow")}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
