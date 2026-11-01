import "dotenv/config";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";
import { hash } from "argon2";

import { catalogProducts } from "./catalog-products";
import { syncImportedCities } from "./cities";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(connectionString),
});

const demoPassword = "DemoTijara2026!";

const categories = [
  ["Vêtements femme", "ملابس نسائية", "vetements-femme"],
  ["Vêtements homme", "ملابس رجالية", "vetements-homme"],
  ["Sacs", "حقائب", "sacs"],
  ["Montres", "ساعات", "montres"],
  ["Bijoux", "مجوهرات", "bijoux"],
  ["Accessoires", "إكسسوارات", "accessoires"],
] as const;

const replacedDemoProductCodes = [
  "PRD-001",
  "PRD-002",
  "PRD-003",
  "PRD-004",
  "PRD-005",
  "PRD-006",
  "DEMO-001",
  "DEMO-002",
  "DEMO-003",
  "DEMO-004",
  "DEMO-005",
  "DEMO-006",
];

function variantToken(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toUpperCase() || "OPTION"
  );
}

async function main() {
  const passwordHash = await hash(demoPassword);
  const admin = await prisma.user.upsert({
    where: { email: "admin@tijara.test" },
    update: { passwordHash, status: "ACTIVE", role: "SUPER_ADMIN" },
    create: {
      name: "Admin Tijara",
      email: "admin@tijara.test",
      passwordHash,
      status: "ACTIVE",
      role: "SUPER_ADMIN",
      preferredLocale: "FR",
    },
  });
  const affiliateUser = await prisma.user.upsert({
    where: { email: "affiliate@tijara.test" },
    update: { passwordHash, status: "ACTIVE", role: "AFFILIATE" },
    create: {
      name: "Partenaire Tijara",
      email: "affiliate@tijara.test",
      phone: "0612345678",
      passwordHash,
      status: "ACTIVE",
      role: "AFFILIATE",
      preferredLocale: "FR",
    },
  });
  const affiliate = await prisma.affiliateProfile.upsert({
    where: { userId: affiliateUser.id },
    update: {
      level: "PRO",
      city: "Casablanca",
      approvedAt: new Date(),
      approvedById: admin.id,
    },
    create: {
      userId: affiliateUser.id,
      level: "PRO",
      city: "Casablanca",
      approvedAt: new Date(),
      approvedById: admin.id,
      bankName: "Banque Tijara",
      rib: "000000000000000000000000",
    },
  });

  const categoryIds = new Map<string, string>();
  for (const [nameFr, nameAr, slug] of categories) {
    const category = await prisma.category.upsert({
      where: { slug },
      update: { nameFr, nameAr, published: true },
      create: { nameFr, nameAr, slug, published: true },
    });
    categoryIds.set(slug, category.id);
  }

  await prisma.walletTransaction.deleteMany({
    where: { affiliateId: affiliate.id },
  });
  await prisma.invoiceLine.deleteMany({
    where: { invoice: { affiliateId: affiliate.id } },
  });
  await prisma.invoice.deleteMany({ where: { affiliateId: affiliate.id } });
  await prisma.order.deleteMany({ where: { affiliateId: affiliate.id } });
  await prisma.cart.deleteMany({
    where: { affiliateProfileId: affiliate.id },
  });
  await prisma.product.deleteMany({
    where: { code: { in: replacedDemoProductCodes } },
  });

  const productIds: string[] = [];
  for (const item of catalogProducts) {
    const colorList = item.colors.join(", ");
    const sizeList = item.sizes.join(", ");
    const descriptionFr =
      item.descriptionFr ??
      `${item.nameFr}, issu du catalogue Stock Dyali. Couleurs : ${colorList}. Tailles : ${sizeList}.`;
    const descriptionAr =
      item.descriptionAr ??
      `${item.nameAr} من كتالوج Stock Dyali. الألوان: ${colorList}. المقاسات: ${sizeList}.`;
    const product = await prisma.product.upsert({
      where: { code: item.code },
      update: {
        categoryId: categoryIds.get(item.category)!,
        slug: item.slug,
        nameFr: item.nameFr,
        nameAr: item.nameAr,
        descriptionFr,
        descriptionAr,
        videoUrl: item.videoUrl ?? null,
        mediaDriveUrl: item.mediaDriveUrl ?? null,
        salePrice: item.sale,
        productPrice: item.cost,
        serviceFee: item.fee,
        commission: item.commission,
        published: true,
        publishedAt: new Date(),
      },
      create: {
        categoryId: categoryIds.get(item.category)!,
        code: item.code,
        slug: item.slug,
        nameFr: item.nameFr,
        nameAr: item.nameAr,
        descriptionFr,
        descriptionAr,
        videoUrl: item.videoUrl,
        mediaDriveUrl: item.mediaDriveUrl,
        productPrice: item.cost,
        serviceFee: item.fee,
        salePrice: item.sale,
        commission: item.commission,
        published: true,
        publishedAt: new Date(),
      },
    });

    await prisma.productImage.deleteMany({ where: { productId: product.id } });
    await prisma.productVariant.deleteMany({
      where: { productId: product.id },
    });
    await prisma.productVariant.createMany({
      data: item.colors.flatMap((color, colorIndex) =>
        item.sizes.map((size, sizeIndex) => ({
          productId: product.id,
          sku: `${item.code}-${variantToken(color)}-${variantToken(size)}-${colorIndex + 1}-${sizeIndex + 1}`,
          color,
          size,
          stock: 10,
          active: true,
        })),
      ),
    });
    if (item.images?.length) {
      await prisma.productImage.createMany({
        data: item.images.map((url, index) => ({
          productId: product.id,
          objectKey: `external/stockdyali/${item.sourceId ?? item.code}/${index + 1}-${url.split("/").at(-1) ?? "image"}`,
          url,
          altFr: item.nameFr,
          altAr: item.nameAr,
          sortOrder: index,
        })),
      });
    }
    productIds.push(product.id);
  }

  const cities = await syncImportedCities(prisma);

  /*
   * Stock Dyali exposes color and size options but not a reliable stock count
   * per combination. The catalog seed therefore starts each imported variant
   * at 10 units; production inventory can be adjusted from catalog management.
   */

  const statuses = [
    ["NEW", "NOT_READY", "NOT_READY"],
    ["CALLING", "NOT_READY", "NOT_READY"],
    ["CONFIRMED", "AWAITING_PICKUP", "NOT_READY"],
    ["CONFIRMED", "IN_TRANSIT", "NOT_READY"],
    ["CONFIRMED", "DELIVERED", "PAID"],
    ["CONFIRMED", "RETURNED", "NOT_READY"],
  ] as const;
  for (let index = 0; index < statuses.length; index++) {
    const [confirmationStatus, deliveryStatus, financeStatus] = statuses[index];
    const product = await prisma.product.findUniqueOrThrow({
      where: { id: productIds[index] },
      include: { variants: true },
    });
    const delivered = deliveryStatus === "DELIVERED";
    const paid = financeStatus === "PAID";
    const order = await prisma.order.create({
      data: {
        code: `TJ-2026-${String(index + 1).padStart(5, "0")}`,
        affiliateId: affiliate.id,
        createdById: affiliateUser.id,
        customerName: `Client ${index + 1}`,
        phone: `06111111${String(index + 1).padStart(2, "0")}`,
        cityId: cities[index % cities.length].id,
        address: "Quartier Maarif, Casablanca",
        confirmationStatus,
        deliveryStatus,
        financeStatus,
        confirmedAt: confirmationStatus === "CONFIRMED" ? new Date() : null,
        deliveredAt: delivered ? new Date() : null,
        paidAt: paid ? new Date() : null,
        lines: {
          create: {
            productId: product.id,
            variantId: product.variants[0].id,
            productNameFr: product.nameFr,
            productNameAr: product.nameAr,
            sku: product.variants[0].sku,
            quantity: 1,
            productPrice: product.productPrice,
            serviceFee: product.serviceFee,
            salePrice: product.salePrice,
            commission: product.commission,
            commissionPayable: paid,
          },
        },
        history: {
          create: {
            actorId: affiliateUser.id,
            statusType: "CONFIRMATION",
            toStatus: confirmationStatus,
            note: "Order created",
          },
        },
      },
    });
    if (paid)
      await prisma.walletTransaction.create({
        data: {
          reference: `WT-${index + 1}`,
          affiliateId: affiliate.id,
          orderId: order.id,
          type: "COMMISSION_CREDIT",
          amount: product.commission,
          status: "COMPLETED",
          note: "Commission disponible",
        },
      });
  }
  await prisma.announcement.upsert({
    where: { id: "welcome" },
    update: { published: true },
    create: {
      id: "welcome",
      titleFr: "Bienvenue dans votre espace partenaire",
      titleAr: "مرحباً بك في مساحة الشريك",
      bodyFr:
        "Parcourez les produits et suivez vos commandes depuis votre tableau de bord.",
      bodyAr: "تصفح المنتجات وتابع طلباتك من لوحة التحكم.",
      startsAt: new Date("2026-01-01"),
      endsAt: new Date("2027-12-31"),
      published: true,
    },
  });
  console.log("Seed data ready: admin@tijara.test and affiliate@tijara.test");
}

main().finally(() => prisma.$disconnect());
