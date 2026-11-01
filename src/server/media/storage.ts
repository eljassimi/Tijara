import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

function usesLocalStorage() {
  return process.env.MEDIA_STORAGE_DRIVER === "local";
}

function safeKeyParts(key: string) {
  const parts = key.split("/").filter(Boolean);
  if (
    !parts.length ||
    parts.some((part) => part === "." || part === ".." || part.includes("\\"))
  )
    throw new Error("Invalid storage key");
  return parts;
}

function localObjectPath(key: string) {
  const parts = safeKeyParts(key);
  const override = process.env.MEDIA_LOCAL_ROOT?.trim();
  // Keep the default root statically scoped so Turbopack does not trace the
  // whole project. Override paths are ignored for filesystem tracing.
  if (override) return join(/*turbopackIgnore: true*/ override, ...parts);
  return join(process.cwd(), ".data", "uploads", ...parts);
}

function contentTypeForKey(key: string) {
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".webp")) return "image/webp";
  if (key.endsWith(".jpg") || key.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

function storageConfig() {
  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey)
    throw new Error("Object storage is not configured");
  return { endpoint, bucket, accessKeyId, secretAccessKey };
}

function client() {
  const config = storageConfig();
  return new S3Client({
    endpoint: config.endpoint,
    region: process.env.S3_REGION ?? "us-east-1",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export async function uploadObject(key: string, file: File) {
  if (usesLocalStorage()) {
    const path = localObjectPath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, new Uint8Array(await file.arrayBuffer()));
    return `/api/media/${safeKeyParts(key).map(encodeURIComponent).join("/")}`;
  }
  const config = storageConfig();
  await client().send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: new Uint8Array(await file.arrayBuffer()),
      ContentType: file.type,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  const base =
    process.env.S3_PUBLIC_BASE_URL?.replace(/\/$/, "") ??
    `${config.endpoint.replace(/\/$/, "")}/${config.bucket}`;
  return `${base}/${key}`;
}

export async function deleteObject(key: string) {
  if (usesLocalStorage()) {
    try {
      await unlink(localObjectPath(key));
    } catch (error) {
      if (!(
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ))
        throw error;
    }
    return;
  }
  const config = storageConfig();
  await client().send(
    new DeleteObjectCommand({ Bucket: config.bucket, Key: key }),
  );
}

export async function downloadObject(key: string) {
  if (usesLocalStorage())
    return {
      bytes: new Uint8Array(await readFile(localObjectPath(key))),
      contentType: contentTypeForKey(key),
    };
  const config = storageConfig();
  const result = await client().send(
    new GetObjectCommand({ Bucket: config.bucket, Key: key }),
  );
  if (!result.Body) throw new Error("Stored object has no body");
  return {
    bytes: await result.Body.transformToByteArray(),
    contentType: result.ContentType ?? "application/octet-stream",
  };
}
