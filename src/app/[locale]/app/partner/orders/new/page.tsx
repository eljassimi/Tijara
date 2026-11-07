import { getTranslations } from "next-intl/server";

import { NewOrderForm } from "@/components/orders/new-order-form";
import { FormNotice, WorkflowHeader } from "@/components/workflow-ui";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/server/auth/session";
import {
  cityOptionsForLocale,
  listDeliveryCitiesForCheckout,
} from "@/server/cities/delivery-cities";
import { cleanDemoLabel } from "@/lib/display-text";

export default async function NewOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "fr" | "ar" }>;
  searchParams: Promise<{ status?: string; variant?: string }>;
}) {
  const { locale } = await params;
  const { status, variant } = await searchParams;
  await requirePermission(locale, "orders:create");
  const [t, products, cities] = await Promise.all([
    getTranslations("Workflow"),
    prisma.product.findMany({
      where: {
        published: true,
        variants: { some: { active: true, stock: { gt: 0 } } },
      },
      include: { variants: { where: { active: true, stock: { gt: 0 } } } },
      orderBy: { publishedAt: "desc" },
    }),
    listDeliveryCitiesForCheckout(),
  ]);
  return (
    <main>
      <WorkflowHeader
        eyebrow={t("live")}
        title={t("newOrderTitle")}
        body={t("newOrderBody")}
      />
      <FormNotice
        status={status}
        messages={{
          invalid: t("invalid"),
          duplicate: t("duplicate"),
          failed:
            locale === "ar"
              ? "تعذر حفظ الطلب. بقيت المعلومات التي أدخلتها محفوظة."
              : "La commande n’a pas pu être enregistrée. Vos informations sont conservées.",
          "invalid-price": t("invalidPrice"),
          "unknown-city": t("unknownCity"),
          unavailable: t("unavailable"),
        }}
      />
      <NewOrderForm
        locale={locale}
        initialVariant={variant}
        cities={cityOptionsForLocale(cities, locale)}
        products={products.flatMap((product) => {
          const productName = cleanDemoLabel(
            locale === "ar" ? product.nameAr || product.nameFr : product.nameFr,
          );
          return product.variants.map((item) => {
            const variantDetails = [item.color, item.size]
              .filter(Boolean)
              .join(" · ");
            const label = `${productName} · ${variantDetails || item.sku}`;
            return {
              id: item.id,
              label,
              searchText: `${label} ${item.sku}`,
              salePrice: Number(product.salePrice),
              commission: Number(product.commission),
            };
          });
        })}
        labels={{
          customerName: t("customerName"),
          phone: t("phone"),
          city: t("city"),
          chooseCity: t("chooseCity"),
          cityHelp: t("cityHelp"),
          product: t("product"),
          chooseProduct: locale === "ar" ? "اختر المنتج" : "Choisir un produit",
          searchProduct:
            locale === "ar"
              ? "ابحث بالمنتج أو اللون أو المقاس"
              : "Rechercher par produit, couleur ou taille",
          noProductsFound: locale === "ar" ? "لا توجد نتائج" : "Aucun résultat",
          quantity: t("quantity"),
          address: t("address"),
          addressHelp:
            locale === "ar"
              ? "أدخل الحي والشارع ورقم المنزل."
              : "Indiquez le quartier, la rue et le numéro.",
          notes: t("notes"),
          total:
            locale === "ar" ? "المبلغ المطلوب من الزبون" : "Total à encaisser",
          commission: t("commission"),
          submit: t("saveOrder"),
          submitting: locale === "ar" ? "جارٍ الحفظ…" : "Enregistrement…",
          invalid: t("invalid"),
          duplicate: t("duplicate"),
          "invalid-price": t("invalidPrice"),
          "unknown-city": t("unknownCity"),
          unavailable: t("unavailable"),
          failed:
            locale === "ar"
              ? "تعذر حفظ الطلب. بقيت المعلومات التي أدخلتها محفوظة."
              : "La commande n’a pas pu être enregistrée. Vos informations sont conservées.",
          phoneError:
            locale === "ar"
              ? "أدخل رقماً مغربياً يبدأ بـ 06 أو 07 متبوعاً بثمانية أرقام."
              : "Numéro marocain : 06 ou 07, puis 8 chiffres.",
          addressError:
            locale === "ar"
              ? "العنوان مطلوب ويجب أن يحتوي على 5 أحرف على الأقل."
              : "L’adresse est obligatoire (5 caractères minimum).",
        }}
      />
    </main>
  );
}
