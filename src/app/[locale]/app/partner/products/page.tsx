/* eslint-disable @next/next/no-img-element */
import { ArrowUpRight, Boxes, Coins } from "lucide-react";
import { Prisma } from "@prisma/client";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { formatMoney } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { cleanDemoLabel, productReference } from "@/lib/display-text";
import { CustomSelect } from "@/components/ui/custom-select";

export default async function ProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "fr" | "ar" }>;
  searchParams: Promise<{ q?: string; category?: string; sort?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const t = await getTranslations("Catalog");
  const where: Prisma.ProductWhereInput = { published: true };
  if (query.q?.trim())
    where.OR = [
      { nameFr: { contains: query.q.trim(), mode: "insensitive" } },
      { nameAr: { contains: query.q.trim(), mode: "insensitive" } },
      { code: { contains: query.q.trim(), mode: "insensitive" } },
    ];
  if (query.category) where.category = { slug: query.category };
  const orderBy: Prisma.ProductOrderByWithRelationInput =
    query.sort === "price-asc"
      ? { salePrice: "asc" }
      : query.sort === "commission-desc"
        ? { commission: "desc" }
        : { publishedAt: "desc" };
  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        category: true,
        variants: true,
        images: { orderBy: { sortOrder: "asc" }, take: 1 },
      },
      orderBy,
    }),
    prisma.category.findMany({
      where: { published: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);
  return (
    <main>
      <div className="dashboard-heading">
        <div>
          <p className="app-kicker">{t("count", { count: products.length })}</p>
          <h1>{t("title")}</h1>
          <p>{t("body")}</p>
        </div>
      </div>
      <form className="filter-bar catalog-filter" method="get">
        <label>
          <span>{locale === "ar" ? "بحث" : "Recherche"}</span>
          <input
            name="q"
            defaultValue={query.q}
            placeholder={
              locale === "ar" ? "اسم أو رمز المنتج" : "Nom ou code produit"
            }
          />
        </label>
        <div className="filter-field">
          <span>{locale === "ar" ? "الصنف" : "Catégorie"}</span>
          <CustomSelect
            name="category"
            label={locale === "ar" ? "الصنف" : "Catégorie"}
            locale={locale}
            defaultValue={query.category ?? ""}
            placeholder={locale === "ar" ? "الكل" : "Toutes"}
            options={[
              { value: "", label: locale === "ar" ? "الكل" : "Toutes" },
              ...categories.map((item) => ({
                value: item.slug,
                label: locale === "ar" ? item.nameAr : item.nameFr,
              })),
            ]}
          />
        </div>
        <div className="filter-field">
          <span>{locale === "ar" ? "الترتيب" : "Tri"}</span>
          <CustomSelect
            name="sort"
            label={locale === "ar" ? "الترتيب" : "Tri"}
            locale={locale}
            defaultValue={query.sort ?? "recent"}
            options={[
              {
                value: "recent",
                label: locale === "ar" ? "الأحدث" : "Plus récents",
              },
              {
                value: "price-asc",
                label: locale === "ar" ? "السعر تصاعدياً" : "Prix croissant",
              },
              {
                value: "commission-desc",
                label:
                  locale === "ar" ? "أعلى عمولة" : "Commission la plus forte",
              },
            ]}
          />
        </div>
        <button
          className="button button--primary button--compact"
          type="submit"
        >
          {locale === "ar" ? "تصفية" : "Filtrer"}
        </button>
      </form>
      {products.length ? (
        <div className="product-grid">
          {products.map((product, index) => {
            const orderVariant = product.variants.find(
              (item) => item.active && item.stock > 0,
            );
            const displayName = cleanDemoLabel(
              locale === "ar"
                ? product.nameAr || product.nameFr
                : product.nameFr,
            );
            return (
              <article className="product-card" key={product.id}>
                <div
                  className={`product-card__visual product-visual--${index % 6}`}
                >
                  <span>{productReference(product.code)}</span>
                  {product.images[0] ? (
                    <img
                      src={product.images[0].url}
                      alt={
                        locale === "ar"
                          ? product.images[0].altAr ||
                            product.images[0].altFr ||
                            displayName
                          : product.images[0].altFr || displayName
                      }
                    />
                  ) : (
                    <Boxes size={44} />
                  )}
                </div>
                <div className="product-card__body">
                  <div className="product-card__tags">
                    <span>
                      {locale === "ar"
                        ? product.category.nameAr
                        : product.category.nameFr}
                    </span>
                  </div>
                  <h2>{displayName}</h2>
                  <div className="product-card__money">
                    <div>
                      <small>{t("salePrice")}</small>
                      <strong>
                        {formatMoney(String(product.salePrice), locale)}
                      </strong>
                    </div>
                    <div>
                      <small>{t("commission")}</small>
                      <strong>
                        <Coins size={15} />
                        {formatMoney(String(product.commission), locale)}
                      </strong>
                    </div>
                  </div>
                  <div className="product-card__footer">
                    <span>
                      {t("stock")}:{" "}
                      {product.variants.reduce(
                        (sum, item) => sum + item.stock,
                        0,
                      )}
                    </span>
                    <div className="product-card__actions">
                      <Link href={`/app/partner/products/${product.slug}`}>
                        {t("view")}
                        <ArrowUpRight size={15} />
                      </Link>
                      {orderVariant && (
                        <Link
                          className="button button--primary button--compact"
                          href={{
                            pathname: "/app/partner/orders/new",
                            query: { variant: orderVariant.id },
                          }}
                        >
                          {locale === "ar" ? "اطلب" : "Commander"}
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="queue-empty">
          <p>
            {locale === "ar"
              ? `لا توجد منتجات مطابقة لـ «${query.q ?? ""}».`
              : `Aucun produit pour « ${query.q ?? ""} ».`}
          </p>
          <Link
            className="button button--primary button--compact"
            href="/app/partner/products"
          >
            {locale === "ar" ? "مسح البحث" : "Effacer la recherche"}
          </Link>
        </div>
      )}
    </main>
  );
}
