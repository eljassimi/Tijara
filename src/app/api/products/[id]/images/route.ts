import JSZip from "jszip";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getSessionUser, sessionUserCan } from "@/server/auth/session";
import { downloadObject } from "@/server/media/storage";

export const runtime = "nodejs";

const REMOTE_IMAGE_HOSTS = new Set(["app.stockdyali.ma"]);
const MAX_REMOTE_IMAGE_BYTES = 15 * 1024 * 1024;

async function resolveImage(image: { objectKey: string; url: string }) {
  if (!image.objectKey.startsWith("external/"))
    return downloadObject(image.objectKey);

  const url = new URL(image.url);
  if (url.protocol !== "https:" || !REMOTE_IMAGE_HOSTS.has(url.hostname))
    throw new Error("Remote image host is not allowed");
  const response = await fetch(url, {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Remote image returned ${response.status}`);
  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_REMOTE_IMAGE_BYTES)
    throw new Error("Remote image exceeds the download limit");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_REMOTE_IMAGE_BYTES)
    throw new Error("Remote image exceeds the download limit");
  return {
    bytes,
    contentType:
      response.headers.get("content-type") ?? "application/octet-stream",
  };
}

function imageExtension(
  image: { objectKey: string; url: string },
  type: string,
) {
  const source = image.objectKey.startsWith("external/")
    ? new URL(image.url).pathname
    : image.objectKey;
  const extension = source
    .split(".")
    .pop()
    ?.replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
  if (extension && extension.length <= 5) return extension;
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  return "jpg";
}

function safeFilename(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "produit"
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const canManageCatalog = sessionUserCan(user, "catalog:manage");
  if (!canManageCatalog && !sessionUserCan(user, "orders:view"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const product = await prisma.product.findUnique({
    where: { id },
    select: {
      nameFr: true,
      slug: true,
      published: true,
      images: {
        select: { objectKey: true, url: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  if (!product || (!product.published && !canManageCatalog))
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (product.images.length === 0)
    return NextResponse.json({ error: "No images" }, { status: 404 });

  const zip = new JSZip();
  const baseName = safeFilename(product.slug || product.nameFr);
  const objects = await Promise.allSettled(
    product.images.map(async (image) => ({
      image,
      object: await resolveImage(image),
    })),
  );
  const availableObjects = objects.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  if (availableObjects.length === 0)
    return NextResponse.json(
      { error: "Product images are temporarily unavailable" },
      { status: 502 },
    );
  availableObjects.forEach(({ image, object }, index) => {
    const extension = imageExtension(image, object.contentType);
    zip.file(
      `${String(index + 1).padStart(2, "0")}-${baseName}.${extension}`,
      object.bytes,
    );
  });
  const archive = await zip.generateAsync({
    type: "uint8array",
    compression: "STORE",
  });
  const body = new Uint8Array(archive.byteLength);
  body.set(archive);
  return new Response(body.buffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${baseName}-images.zip"`,
      "Content-Length": String(archive.byteLength),
      "Cache-Control": "private, no-store",
    },
  });
}
