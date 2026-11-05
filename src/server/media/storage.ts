import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
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

function localRootCandidates() {
  const roots: string[] = [];
  const persist = process.env.MEDIA_PERSIST_ROOT?.trim();
  const override = process.env.MEDIA_LOCAL_ROOT?.trim();
  // Prefer durable storage first (Hostinger deploys wipe hbuilds/current).
  if (persist) roots.push(/*turbopackIgnore: true*/ persist);
  if (override) roots.push(/*turbopackIgnore: true*/ override);
  roots.push(join(process.cwd(), ".data", "uploads"));
  // Hostinger layout: hbuilds/current/nodejs → hbuilds/media/uploads
  roots.push(
    /*turbopackIgnore: true*/ join(process.cwd(), "../../../media/uploads"),
  );
  return [...new Set(roots)];
}

function preferredLocalRoot() {
  return localRootCandidates()[0]!;
}

function localObjectPath(key: string, root = preferredLocalRoot()) {
  return join(/*turbopackIgnore: true*/ root, ...safeKeyParts(key));
}

async function resolveExistingLocalPath(key: string) {
  const parts = safeKeyParts(key);
  for (const root of localRootCandidates()) {
    const path = join(/*turbopackIgnore: true*/ root, ...parts);
    try {
      await access(path);
      return path;
    } catch {
      // try next root
    }
  }
  return localObjectPath(key);
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
    for (const root of localRootCandidates()) {
      try {
        await unlink(localObjectPath(key, root));
      } catch (error) {
        if (
          !(
            error instanceof Error &&
            "code" in error &&
            error.code === "ENOENT"
          )
        )
          throw error;
      }
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
      bytes: new Uint8Array(await readFile(await resolveExistingLocalPath(key))),
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
