import { createHash } from "node:crypto";

import { Prisma, type Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { createOrderSchema } from "@/lib/validation/order";
import {
  affiliateIdFor,
  appendImportedOrderLine,
  createAffiliateOrder,
} from "@/server/orders/service";
import {
  parseOrderCsv,
  parseOrderWorkbook,
  type OrderImportRow,
} from "./import-format";

type Actor = { id: string; role: Role };

export type OrderImportResult = {
  jobId: string;
  total: number;
  imported: number;
  orders: number;
  skipped: number;
  errors: string[];
  failed: boolean;
};

function fallbackReference(row: OrderImportRow) {
  const stable = [
    row.customerName,
    row.phone,
    row.city,
    row.variantSku || row.productName,
    row.productVariant,
    row.quantity,
  ]
    .map((value) => value.trim().toLocaleLowerCase("fr"))
    .join("|");
  return `row-${createHash("sha256").update(stable).digest("hex").slice(0, 24)}`;
}

function normalizeCatalogValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f\u064B-\u065F]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function rowError(locale: "fr" | "ar", rowNumber: number, message: string) {
  return locale === "ar"
    ? `السطر ${rowNumber}: ${message}`
    : `Ligne ${rowNumber} : ${message}`;
}

function friendlyError(locale: "fr" | "ar", error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.startsWith("UnknownCity:")) {
    const city = message.slice("UnknownCity:".length);
    return locale === "ar"
      ? `المدينة «${city}» غير مدعومة.`
      : `La ville « ${city} » n’est pas prise en charge.`;
  }
  if (message.startsWith("Duplicate:")) {
    const code = message.slice("Duplicate:".length);
    return locale === "ar"
      ? `طلب مماثل موجود بالفعل (${code}).`
      : `Une commande similaire existe déjà (${code}).`;
  }
  if (message === "Product is unavailable")
    return locale === "ar"
      ? "المنتج غير متاح أو المخزون غير كافٍ."
      : "Le produit est indisponible ou le stock est insuffisant.";
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  )
    return locale === "ar"
      ? "تمت مزامنة هذا الطلب من قبل."
      : "Cette commande a déjà été synchronisée.";
  return locale === "ar" ? "بيانات غير صالحة." : "Données invalides.";
}

export async function runOrderImport({
  actor,
  locale,
  buffer,
  format,
  sourceObjectKey,
  importSource,
  useFallbackReference,
}: {
  actor: Actor;
  locale: "fr" | "ar";
  buffer: Buffer;
  format: "xlsx" | "csv";
  sourceObjectKey: string;
  importSource: string;
  useFallbackReference: boolean;
}): Promise<OrderImportResult> {
  const job = await prisma.importJob.create({
    data: {
      type: "EXCEL_IMPORT",
      status: "RUNNING",
      createdById: actor.id,
      sourceObjectKey,
      startedAt: new Date(),
    },
  });
  let rows: OrderImportRow[];
  try {
    rows =
      format === "csv"
        ? await parseOrderCsv(buffer)
        : await parseOrderWorkbook(buffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    await prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        progress: 100,
        error: message,
        completedAt: new Date(),
      },
    });
    return {
      jobId: job.id,
      total: 0,
      imported: 0,
      orders: 0,
      skipped: 0,
      errors: [message],
      failed: true,
    };
  }

  const affiliateId = await affiliateIdFor(actor.id, actor.role);
  const catalog = await prisma.product.findMany({
    where: { published: true },
    include: { variants: { where: { active: true, stock: { gt: 0 } } } },
  });
  let imported = 0;
  let importedOrders = 0;
  let skipped = 0;
  const errors: string[] = [];
  const catalogIssues = new Map<string, { message: string; rows: number[] }>();
  const createdOrders = new Map<string, string>();
  const addCatalogIssue = (key: string, message: string, rowNumber: number) => {
    const existing = catalogIssues.get(key);
    catalogIssues.set(key, {
      message,
      rows: [...(existing?.rows ?? []), rowNumber],
    });
  };
  for (const row of rows) {
    let variant: { id: string } | undefined;
    if (row.variantSku.trim()) {
      variant =
        (await prisma.productVariant.findUnique({
          where: { sku: row.variantSku.trim().toUpperCase() },
          select: { id: true },
        })) ?? undefined;
    } else if (row.productName.trim()) {
      const targetProduct = normalizeCatalogValue(row.productName);
      const product = catalog.find((item) =>
        [item.code, item.slug, item.nameFr, item.nameAr ?? ""].some(
          (value) => normalizeCatalogValue(value) === targetProduct,
        ),
      );
      if (!product) {
        const key = `product:${targetProduct}`;
        addCatalogIssue(
          key,
          locale === "ar"
            ? `المنتج «${row.productName}» غير موجود في كتالوج Tijara.`
            : `Le produit « ${row.productName} » n’existe pas dans le catalogue Tijara.`,
          row.rowNumber,
        );
        continue;
      }
      if (product.variants.length === 1) {
        variant = product.variants[0];
      } else {
        const requestedParts = row.productVariant
          .split(/[\/,|]+/)
          .map(normalizeCatalogValue)
          .filter(Boolean);
        const matchingVariant = product.variants.find((item) => {
          const values = [item.sku, item.size ?? "", item.color ?? ""].map(
            normalizeCatalogValue,
          );
          return (
            requestedParts.length > 0 &&
            requestedParts.every((part) =>
              values.some((value) => value === part || value.includes(part)),
            )
          );
        });
        if (matchingVariant) variant = matchingVariant;
        else {
          const key = `variant:${targetProduct}:${normalizeCatalogValue(row.productVariant)}`;
          addCatalogIssue(
            key,
            locale === "ar"
              ? `النوع «${row.productVariant || "—"}» غير موجود للمنتج «${row.productName}».`
              : `La variante « ${row.productVariant || "—"} » est introuvable pour « ${row.productName} ».`,
            row.rowNumber,
          );
          continue;
        }
      }
    }
    if (!variant) {
      const reference = row.variantSku || row.productName || "—";
      addCatalogIssue(
        `reference:${normalizeCatalogValue(reference)}`,
        locale === "ar"
          ? `مرجع المنتج «${reference}» غير موجود.`
          : `La référence produit « ${reference} » est introuvable.`,
        row.rowNumber,
      );
      continue;
    }
    const parsed = createOrderSchema.safeParse({
      customerName: row.customerName,
      phone: row.phone,
      city: row.city,
      variantId: variant.id,
      quantity: row.quantity,
      address: row.address || undefined,
      notes: row.notes || undefined,
    });
    if (!parsed.success) {
      const fieldLabels: Record<string, string> =
        locale === "ar"
          ? {
              customerName: "اسم الزبون",
              phone: "الهاتف",
              city: "المدينة",
              address: "العنوان",
              variantId: "المنتج",
              quantity: "الكمية",
            }
          : {
              customerName: "nom du client",
              phone: "téléphone",
              city: "ville",
              address: "adresse",
              variantId: "produit",
              quantity: "quantité",
            };
      const fields = [
        ...new Set(
          parsed.error.issues.map((issue) => String(issue.path[0] ?? "row")),
        ),
      ]
        .map((field) => fieldLabels[field] ?? field)
        .join(", ");
      errors.push(
        rowError(
          locale,
          row.rowNumber,
          locale === "ar" ? `تحقق من: ${fields}.` : `Vérifiez : ${fields}.`,
        ),
      );
      continue;
    }
    const externalReference =
      row.orderId.trim() ||
      (useFallbackReference ? fallbackReference(row) : undefined);
    if (externalReference && !createdOrders.has(externalReference)) {
      const existing = await prisma.order.findFirst({
        where: { affiliateId, importSource, externalReference },
        select: { id: true },
      });
      if (existing) {
        skipped += 1;
        continue;
      }
    }
    try {
      const currentOrderId = externalReference
        ? createdOrders.get(externalReference)
        : undefined;
      if (currentOrderId && externalReference) {
        await appendImportedOrderLine(actor, currentOrderId, parsed.data, {
          importSource,
          externalReference,
        });
      } else {
        const order = await createAffiliateOrder(actor, parsed.data, {
          importSource,
          externalReference,
        });
        importedOrders += 1;
        if (externalReference) createdOrders.set(externalReference, order.id);
      }
      imported += 1;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        skipped += 1;
      } else {
        errors.push(
          rowError(locale, row.rowNumber, friendlyError(locale, error)),
        );
      }
    }
  }

  const catalogErrors = [...catalogIssues.values()].map(
    ({ message, rows }) =>
      `${locale === "ar" ? "السطور" : rows.length > 1 ? "Lignes" : "Ligne"} ${rows.join(", ")} : ${message}`,
  );
  const allErrors = [...catalogErrors, ...errors];
  const failed = imported === 0 && skipped === 0;
  await prisma.importJob.update({
    where: { id: job.id },
    data: {
      status: failed ? "FAILED" : "COMPLETED",
      progress: 100,
      totalRows: rows.length,
      processedRows: imported,
      skippedRows: skipped,
      error: allErrors.slice(0, 40).join("\n") || null,
      completedAt: new Date(),
    },
  });
  return {
    jobId: job.id,
    total: rows.length,
    imported,
    orders: importedOrders,
    skipped,
    errors: allErrors,
    failed,
  };
}
