import "dotenv/config";

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

import {
  catalogProducts,
  type CatalogProductSeed,
} from "../prisma/catalog-products";
import { toWebp } from "../src/server/media/to-webp";

const LIMIT = Number(process.env.STOCKDYALI_IMPORT_LIMIT ?? 12);
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(connectionString),
});

function usesLocalStorage() {
  return process.env.MEDIA_STORAGE_DRIVER === "local";
}

function localObjectPath(key: string) {
  const override = process.env.MEDIA_LOCAL_ROOT?.trim();
  const root = override || join(process.cwd(), ".data", "uploads");
  return join(root, ...key.split("/").filter(Boolean));
}

function publicUrlForKey(key: string) {
  if (usesLocalStorage()) {
    return `/api/media/${key.split("/").map(encodeURIComponent).join("/")}`;
  }
  const base =
    process.env.S3_PUBLIC_BASE_URL?.replace(/\/$/, "") ??
    `${process.env.S3_ENDPOINT?.replace(/\/$/, "")}/${process.env.S3_BUCKET}`;
  return `${base}/${key}`;
}

async function putBytes(key: string, bytes: Uint8Array, contentType: string) {
  if (usesLocalStorage()) {
    const path = localObjectPath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
    return publicUrlForKey(key);
  }
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const endpoint = process.env.S3_ENDPOINT!;
  const bucket = process.env.S3_BUCKET!;
  const client = new S3Client({
    endpoint,
    region: process.env.S3_REGION ?? "us-east-1",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
  });
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: bytes,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  return publicUrlForKey(key);
}

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

async function downloadImage(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; TijaraImporter/1.0; +https://tijara.local)",
      Accept: "image/*,*/*",
      Referer: "https://app.stockdyali.ma/",
    },
  });
  if (!response.ok) {
    throw new Error(`Image download failed ${response.status} for ${url}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 500) {
    throw new Error(`Image too small (${bytes.byteLength}) for ${url}`);
  }
  return bytes;
}

async function importProductImages(
  product: CatalogProductSeed,
  productId: string,
) {
  const sourceId = product.sourceId ?? product.code;
  const images = product.images ?? [];
  const created: Array<{
    productId: string;
    objectKey: string;
    url: string;
    altFr: string;
    altAr: string;
    sortOrder: number;
  }> = [];

  for (const [index, imageUrl] of images.entries()) {
    try {
      const source = await downloadImage(imageUrl);
      const webp = await toWebp(source);
      const objectKey = `products/stockdyali/${sourceId}/${String(index + 1).padStart(2, "0")}.webp`;
      const url = await putBytes(objectKey, webp.bytes, webp.contentType);
      created.push({
        productId,
        objectKey,
        url,
        altFr: product.nameFr,
        altAr: product.nameAr,
        sortOrder: index,
      });
      process.stdout.write(".");
    } catch (error) {
      console.warn(
        `\n  skip image ${index + 1} for ${product.code}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  await prisma.productImage.deleteMany({ where: { productId } });
  if (created.length) {
    await prisma.productImage.createMany({ data: created });
  }
  return created.length;
}

async function main() {
  const selected = catalogProducts.slice(0, LIMIT);
  console.log(
    `Importing ${selected.length} Stock Dyali products with downloaded images…`,
  );
  console.log(
    `Storage: ${usesLocalStorage() ? "local (.data/uploads)" : "S3"}`,
  );

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

  let imported = 0;
  let imageCount = 0;

  for (const item of selected) {
    const colorList = item.colors.join(", ");
    const sizeList = item.sizes.join(", ");
    const descriptionFr =
      item.descriptionFr ??
      `${item.nameFr}. Couleurs : ${colorList}. Tailles : ${sizeList}.`;
    const descriptionAr =
      item.descriptionAr ??
      `${item.nameAr}. الألوان: ${colorList}. المقاسات: ${sizeList}.`;

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
        stock: 25,
        active: true,
      })),
    );
    await prisma.productVariant.updateMany({
      where: { productId: product.id },
      data: { active: false },
    });
    for (const variant of variants) {
      await prisma.productVariant.upsert({
        where: { sku: variant.sku },
        update: {
          color: variant.color,
          size: variant.size,
          stock: variant.stock,
          active: true,
          productId: product.id,
        },
        create: variant,
      });
    }

    process.stdout.write(`${item.code} ${item.nameFr} `);
    const savedImages = await importProductImages(item, product.id);
    imageCount += savedImages;
    imported += 1;
    console.log(` ${savedImages} images · ${variants.length} variants`);
  }

  console.log(
    `\nDone: ${imported} products, ${imageCount} images stored locally (not remote links).`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
