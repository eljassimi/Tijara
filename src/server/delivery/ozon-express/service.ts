import { randomBytes } from "node:crypto";

import type {
  Courier,
  DeliveryStatus,
  Prisma,
  Role,
} from "@prisma/client";

import { customerOrderTotal } from "@/lib/order-totals";
import { prisma } from "@/lib/prisma";
import { HandoffError } from "@/server/orders/handoff-errors";
import { changeDeliveryStatus } from "@/server/orders/service";
import { confirmationAssignmentScope } from "@/server/orders/confirmation-assignment";
import { deliveryTransitions } from "@/server/orders/state-machine";

import { resolveOzonCityForParcel } from "./cities";
import {
  addOzonParcel,
  addParcelsToOzonDeliveryNote,
  createOzonDeliveryNote,
  extractProviderStatus,
  getOzonTracking,
  getOzonTrackingBulk,
  OzonExpressError,
  ozonDeliveryNotePdfUrls,
  saveOzonDeliveryNote,
  verifyOzonCredentials,
} from "./client";
import { buildOzonParcelNature, buildOzonParcelNote } from "./parcel-note";
import { isDeliveryProgress, mapOzonStatusToDelivery } from "./status-map";
import type { OzonCredentials } from "./types";

export { buildOzonParcelNote } from "./parcel-note";

type Actor = { id: string; role: Role };

export function isOzonCourier(
  courier: Pick<
    Courier,
    "provider" | "integrationMode" | "integrationStatus" | "active"
  >,
) {
  return (
    courier.active &&
    courier.provider === "OZON_EXPRESS" &&
    courier.integrationMode === "API" &&
    courier.integrationStatus === "CONNECTED"
  );
}

export function credentialsFromCourier(
  courier: Pick<Courier, "externalAccountId" | "apiKey" | "apiBaseUrl">,
): OzonCredentials {
  const customerId = courier.externalAccountId?.trim();
  const apiKey = courier.apiKey?.trim();
  if (!customerId || !apiKey) {
    throw new HandoffError("company-inactive");
  }
  return {
    customerId,
    apiKey,
    apiBaseUrl: courier.apiBaseUrl,
  };
}

/** Prefer the single connected Ozon Express API courier for auto-handoff. */
export async function findDefaultOzonCourier() {
  return prisma.courier.findFirst({
    where: {
      active: true,
      provider: "OZON_EXPRESS",
      integrationMode: "API",
      integrationStatus: "CONNECTED",
      externalAccountId: { not: null },
      apiKey: { not: null },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "asc" }],
  });
}

/**
 * After confirmation: push the parcel to Ozon Express without blocking the
 * confirmator if the API fails (order stays FAILED for manual retry).
 * On success, also create/save a delivery note so pickup paperwork exists.
 */
export async function autoSendConfirmedOrderToOzon(
  actor: Actor,
  orderId: string,
) {
  const courier = await findDefaultOzonCourier();
  if (!courier) {
    return { ok: false as const, reason: "no-courier" as const };
  }
  try {
    const updated = await sendOrderViaOzon(actor, orderId, courier.id);
    const withNote = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        parcelCode: true,
        deliveryNote: { select: { externalRef: true } },
      },
    });
    return {
      ok: true as const,
      courierId: courier.id,
      parcelCode: withNote?.parcelCode ?? updated.parcelCode ?? undefined,
      deliveryNoteRef: withNote?.deliveryNote?.externalRef,
    };
  } catch (error) {
    return {
      ok: false as const,
      reason: "api-failed" as const,
      courierId: courier.id,
      error:
        error instanceof HandoffError
          ? error.detail || error.code
          : error instanceof Error
            ? error.message
            : "failed",
    };
  }
}

function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("212") && digits.length === 12) {
    return `0${digits.slice(3)}`;
  }
  return phone.trim();
}

async function loadOrderForShip(orderId: string) {
  return prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      city: true,
      lines: {
        include: {
          variant: { select: { size: true, color: true } },
        },
      },
      courier: true,
    },
  });
}

export async function sendOrderViaOzon(
  actor: Actor,
  orderId: string,
  courierId: string,
  options: { note?: string; createDeliveryNote?: boolean } = {},
) {
  if (!(["SUPER_ADMIN", "CONFIRMATION_AGENT"] as Role[]).includes(actor.role)) {
    throw new HandoffError("forbidden");
  }

  const courier = await prisma.courier.findFirst({
    where: { id: courierId, active: true },
  });
  let order = await loadOrderForShip(orderId);
  if (!courier || !isOzonCourier(courier)) {
    throw new HandoffError("company-inactive");
  }
  if (order.confirmationStatus !== "CONFIRMED") {
    throw new HandoffError("not-confirmed");
  }
  if (["DELIVERED", "RETURNED", "REFUSED"].includes(order.deliveryStatus)) {
    throw new HandoffError("order-closed");
  }
  if (!["NOT_SENT", "FAILED"].includes(order.deliverySyncStatus)) {
    throw new HandoffError("already-sent");
  }
  if (!order.address?.trim()) {
    throw new HandoffError("address-required");
  }

  const credentials = credentialsFromCourier(courier);
  const price = customerOrderTotal(order.lines);
  const products = order.lines.map((line) => ({
    ref: line.sku,
    qnty: line.quantity,
  }));
  const stock = courier.stockMode === 1 ? 1 : 0;
  const allowOpen = courier.allowOpen === 2 ? 2 : 1;

  async function resolveCity() {
    try {
      return await resolveOzonCityForParcel(
        prisma,
        order.city,
        order.address || "",
      );
    } catch {
      throw new HandoffError("city-unmapped");
    }
  }

  let resolvedCity = await resolveCity();

  try {
    let created;
    try {
      const parcelAddress = order.address?.trim() || "";
      created = await addOzonParcel(credentials, {
        trackingNumber: order.code,
        receiver: order.customerName,
        phone: normalizePhone(order.phone),
        cityId: resolvedCity.ozonCityId,
        address: parcelAddress,
        note: buildOzonParcelNote(order, options.note),
        price,
        nature: buildOzonParcelNature(order.lines),
        stock,
        open: allowOpen,
        products: stock === 1 ? products : undefined,
      });
    } catch (firstError) {
      // Stale generic city ids (old Casablanca #97) → resync districts and retry once.
      const inactiveCity =
        firstError instanceof OzonExpressError &&
        /city not active/i.test(firstError.message);
      if (!inactiveCity) throw firstError;
      const { syncCitiesFromOzon } = await import("./cities");
      await syncCitiesFromOzon(prisma, credentials.apiBaseUrl || undefined);
      order = await loadOrderForShip(orderId);
      resolvedCity = await resolveCity();
      const parcelAddress = order.address?.trim() || "";
      created = await addOzonParcel(credentials, {
        trackingNumber: order.code,
        receiver: order.customerName,
        phone: normalizePhone(order.phone),
        cityId: resolvedCity.ozonCityId,
        address: parcelAddress,
        note: buildOzonParcelNote(order, options.note),
        price,
        nature: buildOzonParcelNature(order.lines),
        stock,
        open: allowOpen,
        products: stock === 1 ? products : undefined,
      });
    }

    const duplicate = await prisma.order.findFirst({
      where: {
        id: { not: order.id },
        courierId: courier.id,
        parcelCode: created.trackingNumber,
      },
      select: { code: true },
    });
    if (duplicate) {
      throw new HandoffError("duplicate-parcel", duplicate.code);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.order.update({
        where: { id: order.id },
        data: {
          courierId: courier.id,
          parcelCode: created.trackingNumber,
          providerStatus: "NEW_PARCEL",
          deliverySyncStatus: "SYNCED",
          sentToCourierAt: new Date(),
          deliverySyncError: null,
          ...(resolvedCity.matchedCityId &&
          resolvedCity.matchedCityId !== order.cityId
            ? { cityId: resolvedCity.matchedCityId }
            : {}),
          ...(order.deliveryStatus === "NOT_READY"
            ? { deliveryStatus: "AWAITING_PICKUP" }
            : {}),
        },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          actorId: actor.id,
          statusType: "DELIVERY",
          fromStatus: order.deliverySyncStatus,
          toStatus: "SYNCED",
          note:
            options.note ||
            `Envoyée à Ozon Express (${created.trackingNumber})`,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "STATUS_CHANGE",
          entityType: "OrderDeliveryHandoff",
          entityId: order.id,
          before: {
            courierId: order.courierId,
            deliverySyncStatus: order.deliverySyncStatus,
          },
          after: {
            courierId: courier.id,
            deliverySyncStatus: "SYNCED",
            parcelCode: created.trackingNumber,
            provider: "OZON_EXPRESS",
          },
        },
      });
      return next;
    });

    // Default on: every successful Ozon send gets a printable delivery note.
    // Bulk handoff opts out and creates one shared BL for all parcels.
    if (options.createDeliveryNote !== false) {
      try {
        await createDeliveryNoteForOrders(actor, courier.id, [orderId], {
          save: true,
        });
      } catch (noteError) {
        console.error(
          "autoCreateDeliveryNote after Ozon send failed",
          orderId,
          noteError,
        );
      }
    }

    return updated;
  } catch (error) {
    const message =
      error instanceof OzonExpressError
        ? error.message
        : error instanceof HandoffError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Ozon Express sync failed";
    if (error instanceof HandoffError) throw error;
    await prisma.order.update({
      where: { id: order.id },
      data: {
        courierId: courier.id,
        deliverySyncStatus: "FAILED",
        deliverySyncError: message.slice(0, 2000),
      },
    });
    throw new HandoffError("api-failed", message.slice(0, 180));
  }
}

export async function bulkSendOrdersViaOzon(
  actor: Actor,
  orderIds: string[],
  courierId: string,
) {
  const results: Array<{
    orderId: string;
    ok: boolean;
    parcelCode?: string;
    error?: string;
  }> = [];
  for (const orderId of orderIds) {
    try {
      const updated = await sendOrderViaOzon(actor, orderId, courierId, {
        createDeliveryNote: false,
      });
      results.push({
        orderId,
        ok: true,
        parcelCode: updated.parcelCode ?? undefined,
      });
    } catch (error) {
      results.push({
        orderId,
        ok: false,
        error:
          error instanceof HandoffError
            ? error.code
            : error instanceof Error
              ? error.message
              : "failed",
      });
    }
  }
  return results;
}

export async function createDeliveryNoteForOrders(
  actor: Actor,
  courierId: string,
  orderIds: string[],
  options: { save?: boolean } = {},
) {
  if (!(["SUPER_ADMIN", "CONFIRMATION_AGENT"] as Role[]).includes(actor.role)) {
    throw new HandoffError("forbidden");
  }
  const courier = await prisma.courier.findFirst({
    where: { id: courierId, active: true },
  });
  if (!courier || !isOzonCourier(courier)) {
    throw new HandoffError("company-inactive");
  }
  const scope = confirmationAssignmentScope(actor);
  const orders = await prisma.order.findMany({
    where: {
      id: { in: orderIds },
      courierId,
      deliverySyncStatus: "SYNCED",
      parcelCode: { not: null },
      deliveryNoteId: null,
      ...scope,
    },
  });
  if (!orders.length) throw new HandoffError("no-parcels");

  const credentials = credentialsFromCourier(courier);
  const created = await createOzonDeliveryNote(credentials);
  const codes = orders.map((order) => order.parcelCode!).filter(Boolean);
  await addParcelsToOzonDeliveryNote(credentials, created.ref, codes);

  let status: "DRAFT" | "SAVED" = "DRAFT";
  let savedAt: Date | null = null;
  if (options.save !== false) {
    await saveOzonDeliveryNote(credentials, created.ref);
    status = "SAVED";
    savedAt = new Date();
  }

  const note = await prisma.$transaction(async (tx) => {
    const deliveryNote = await tx.deliveryNote.create({
      data: {
        courierId: courier.id,
        externalRef: created.ref,
        status,
        savedAt,
        createdById: actor.id,
        orders: { connect: orders.map((order) => ({ id: order.id })) },
      },
      include: { orders: { select: { id: true, code: true, parcelCode: true } } },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "CREATE",
        entityType: "DeliveryNote",
        entityId: deliveryNote.id,
        after: {
          ref: created.ref,
          orderIds: orders.map((order) => order.id),
          status,
        },
      },
    });
    return deliveryNote;
  });

  return {
    note,
    pdf: ozonDeliveryNotePdfUrls(created.ref),
  };
}

export async function applyOzonProviderStatus(options: {
  trackingNumber: string;
  providerStatus: string;
  note?: string;
  actorId?: string;
}) {
  const order = await prisma.order.findFirst({
    where: {
      parcelCode: options.trackingNumber,
      courier: { provider: "OZON_EXPRESS" },
    },
  });
  if (!order) return { matched: false as const };

  const mapped = mapOzonStatusToDelivery(options.providerStatus);
  await prisma.order.update({
    where: { id: order.id },
    data: {
      providerStatus: options.providerStatus,
      deliverySyncError: null,
    },
  });

  const allowed =
    mapped != null &&
    mapped !== order.deliveryStatus &&
    deliveryTransitions[order.deliveryStatus].includes(mapped) &&
    isDeliveryProgress(order.deliveryStatus, mapped);

  if (allowed && mapped) {
    const systemActor =
      options.actorId ||
      (
        await prisma.user.findFirstOrThrow({
          where: { role: "SUPER_ADMIN", status: "ACTIVE" },
          select: { id: true },
        })
      ).id;
    await changeDeliveryStatus(
      { id: systemActor, role: "SUPER_ADMIN" },
      order.id,
      mapped,
      {
        note:
          options.note ||
          `Ozon Express: ${options.providerStatus} → ${mapped}`,
      },
    );
    return { matched: true as const, orderId: order.id, deliveryStatus: mapped };
  }

  return {
    matched: true as const,
    orderId: order.id,
    deliveryStatus: order.deliveryStatus,
  };
}

export async function syncOzonTrackingForOpenOrders(limit = 80) {
  const orders = await prisma.order.findMany({
    where: {
      deliverySyncStatus: "SYNCED",
      parcelCode: { not: null },
      deliveryStatus: { in: ["AWAITING_PICKUP", "IN_TRANSIT", "NOT_DELIVERED"] },
      courier: {
        provider: "OZON_EXPRESS",
        integrationMode: "API",
        integrationStatus: "CONNECTED",
        active: true,
      },
    },
    include: { courier: true },
    take: limit,
    orderBy: { updatedAt: "asc" },
  });

  const byCourier = new Map<string, typeof orders>();
  for (const order of orders) {
    if (!order.courierId || !order.courier) continue;
    const list = byCourier.get(order.courierId) ?? [];
    list.push(order);
    byCourier.set(order.courierId, list);
  }

  let updated = 0;
  for (const group of byCourier.values()) {
    const courier = group[0]?.courier;
    if (!courier) continue;
    const credentials = credentialsFromCourier(courier);
    const codes = group
      .map((order) => order.parcelCode)
      .filter((code): code is string => Boolean(code));

    try {
      if (codes.length > 1) {
        await getOzonTrackingBulk(credentials, codes);
      }
    } catch {
      // Fall back to per-parcel tracking below.
    }

    for (const order of group) {
      if (!order.parcelCode) continue;
      try {
        const payload = await getOzonTracking(credentials, order.parcelCode);
        const status = extractProviderStatus(payload);
        if (!status) continue;
        const result = await applyOzonProviderStatus({
          trackingNumber: order.parcelCode,
          providerStatus: status,
          note: "Suivi automatique Ozon Express",
        });
        if (result.matched && result.deliveryStatus !== order.deliveryStatus) {
          updated += 1;
        }
      } catch (error) {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            deliverySyncError:
              error instanceof Error
                ? error.message.slice(0, 2000)
                : "Tracking sync failed",
          },
        });
      }
    }
  }
  return { checked: orders.length, updated };
}

export async function testAndConnectOzonCourier(
  courierId: string,
  data: {
    customerId: string;
    apiKey: string;
    apiBaseUrl?: string | null;
    stockMode?: number;
    allowOpen?: number;
  },
) {
  const credentials: OzonCredentials = {
    customerId: data.customerId.trim(),
    apiKey: data.apiKey.trim(),
    apiBaseUrl: data.apiBaseUrl,
  };
  const verified = await verifyOzonCredentials(credentials);
  if (!verified.ok) {
    return { ok: false as const, message: verified.message };
  }
  const webhookToken = randomBytes(24).toString("hex");
  const courier = await prisma.courier.update({
    where: { id: courierId },
    data: {
      provider: "OZON_EXPRESS",
      integrationMode: "API",
      integrationStatus: "CONNECTED",
      externalAccountId: credentials.customerId,
      apiKey: credentials.apiKey,
      apiBaseUrl: credentials.apiBaseUrl || "https://api.ozonexpress.ma",
      stockMode: data.stockMode === 1 ? 1 : 0,
      allowOpen: data.allowOpen === 2 ? 2 : 1,
      webhookToken,
    },
  });
  return { ok: true as const, courier };
}

export type WebhookBody = {
  orderid?: string;
  orderId?: string;
  orderStatus?: string;
  situation?: string;
  note?: string;
};

export async function handleOzonWebhook(
  token: string,
  body: WebhookBody,
) {
  const courier = await prisma.courier.findFirst({
    where: {
      webhookToken: token,
      provider: "OZON_EXPRESS",
      integrationStatus: "CONNECTED",
      active: true,
    },
  });
  if (!courier) return { ok: false as const, reason: "unauthorized" as const };

  const trackingNumber = (body.orderid || body.orderId || "").trim();
  const providerStatus = (body.orderStatus || "").trim();
  if (!trackingNumber || !providerStatus) {
    return { ok: false as const, reason: "invalid-payload" as const };
  }

  const result = await applyOzonProviderStatus({
    trackingNumber,
    providerStatus,
    note: body.note || `Webhook Ozon (${body.situation || providerStatus})`,
  });
  return { ok: true as const, result };
}

export async function listSyncedOrdersWithoutNote(
  actor: Actor,
  courierId: string,
) {
  const scope = confirmationAssignmentScope(actor) as Prisma.OrderWhereInput;
  return prisma.order.findMany({
    where: {
      ...scope,
      courierId,
      deliverySyncStatus: "SYNCED",
      parcelCode: { not: null },
      deliveryNoteId: null,
      deliveryStatus: { in: ["AWAITING_PICKUP", "IN_TRANSIT"] satisfies DeliveryStatus[] },
    },
    include: { city: true, lines: true },
    orderBy: { sentToCourierAt: "asc" },
    take: 200,
  });
}
