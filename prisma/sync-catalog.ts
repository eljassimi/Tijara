import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { catalogProducts } from "./catalog-products";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

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
  const categories = await Promise.all(
    [
      ["Vêtements femme", "ملابس نسائية", "vetements-femme"],
      ["Vêtements homme", "ملابس رجالية", "vetements-homme"],
    ].map(([nameFr, nameAr, slug]) =>
      prisma.category.upsert({
        where: { slug },
        update: { nameFr, nameAr, published: true },
        create: { nameFr, nameAr, slug, published: true },
      }),
    ),
  );
  const categoryIds = new Map(
    categories.map((category) => [category.slug, category.id]),
  );

  await prisma.product.updateMany({
    where: { code: { in: replacedDemoProductCodes } },
    data: { published: false, publishedAt: null },
  });

  for (const item of catalogProducts) {
    const colorList = item.colors.join(", ");
    const sizeList = item.sizes.join(", ");
    const descriptionFr =
      item.descriptionFr ??
      `${item.nameFr}, issu du catalogue Stock Dyali. Couleurs : ${colorList}. Tailles : ${sizeList}.`;
    const descriptionAr =
      item.descriptionAr ??
      `${item.nameAr} من كتالوج Stock Dyali. الألوان: ${colorList}. المقاسات: ${sizeList}.`;
    const values = {
      categoryId: categoryIds.get(item.category)!,
      slug: item.slug,
      nameFr: item.nameFr,
      nameAr: item.nameAr,
      descriptionFr,
      descriptionAr,
      videoUrl: item.videoUrl ?? null,
      mediaDriveUrl: item.mediaDriveUrl ?? null,
      productPrice: item.cost,
      serviceFee: item.fee,
      salePrice: item.sale,
      commission: item.commission,
      published: true,
      publishedAt: new Date(),
    };
    const product = await prisma.product.upsert({
      where: { code: item.code },
      update: values,
      create: { code: item.code, ...values },
    });

    const variants = item.colors.flatMap((color, colorIndex) =>
      item.sizes.map((size, sizeIndex) => ({
        productId: product.id,
        sku: `${item.code}-${variantToken(color)}-${variantToken(size)}-${colorIndex + 1}-${sizeIndex + 1}`,
        color,
        size,
        stock: 10,
        active: true,
      })),
    );
    await prisma.productVariant.updateMany({
      where: { productId: product.id },
      data: { active: false },
    });
    await prisma.productVariant.createMany({
      data: variants,
      skipDuplicates: true,
    });
    await prisma.productVariant.updateMany({
      where: { sku: { in: variants.map((variant) => variant.sku) } },
      data: { active: true },
    });

    await prisma.productImage.deleteMany({ where: { productId: product.id } });
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
  }

  console.log(
    `Catalog synchronized: ${catalogProducts.length} published products; existing orders and finance records preserved.`,
  );
}

main().finally(() => prisma.$disconnect());
