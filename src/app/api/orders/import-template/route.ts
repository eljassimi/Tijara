import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getSessionUser, sessionUserCan } from "@/server/auth/session";

export const runtime = "nodejs";

const headerFill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF3B3BF5" },
} as const;

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sessionUserCan(user, "orders:create"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const locale =
    new URL(request.url).searchParams.get("locale") === "ar" ? "ar" : "fr";
  const [cities, variants] = await Promise.all([
    prisma.city.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { nameFr: "asc" }],
    }),
    prisma.productVariant.findMany({
      where: { active: true, product: { published: true } },
      include: { product: { select: { nameFr: true, nameAr: true } } },
      orderBy: { sku: "asc" },
    }),
  ]);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Tijara";
  const orders = workbook.addWorksheet("Orders", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  orders.addRow(
    locale === "ar"
      ? [
          "مرجع الطلب",
          "اسم الزبون",
          "الهاتف",
          "المدينة",
          "رمز المنتج",
          "الكمية",
          "العنوان",
          "ملاحظات",
        ]
      : [
          "Référence commande",
          "Nom client",
          "Téléphone",
          "Ville",
          "SKU produit",
          "Quantité",
          "Adresse",
          "Notes",
        ],
  );
  orders.columns = [
    { key: "orderId", width: 20 },
    { key: "customerName", width: 28 },
    { key: "phone", width: 18, style: { numFmt: "@" } },
    { key: "city", width: 22 },
    { key: "variantSku", width: 20 },
    { key: "quantity", width: 12 },
    { key: "address", width: 38 },
    { key: "notes", width: 38 },
  ];
  orders.autoFilter = "A1:H1";
  orders.getRow(1).height = 26;
  orders.getRow(1).eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle" };
  });
  orders.getColumn(6).eachCell({ includeEmpty: true }, (cell, rowNumber) => {
    if (rowNumber > 1)
      cell.dataValidation = {
        type: "whole",
        operator: "between",
        formulae: [1, 20],
        allowBlank: false,
      };
  });

  const instructions = workbook.addWorksheet(
    locale === "ar" ? "التعليمات" : "Instructions",
  );
  instructions.columns = [{ width: 22 }, { width: 72 }];
  instructions.addRows(
    locale === "ar"
      ? [
          [
            "طريقة الاستخدام",
            "ضع طلباً واحداً في كل سطر داخل ورقة Orders، ثم ارفع الملف أو انسخ البيانات إلى Google Sheets.",
          ],
          [
            "orderId",
            "مرجع فريد للطلب. موصى به لملفات Excel وإلزامي عملياً للمزامنة الآمنة والمتكررة.",
          ],
          ["customerName", "اسم الزبون — مطلوب."],
          ["phone", "رقم مغربي مثل 0612345678 أو +212612345678 — مطلوب."],
          [
            "city",
            "اكتب اسم المدينة كما في الورقة (عربية أو فرنسية). تُحفظ كما هي ويمكن تعديلها لاحقاً من الإدارة — مطلوب.",
          ],
          ["variantSku", "رمز المنتج كما هو في ورقة المنتجات — مطلوب."],
          ["quantity", "عدد صحيح من 1 إلى 20 — مطلوب."],
          ["العنوان", "مطلوب: الحي والشارع ورقم المنزل."],
          ["ملاحظات", "اختيارية."],
          ["الحد", "500 طلب و5 ميغابايت لكل استيراد."],
        ]
      : [
          [
            "Mode d’emploi",
            "Ajoutez une commande par ligne dans la feuille Orders, puis importez le fichier ou copiez ces colonnes dans Google Sheets.",
          ],
          [
            "orderId",
            "Référence unique. Recommandée pour Excel et essentielle pour une synchronisation répétée sans doublons.",
          ],
          ["customerName", "Nom du client — obligatoire."],
          [
            "phone",
            "Numéro marocain, par ex. 0612345678 ou +212612345678 — obligatoire.",
          ],
          [
            "city",
            "Nom de ville tel qu’écrit dans la feuille (français ou arabe). Il est enregistré tel quel et peut être corrigé plus tard dans l’admin — obligatoire.",
          ],
          [
            "variantSku",
            "SKU exact affiché dans l’onglet Produits — obligatoire.",
          ],
          ["quantity", "Nombre entier de 1 à 20 — obligatoire."],
          ["Adresse", "Obligatoire : quartier, rue et numéro."],
          ["Notes", "Facultatives."],
          ["Limite", "500 commandes et 5 Mo par import."],
        ],
  );
  instructions.getColumn(1).font = { bold: true };
  instructions.eachRow((row) => {
    row.alignment = { vertical: "top", wrapText: true };
  });

  const citySheet = workbook.addWorksheet(locale === "ar" ? "المدن" : "Villes");
  citySheet.columns = [
    { header: "city (FR)", key: "fr", width: 26 },
    { header: "city (AR)", key: "ar", width: 26 },
  ];
  cities.forEach((city) =>
    citySheet.addRow({
      fr: city.nameFr,
      ar: city.nameAr,
    }),
  );

  const productSheet = workbook.addWorksheet(
    locale === "ar" ? "المنتجات" : "Produits",
  );
  productSheet.columns = [
    { header: "variantSku", key: "sku", width: 22 },
    {
      header: locale === "ar" ? "المنتج" : "Produit",
      key: "product",
      width: 38,
    },
    { header: "stock", key: "stock", width: 12 },
  ];
  variants.forEach((variant) =>
    productSheet.addRow({
      sku: variant.sku,
      product:
        locale === "ar"
          ? variant.product.nameAr || variant.product.nameFr
          : variant.product.nameFr,
      stock: variant.stock,
    }),
  );
  for (const sheet of [citySheet, productSheet]) {
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = {
      from: "A1",
      to: `${sheet.columnCount === 3 ? "C" : "B"}1`,
    };
    sheet.getRow(1).eachCell((cell) => {
      cell.fill = headerFill;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        "attachment; filename=tijara-order-import-template.xlsx",
      "Cache-Control": "no-store",
    },
  });
}
