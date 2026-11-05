import "dotenv/config";

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

import { deleteObject, downloadObject } from "../src/server/media/storage";
import { toWebp } from "../src/server/media/to-webp";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(connectionString),
});

const CONVERTIBLE = /\.(jpe?g|png|gif|bmp|tiff?)$/i;

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

async function main() {
  const images = await prisma.productImage.findMany({
    where: { objectKey: { not: { startsWith: "external/" } } },
    orderBy: [{ productId: "asc" }, { sortOrder: "asc" }],
  });

  const targets = images.filter((image) => CONVERTIBLE.test(image.objectKey));
  console.log(
    `Found ${images.length} product images, converting ${targets.length} to WebP…`,
  );

  let converted = 0;
  let failed = 0;
  let bytesBefore = 0;
  let bytesAfter = 0;

  for (const image of targets) {
    try {
      const object = await downloadObject(image.objectKey);
      bytesBefore += object.bytes.byteLength;

      const webp = await toWebp(object.bytes);
      bytesAfter += webp.bytes.byteLength;

      const nextKey = image.objectKey.replace(CONVERTIBLE, ".webp");
      const url = await putBytes(nextKey, webp.bytes, webp.contentType);

      await prisma.productImage.update({
        where: { id: image.id },
        data: { objectKey: nextKey, url },
      });

      if (nextKey !== image.objectKey) {
        await deleteObject(image.objectKey).catch(() => undefined);
      }

      converted += 1;
      const saved = object.bytes.byteLength - webp.bytes.byteLength;
      const pct = Math.round((saved / object.bytes.byteLength) * 100);
      console.log(
        `  ✓ ${image.objectKey} → ${nextKey} (${(object.bytes.byteLength / 1024).toFixed(0)}KB → ${(webp.bytes.byteLength / 1024).toFixed(0)}KB, −${pct}%)`,
      );
    } catch (error) {
      failed += 1;
      console.warn(
        `  ✗ ${image.objectKey}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  console.log(`\nDone: ${converted} converted, ${failed} failed.`);
  if (bytesBefore > 0) {
    console.log(
      `Size: ${(bytesBefore / 1024 / 1024).toFixed(1)}MB → ${(bytesAfter / 1024 / 1024).toFixed(1)}MB (−${Math.round(((bytesBefore - bytesAfter) / bytesBefore) * 100)}%)`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
