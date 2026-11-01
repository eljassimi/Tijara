import { ShoppingBag } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { FormNotice, WorkflowHeader } from "@/components/workflow-ui";
import { CartOrderComposer } from "@/components/orders/cart-order-composer";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/server/auth/session";
import { affiliateIdFor } from "@/server/orders/service";
import { Link } from "@/i18n/navigation";
import { cleanDemoLabel } from "@/lib/display-text";

export default async function CartPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "fr" | "ar" }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale } = await params;
  const { status } = await searchParams;
  const user = await requirePermission(locale, "orders:create");
  const affiliateProfileId = await affiliateIdFor(user.id, user.role);
  const [t, cart, cities] = await Promise.all([
    getTranslations("Workflow"),
    prisma.cart.findUnique({
      where: {
        affiliateProfileId_createdById: {
          affiliateProfileId,
          createdById: user.id,
        },
      },
      include: {
        items: {
          include: { product: true, variant: true },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.city.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { nameFr: "asc" }],
    }),
  ]);
  const items = cart?.items ?? [];
  return (
    <main>
      <WorkflowHeader
        eyebrow={t("live")}
        title={t("cartTitle")}
        body={t("cartBody")}
      />
      <FormNotice
        status={status}
        messages={{
          invalid: t("invalid"),
          duplicate: t("duplicate"),
          "empty-cart": t("emptyCart"),
          failed:
            locale === "ar"
              ? "تعذر إنشاء الطلب. لم يتم حذف محتوى السلة."
              : "La commande n’a pas pu être créée. Votre panier est conservé.",
          "invalid-price": t("invalidPrice"),
          "unknown-city": t("unknownCity"),
          unavailable: t("unavailable"),
          updated: locale === "ar" ? "تم تحديث السلة." : "Panier mis à jour.",
        }}
      />
      {!items.length ? (
        <div className="cart-empty">
          <ShoppingBag size={42} />
          <p>{t("emptyCart")}</p>
          <Link className="button button--primary" href="/app/partner/products">
            {locale === "ar" ? "عرض المنتجات" : "Voir les produits"}
          </Link>
        </div>
      ) : (
        <CartOrderComposer
          locale={locale}
          items={items.map((item) => {
            const unitSale = Number(
              item.customSalePrice ?? item.product.salePrice,
            );
            return {
              id: item.id,
              name: cleanDemoLabel(
                locale === "ar"
                  ? item.product.nameAr || item.product.nameFr
                  : item.product.nameFr,
              ),
              sku: item.variant.sku,
              availableQuantity: item.quantity,
              unitSale,
              unitCommission:
                Number(item.product.commission) +
                unitSale -
                Number(item.product.salePrice),
            };
          })}
          cities={cities.map((city) => ({
            id: city.id,
            name: locale === "ar" ? city.nameAr : city.nameFr,
            value: city.nameFr,
          }))}
          labels={{
            cart: t("cart"),
            instructions:
              locale === "ar"
                ? "اختر منتجات هذا الزبون وحدد الكمية المطلوبة من كل منتج."
                : "Sélectionnez les produits de ce client et la quantité souhaitée pour chacun.",
            selectAll: locale === "ar" ? "اختيار الكل" : "Tout sélectionner",
            clearSelection:
              locale === "ar" ? "إلغاء الاختيار" : "Effacer la sélection",
            selectedProduct:
              locale === "ar" ? "منتج مختار" : "produit sélectionné",
            selectedProducts:
              locale === "ar" ? "منتجات مختارة" : "produits sélectionnés",
            noneSelected:
              locale === "ar"
                ? "اختر منتجاً واحداً على الأقل لهذا الزبون."
                : "Sélectionnez au moins un produit pour ce client.",
            forCustomer:
              locale === "ar" ? "كمية هذا الزبون" : "Quantité pour ce client",
            availableInCart:
              locale === "ar"
                ? "وحدة متوفرة في السلة"
                : "unité disponible dans le panier",
            availableInCartPlural:
              locale === "ar"
                ? "وحدات متوفرة في السلة"
                : "unités disponibles dans le panier",
            unitPrice: locale === "ar" ? "سعر الوحدة" : "Prix unitaire",
            decreaseQuantity:
              locale === "ar" ? "تقليل الكمية" : "Diminuer la quantité",
            increaseQuantity:
              locale === "ar" ? "زيادة الكمية" : "Augmenter la quantité",
            remove: t("remove"),
            totalSale: t("totalSale"),
            totalCommission: t("totalCommission"),
          }}
          checkoutLabels={{
            customerName: t("customerName"),
            phone: t("phone"),
            city: t("city"),
            chooseCity: t("chooseCity"),
            cityHelp: t("cityHelp"),
            address: t("address"),
            addressHelp:
              locale === "ar"
                ? "أدخل الحي والشارع ورقم المنزل."
                : "Indiquez le quartier, la rue et le numéro.",
            notes: t("notes"),
            total:
              locale === "ar"
                ? "المبلغ المطلوب من الزبون"
                : "Total à encaisser",
            commission: t("totalCommission"),
            submit: locale === "ar" ? "إرسال الطلب" : "Envoyer la commande",
            submitting: locale === "ar" ? "جارٍ الإرسال…" : "Envoi…",
            invalid: t("invalid"),
            duplicate: t("duplicate"),
            "empty-cart": t("emptyCart"),
            "invalid-price": t("invalidPrice"),
            "unknown-city": t("unknownCity"),
            unavailable: t("unavailable"),
            failed:
              locale === "ar"
                ? "تعذر إنشاء الطلب. بقيت المعلومات والسلة محفوظتين."
                : "La commande n’a pas pu être créée. Le formulaire et le panier sont conservés.",
            phoneError:
              locale === "ar"
                ? "أدخل رقماً مغربياً يبدأ بـ 06 أو 07 متبوعاً بثمانية أرقام."
                : "Numéro marocain : 06 ou 07, puis 8 chiffres.",
            addressError:
              locale === "ar"
                ? "العنوان مطلوب ويجب أن يحتوي على 5 أحرف على الأقل."
                : "L’adresse est obligatoire (5 caractères minimum).",
            selectedProduct:
              locale === "ar"
                ? "منتج في هذا الطلب"
                : "produit dans cette commande",
            selectedProducts:
              locale === "ar"
                ? "منتجات في هذا الطلب"
                : "produits dans cette commande",
            noneSelected:
              locale === "ar"
                ? "اختر منتجات الزبون من السلة أولاً."
                : "Choisissez d’abord les produits de ce client dans le panier.",
          }}
        />
      )}
    </main>
  );
}
