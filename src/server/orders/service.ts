import { createHash } from "node:crypto";

import {
  Prisma,
  type CallOutcome,
  type ConfirmationStatus,
  type DeliverySyncStatus,
  type DeliveryStatus,
  type FinanceStatus,
  type Role,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { nextCounter } from "@/server/db/counter";
import type { checkoutSchema, createOrderSchema } from "@/lib/validation/order";
import type { z } from "zod";
import {
  assertTransition,
  confirmationTransitions,
  deliveryTransitions,
  financeTransitions,
} from "./state-machine";
import {
  assertConfirmationAssignmentAccess,
  nextConfirmationAgentId,
  readConfirmationRewardDh,
} from "./confirmation-assignment";
import { HandoffError } from "./handoff-errors";
import { calculateShipDate } from "./shipping-date";

type CreateOrderInput = z.infer<typeof createOrderSchema>;
type Actor = { id: string; role: Role };
type ImportIdentity = { importSource?: string; externalReference?: string };

function normalizeCityLookup(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function citySlugFromName(value: string) {
  const latin = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (latin) return latin;
  return `import-${createHash("sha256").update(value).digest("hex").slice(0, 12)}`;
}

async function resolveCity(
  tx: Prisma.TransactionClient,
  value: string,
  options: { createIfMissing?: boolean } = {},
) {
  const input = value.trim();
  const slug = citySlugFromName(input);
  const scope = options.createIfMissing ? {} : { active: true };
  const exact = await tx.city.findFirst({
    where: {
      ...scope,
      OR: [
        { slug },
        { nameFr: { equals: input } },
        { nameAr: { equals: input } },
      ],
    },
  });
  if (exact) {
    if (options.createIfMissing && !exact.active) {
      return tx.city.update({
        where: { id: exact.id },
        data: { active: true },
      });
    }
    return exact;
  }
  const target = normalizeCityLookup(input);
  const cities = await tx.city.findMany({
    where: options.createIfMissing ? undefined : { active: true },
  });
  const fuzzy = cities.find((city) =>
    [city.slug, city.nameFr, city.nameAr].some(
      (name) => normalizeCityLookup(name) === target,
    ),
  );
  if (fuzzy) {
    if (options.createIfMissing && !fuzzy.active) {
      return tx.city.update({
        where: { id: fuzzy.id },
        data: { active: true },
      });
    }
    return fuzzy;
  }
  if (!options.createIfMissing) throw new Error(`UnknownCity:${input}`);

  let candidate = slug;
  let suffix = 0;
  while (await tx.city.findUnique({ where: { slug: candidate } })) {
    suffix += 1;
    candidate = `${slug}-${suffix}`;
  }
  return tx.city.create({
    data: {
      nameFr: input,
      nameAr: input,
      slug: candidate,
      deliveryFee: null,
      active: true,
      sortOrder: 10_000,
    },
  });
}

export async function affiliateIdFor(actorId: string, role: Role) {
  if (role === "AFFILIATE") {
    return (
      await prisma.affiliateProfile.findUniqueOrThrow({
        where: { userId: actorId },
        select: { id: true },
      })
    ).id;
  }
  if (role === "AFFILIATE_STAFF") {
    const staff = await prisma.affiliateStaff.findUniqueOrThrow({
      where: { userId: actorId },
      select: { affiliateProfileId: true, active: true },
    });
    if (!staff.active) throw new Error("Inactive staff member");
    return staff.affiliateProfileId;
  }
  throw new Error("Only affiliates can create orders");
}

async function nextOrderCode(tx: Prisma.TransactionClient) {
  const year = new Date().getFullYear();
  const sequence = await nextCounter(tx, `order:${year}`);
  return `TJ-${year}-${String(sequence).padStart(7, "0")}`;
}

export async function createCartOrder(
  actor: Actor,
  input: z.infer<typeof checkoutSchema>,
) {
  const affiliateId = await affiliateIdFor(actor.id, actor.role);
  const requestedQuantities = new Map(
    input.orderItems.map((item) => [item.itemId, item.quantity]),
  );
  const requestedItemIds = [...requestedQuantities.keys()];
  return prisma.$transaction(
    async (tx) => {
      const cart = await tx.cart.findUnique({
        where: {
          affiliateProfileId_createdById: {
            affiliateProfileId: affiliateId,
            createdById: actor.id,
          },
        },
        include: {
          items: {
            where: { id: { in: requestedItemIds } },
            include: { product: true, variant: true },
          },
        },
      });
      if (!cart?.items.length || cart.items.length !== requestedItemIds.length)
        throw new Error("Empty cart");
      const city = await resolveCity(tx, input.city);
      for (const item of cart.items) {
        const requestedQuantity = requestedQuantities.get(item.id);
        if (
          !requestedQuantity ||
          requestedQuantity > item.quantity ||
          !item.product.published ||
          !item.variant.active ||
          item.variant.stock < requestedQuantity
        )
          throw new Error(`Unavailable:${item.variant.sku}`);
        if (
          item.customSalePrice &&
          (!item.product.allowCustomSalePrice ||
            (item.product.minSalePrice &&
              item.customSalePrice.lt(item.product.minSalePrice)))
        )
          throw new Error(`InvalidPrice:${item.variant.sku}`);
        const duplicate = await tx.order.findFirst({
          where: {
            affiliateId,
            phone: input.phone,
            createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
            lines: { some: { productId: item.productId } },
          },
          select: { code: true },
        });
        if (duplicate) throw new Error(`Duplicate:${duplicate.code}`);
      }
      const confirmationAgentId = await nextConfirmationAgentId(tx);
      const order = await tx.order.create({
        data: {
          code: await nextOrderCode(tx),
          affiliateId,
          createdById: actor.id,
          customerName: input.customerName,
          phone: input.phone,
          cityId: city.id,
          // Internal logistics snapshot. The product sale price already includes delivery.
          deliveryFee: city.deliveryFee ?? 0,
          address: input.address || null,
          notes: input.notes || null,
          confirmationAgentId,
          lines: {
            create: cart.items.map((item) => {
              const quantity = requestedQuantities.get(item.id)!;
              const salePrice = item.customSalePrice ?? item.product.salePrice;
              const extra = salePrice.minus(item.product.salePrice);
              return {
                productId: item.productId,
                variantId: item.variantId,
                productNameFr: item.product.nameFr,
                productNameAr: item.product.nameAr,
                sku: item.variant.sku,
                quantity,
                productPrice: item.product.productPrice,
                serviceFee: item.product.serviceFee,
                salePrice,
                commission: item.product.commission.plus(extra),
              };
            }),
          },
          history: {
            create: {
              actorId: actor.id,
              statusType: "CONFIRMATION",
              toStatus: "NEW",
              note: "Cart checkout",
            },
          },
        },
      });
      for (const item of cart.items) {
        const quantity = requestedQuantities.get(item.id)!;
        if (quantity === item.quantity) {
          await tx.cartItem.delete({ where: { id: item.id } });
        } else {
          await tx.cartItem.update({
            where: { id: item.id },
            data: { quantity: { decrement: quantity } },
          });
        }
      }
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "CREATE",
          entityType: "Order",
          entityId: order.id,
          after: {
            code: order.code,
            status: "NEW",
            source: "cart",
            itemCount: cart.items.length,
          },
        },
      });
      return order;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function createAffiliateOrder(
  actor: Actor,
  input: CreateOrderInput,
  identity: ImportIdentity = {},
) {
  const affiliateId = await affiliateIdFor(actor.id, actor.role);
  return prisma.$transaction(
    async (tx) => {
      const variant = await tx.productVariant.findUniqueOrThrow({
        where: { id: input.variantId },
        include: { product: true },
      });
      if (
        !variant.active ||
        !variant.product.published ||
        variant.stock < input.quantity
      )
        throw new Error("Product is unavailable");
      const duplicate = await tx.order.findFirst({
        where: {
          affiliateId,
          phone: input.phone,
          createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
          lines: { some: { productId: variant.productId } },
        },
        select: { code: true },
      });
      if (duplicate) throw new Error(`Duplicate:${duplicate.code}`);
      const city = await resolveCity(tx, input.city, {
        createIfMissing: Boolean(identity.importSource),
      });
      const confirmationAgentId = await nextConfirmationAgentId(tx);
      const order = await tx.order.create({
        data: {
          code: await nextOrderCode(tx),
          affiliateId,
          createdById: actor.id,
          customerName: input.customerName,
          phone: input.phone,
          cityId: city.id,
          // Internal logistics snapshot. The product sale price already includes delivery.
          deliveryFee: city.deliveryFee ?? 0,
          address: input.address || null,
          notes: input.notes || null,
          importSource: identity.importSource,
          externalReference: identity.externalReference,
          confirmationAgentId,
          lines: {
            create: {
              productId: variant.productId,
              variantId: variant.id,
              productNameFr: variant.product.nameFr,
              productNameAr: variant.product.nameAr,
              sku: variant.sku,
              quantity: input.quantity,
              productPrice: variant.product.productPrice,
              serviceFee: variant.product.serviceFee,
              salePrice: variant.product.salePrice,
              commission: variant.product.commission,
            },
          },
          history: {
            create: {
              actorId: actor.id,
              statusType: "CONFIRMATION",
              toStatus: "NEW",
              note: "Order created",
            },
          },
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "CREATE",
          entityType: "Order",
          entityId: order.id,
          after: { code: order.code, status: "NEW" },
        },
      });
      return order;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function appendImportedOrderLine(
  actor: Actor,
  orderId: string,
  input: CreateOrderInput,
  identity: Required<ImportIdentity>,
) {
  const affiliateId = await affiliateIdFor(actor.id, actor.role);
  return prisma.$transaction(
    async (tx) => {
      const [order, variant] = await Promise.all([
        tx.order.findFirstOrThrow({
          where: {
            id: orderId,
            affiliateId,
            confirmationStatus: "NEW",
            importSource: identity.importSource,
            externalReference: identity.externalReference,
          },
          select: { id: true, customerName: true, phone: true },
        }),
        tx.productVariant.findUniqueOrThrow({
          where: { id: input.variantId },
          include: { product: true },
        }),
      ]);
      if (
        order.customerName !== input.customerName ||
        order.phone !== input.phone
      )
        throw new Error("Import rows for one order must use the same customer");
      if (
        !variant.active ||
        !variant.product.published ||
        variant.stock < input.quantity
      )
        throw new Error("Product is unavailable");
      const line = await tx.orderLine.create({
        data: {
          orderId: order.id,
          productId: variant.productId,
          variantId: variant.id,
          productNameFr: variant.product.nameFr,
          productNameAr: variant.product.nameAr,
          sku: variant.sku,
          quantity: input.quantity,
          productPrice: variant.product.productPrice,
          serviceFee: variant.product.serviceFee,
          salePrice: variant.product.salePrice,
          commission: variant.product.commission,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "UPDATE",
          entityType: "Order",
          entityId: order.id,
          after: {
            addedLineId: line.id,
            sku: line.sku,
            quantity: line.quantity,
            source: "import",
          },
        },
      });
      return line;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function changeConfirmationStatus(
  actor: Actor,
  orderId: string,
  to: ConfirmationStatus,
  options: { note?: string; callbackAt?: Date } = {},
) {
  if (!(["SUPER_ADMIN", "CONFIRMATION_AGENT"] as Role[]).includes(actor.role))
    throw new Error("Forbidden");
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { lines: true, affiliate: { select: { userId: true } } },
    });
    assertConfirmationAssignmentAccess(actor, order);
    assertTransition(confirmationTransitions, order.confirmationStatus, to);
    if (to === "CONFIRMED") {
      for (const line of order.lines) {
        const before = await tx.productVariant.findUniqueOrThrow({
          where: { id: line.variantId },
          select: { stock: true },
        });
        const updated = await tx.productVariant.updateMany({
          where: { id: line.variantId, stock: { gte: line.quantity } },
          data: { stock: { decrement: line.quantity } },
        });
        if (!updated.count)
          throw new Error(`Insufficient stock for ${line.sku}`);
        await tx.stockMovement.create({
          data: {
            variantId: line.variantId,
            orderId: order.id,
            actorId: actor.id,
            type: "ORDER_CONFIRM",
            quantityDelta: -line.quantity,
            stockBefore: before.stock,
            stockAfter: before.stock - line.quantity,
            reason: `Confirmation ${order.code}`,
          },
        });
      }
    }
    const data: Prisma.OrderUpdateInput = {
      confirmationStatus: to,
    };
    // Claim only unassigned queue items; keep the assigned confirmator for earnings.
    if (!order.confirmationAgentId && actor.role === "CONFIRMATION_AGENT") {
      data.confirmationAgent = { connect: { id: actor.id } };
    }
    if (to === "CONFIRMED") {
      const settings = await tx.setting.findMany({
        where: { key: { in: ["weekdayCutoff", "saturdayCutoff"] } },
      });
      const read = (key: string, fallback: string) =>
        String(settings.find((item) => item.key === key)?.value ?? fallback);
      Object.assign(data, {
        deliveryStatus: "AWAITING_PICKUP",
        deliverySyncStatus: "NOT_SENT",
        sentToCourierAt: null,
        deliverySyncError: null,
        financeStatus: "NOT_READY",
        confirmedAt: new Date(),
        shipOn: calculateShipDate(new Date(), {
          weekdayCutoff: read("weekdayCutoff", "18:00"),
          saturdayCutoff: read("saturdayCutoff", "15:30"),
        }),
      });
    }
    const updated = await tx.order.update({ where: { id: orderId }, data });
    await tx.callAttempt.create({
      data: {
        orderId,
        agentId: actor.id,
        outcome: to as CallOutcome,
        note: options.note,
        callbackAt: options.callbackAt,
      },
    });
    await tx.orderStatusHistory.create({
      data: {
        orderId,
        actorId: actor.id,
        statusType: "CONFIRMATION",
        fromStatus: order.confirmationStatus,
        toStatus: to,
        note: options.note,
      },
    });
    if (to === "CONFIRMED")
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          actorId: actor.id,
          statusType: "DELIVERY",
          fromStatus: "NOT_READY",
          toStatus: "AWAITING_PICKUP",
        },
      });
    if (["CONFIRMED", "CANCELLED", "UNREACHABLE"].includes(to))
      await tx.notification.create({
        data: {
          userId: order.affiliate.userId,
          type: "ORDER_STATUS",
          titleKey: `order.${to.toLowerCase()}.title`,
          bodyKey: `order.${to.toLowerCase()}.body`,
          data: { orderCode: order.code, orderId: order.id },
        },
      });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "STATUS_CHANGE",
        entityType: "Order",
        entityId: orderId,
        before: { confirmationStatus: order.confirmationStatus },
        after: { confirmationStatus: to },
      },
    });
    return updated;
  });
}

export async function assignConfirmationAgent(
  actor: Actor,
  orderId: string,
  agentId: string | null,
) {
  if (actor.role !== "SUPER_ADMIN") throw new Error("Forbidden");
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { id: true, code: true, confirmationAgentId: true },
    });
    if (agentId) {
      const agent = await tx.user.findFirst({
        where: {
          id: agentId,
          role: "CONFIRMATION_AGENT",
          status: "ACTIVE",
        },
        select: { id: true },
      });
      if (!agent) throw new Error("Invalid confirmation agent");
    }
    const updated = await tx.order.update({
      where: { id: orderId },
      data: { confirmationAgentId: agentId },
    });
    if (agentId && agentId !== order.confirmationAgentId) {
      await tx.notification.create({
        data: {
          userId: agentId,
          type: "ORDER_ASSIGNED",
          titleKey: "order.assigned.title",
          bodyKey: "order.assigned.body",
          data: { orderCode: order.code, orderId: order.id },
        },
      });
    }
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "UPDATE",
        entityType: "Order",
        entityId: orderId,
        before: { confirmationAgentId: order.confirmationAgentId },
        after: { confirmationAgentId: agentId },
      },
    });
    return updated;
  });
}

/** Distribute orders that still have no confirmator (legacy / empty pool). */
export async function distributeUnassignedConfirmationOrders(actor: Actor) {
  if (actor.role !== "SUPER_ADMIN") throw new Error("Forbidden");
  return prisma.$transaction(async (tx) => {
    const unassigned = await tx.order.findMany({
      where: {
        confirmationAgentId: null,
        confirmationStatus: {
          notIn: ["CONFIRMED", "CANCELLED", "UNREACHABLE"],
        },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    let assigned = 0;
    for (const order of unassigned) {
      const agentId = await nextConfirmationAgentId(tx);
      if (!agentId) break;
      const full = await tx.order.update({
        where: { id: order.id },
        data: { confirmationAgentId: agentId },
        select: { id: true, code: true },
      });
      await tx.notification.create({
        data: {
          userId: agentId,
          type: "ORDER_ASSIGNED",
          titleKey: "order.assigned.title",
          bodyKey: "order.assigned.body",
          data: { orderCode: full.code, orderId: full.id },
        },
      });
      assigned += 1;
    }
    if (assigned)
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "UPDATE",
          entityType: "Order",
          entityId: "confirmation-queue",
          after: { distributed: assigned },
        },
      });
    return { assigned, remaining: unassigned.length - assigned };
  });
}

export async function markOrderSentToDeliveryCompany(
  actor: Actor,
  orderId: string,
  options: { courierId: string; parcelCode?: string; note?: string },
) {
  if (!("SUPER_ADMIN" === actor.role || "CONFIRMATION_AGENT" === actor.role))
    throw new HandoffError("forbidden");
  if (!options.courierId?.trim()) throw new HandoffError("company-required");
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    assertConfirmationAssignmentAccess(actor, order);
    const company = await tx.courier.findFirst({
      where: { id: options.courierId, active: true },
    });
    if (!company) throw new HandoffError("company-inactive");
    if (order.confirmationStatus !== "CONFIRMED")
      throw new HandoffError("not-confirmed");
    if (["DELIVERED", "RETURNED", "REFUSED"].includes(order.deliveryStatus))
      throw new HandoffError("order-closed");
    if (!["NOT_SENT", "FAILED"].includes(order.deliverySyncStatus))
      throw new HandoffError("already-sent");
    if (options.parcelCode) {
      const duplicateParcel = await tx.order.findFirst({
        where: {
          id: { not: order.id },
          courierId: company.id,
          parcelCode: { equals: options.parcelCode },
        },
        select: { code: true },
      });
      if (duplicateParcel)
        throw new HandoffError("duplicate-parcel", duplicateParcel.code);
    }

    // Until a provider adapter is connected, every handoff is explicitly
    // recorded by the confirmation team. A future adapter can set SYNCED.
    const syncStatus: DeliverySyncStatus = "SENT_MANUALLY";
    const updated = await tx.order.update({
      where: { id: order.id },
      data: {
        courierId: company.id,
        parcelCode: options.parcelCode || null,
        deliverySyncStatus: syncStatus,
        sentToCourierAt: new Date(),
        deliverySyncError: null,
        // Recover inconsistent demo/legacy rows that never left NOT_READY.
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
        toStatus: syncStatus,
        note:
          options.note ||
          `Assigned to delivery company ${company.name} (${company.integrationMode.toLowerCase()})`,
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
          courierId: company.id,
          deliverySyncStatus: syncStatus,
          parcelCode: options.parcelCode || null,
        },
      },
    });
    return updated;
  });
}

export async function changeDeliveryStatus(
  actor: Actor,
  orderId: string,
  to: DeliveryStatus,
  options: { courierId?: string; parcelCode?: string; note?: string },
) {
  if (!(["SUPER_ADMIN", "CONFIRMATION_AGENT"] as Role[]).includes(actor.role))
    throw new Error("Forbidden");
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        lines: true,
        invoiceLines: { include: { invoice: true } },
        affiliate: true,
      },
    });
    assertConfirmationAssignmentAccess(actor, order);
    assertTransition(deliveryTransitions, order.deliveryStatus, to);
    if (to !== "AWAITING_PICKUP" && order.deliverySyncStatus === "NOT_SENT")
      throw new Error("Order must be sent to a delivery company first");
    const data: Prisma.OrderUpdateInput = { deliveryStatus: to };
    if (options.courierId)
      data.courier = { connect: { id: options.courierId } };
    if (options.parcelCode) data.parcelCode = options.parcelCode;
    if (to === "IN_TRANSIT") data.shippedAt = new Date();
    if (to === "DELIVERED") {
      const reward =
        order.confirmationStatus === "CONFIRMED" && order.confirmationAgentId
          ? await readConfirmationRewardDh(tx)
          : null;
      Object.assign(data, {
        deliveredAt: new Date(),
        financeStatus: "PAID",
        paidAt: new Date(),
        confirmationReward: reward,
      });
    }
    if (to === "RETURNED" || to === "REFUSED") {
      data.confirmationReward = null;
      for (const line of order.lines) {
        const before = await tx.productVariant.findUniqueOrThrow({
          where: { id: line.variantId },
          select: { stock: true },
        });
        await tx.productVariant.update({
          where: { id: line.variantId },
          data: { stock: { increment: line.quantity } },
        });
        await tx.stockMovement.create({
          data: {
            variantId: line.variantId,
            orderId: order.id,
            actorId: actor.id,
            type: "ORDER_RETURN",
            quantityDelta: line.quantity,
            stockBefore: before.stock,
            stockAfter: before.stock + line.quantity,
            reason: options.note || `${to} ${order.code}`,
          },
        });
      }
    }
    if (to === "RETURNED" && order.financeStatus !== "NOT_READY") {
      const invoice = order.invoiceLines[0]?.invoice;
      if (invoice)
        await tx.invoice.update({
          where: { id: invoice.id },
          data: { status: "VOID" },
        });
      if (order.financeStatus === "PAID") {
        const credit = await tx.walletTransaction.findFirst({
          where: { orderId, type: "COMMISSION_CREDIT", status: "COMPLETED" },
        });
        if (credit)
          await tx.walletTransaction.create({
            data: {
              reference: `REV-${order.code}`,
              affiliateId: order.affiliateId,
              orderId,
              invoiceId: invoice?.id,
              type: "ADJUSTMENT",
              status: "COMPLETED",
              amount: credit.amount.negated(),
              note: "Commission reversal after return",
            },
          });
      }
      Object.assign(data, { financeStatus: "NOT_READY", paidAt: null });
      await tx.orderLine.updateMany({
        where: { orderId },
        data: { commissionPayable: false },
      });
    }
    const updated = await tx.order.update({ where: { id: orderId }, data });
    await tx.orderStatusHistory.create({
      data: {
        orderId,
        actorId: actor.id,
        statusType: "DELIVERY",
        fromStatus: order.deliveryStatus,
        toStatus: to,
        note: options.note,
      },
    });
    if (["IN_TRANSIT", "DELIVERED", "REFUSED", "RETURNED"].includes(to))
      await tx.notification.create({
        data: {
          userId: order.affiliate.userId,
          type: "ORDER_STATUS",
          titleKey: `order.${to.toLowerCase()}.title`,
          bodyKey: `order.${to.toLowerCase()}.body`,
          data: { orderCode: order.code, orderId: order.id },
        },
      });
    if (to === "DELIVERED") {
      const deliveredOrder = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: {
          lines: true,
          invoiceLines: { include: { invoice: true } },
          affiliate: true,
        },
      });
      await creditOrderCommissionInTx(
        tx,
        deliveredOrder,
        "Commission credited on delivery",
      );
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          actorId: actor.id,
          statusType: "FINANCE",
          fromStatus: "NOT_READY",
          toStatus: "PAID",
          note: "Auto-settled on delivery",
        },
      });
    }
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "STATUS_CHANGE",
        entityType: "Order",
        entityId: orderId,
        before: { deliveryStatus: order.deliveryStatus },
        after: { deliveryStatus: to },
      },
    });
    return updated;
  });
}

async function nextInvoiceSequence(
  tx: Prisma.TransactionClient,
  year: number,
) {
  const key = `invoice:${year}`;
  const maxExisting = await tx.invoice.aggregate({
    where: { sequenceYear: year },
    _max: { sequenceNumber: true },
  });
  const floor = maxExisting._max.sequenceNumber ?? 0;
  const existing = await tx.counter.findUnique({ where: { key } });
  if (!existing || existing.value < floor) {
    await tx.counter.upsert({
      where: { key },
      create: { key, value: floor },
      update: { value: floor },
    });
  }
  return nextCounter(tx, key);
}

async function createInvoice(
  tx: Prisma.TransactionClient,
  orderId: string,
) {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { lines: true, affiliate: { include: { user: true } } },
  });
  const year = new Date().getFullYear();
  const sequenceNumber = await nextInvoiceSequence(tx, year);
  const total = order.lines.reduce(
    (sum, line) => sum.plus(line.commission.mul(line.quantity)),
    new Prisma.Decimal(0),
  );
  return tx.invoice.create({
    data: {
      number: `INV-${year}-${String(sequenceNumber).padStart(5, "0")}`,
      sequenceYear: year,
      sequenceNumber,
      affiliateId: order.affiliateId,
      status: "ISSUED",
      locale: order.affiliate.user.preferredLocale,
      totalCommission: total,
      issuedAt: new Date(),
      lines: {
        create: order.lines.map((line) => ({
          orderId,
          orderLineId: line.id,
          commission: line.commission.mul(line.quantity),
        })),
      },
    },
  });
}

async function creditOrderCommissionInTx(
  tx: Prisma.TransactionClient,
  order: {
    id: string;
    code: string;
    affiliateId: string;
    affiliate: { userId: string };
    lines: { commission: Prisma.Decimal; quantity: number }[];
    invoiceLines: { invoice: { id: string; status: string } }[];
  },
  note?: string,
) {
  let invoice = order.invoiceLines[0]?.invoice ?? null;
  if (!invoice) invoice = await createInvoice(tx, order.id);
  const existingCredit = await tx.walletTransaction.findFirst({
    where: { orderId: order.id, type: "COMMISSION_CREDIT", status: "COMPLETED" },
  });
  if (existingCredit) return invoice;

  const amount = order.lines.reduce(
    (sum, line) => sum.plus(line.commission.mul(line.quantity)),
    new Prisma.Decimal(0),
  );
  await tx.invoice.update({
    where: { id: invoice.id },
    data: { status: "PAID", paidAt: new Date() },
  });
  await tx.orderLine.updateMany({
    where: { orderId: order.id },
    data: { commissionPayable: true },
  });
  await tx.walletTransaction.create({
    data: {
      reference: `COM-${order.code}`,
      affiliateId: order.affiliateId,
      orderId: order.id,
      invoiceId: invoice.id,
      type: "COMMISSION_CREDIT",
      amount,
      status: "COMPLETED",
      note: note ?? "Commission credited on delivery",
    },
  });
  await tx.notification.create({
    data: {
      userId: order.affiliate.userId,
      type: "COMMISSION_CREDIT",
      titleKey: "commission.paid.title",
      bodyKey: "commission.paid.body",
      data: {
        orderCode: order.code,
        orderId: order.id,
        amount: amount.toString(),
      },
    },
  });
  return invoice;
}

/**
 * Invoice + credit wallet for a delivered order that was never settled
 * (legacy Facturer queue or pre-auto-credit deliveries).
 */
export async function settleDeliveredOrderCommission(
  actorId: string,
  orderId: string,
  note = "Commission credited on delivery",
) {
  return prisma.$transaction(
    async (tx) => {
      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: {
          lines: true,
          invoiceLines: { include: { invoice: true } },
          affiliate: true,
        },
      });
      if (order.deliveryStatus !== "DELIVERED") return null;
      if (order.financeStatus === "PAID") {
        await creditOrderCommissionInTx(tx, order, note);
        return order;
      }
      if (
        order.financeStatus !== "UNINVOICED" &&
        order.financeStatus !== "INVOICED"
      )
        return null;

      if (order.financeStatus === "UNINVOICED") {
        await createInvoice(tx, orderId);
      }
      const refreshed = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: {
          lines: true,
          invoiceLines: { include: { invoice: true } },
          affiliate: true,
        },
      });
      await creditOrderCommissionInTx(tx, refreshed, note);
      const updated = await tx.order.update({
        where: { id: orderId },
        data: { financeStatus: "PAID", paidAt: new Date() },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          actorId,
          statusType: "FINANCE",
          fromStatus: order.financeStatus,
          toStatus: "PAID",
          note,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "MONEY_CREDIT",
          entityType: "Order",
          entityId: orderId,
          before: { financeStatus: order.financeStatus },
          after: { financeStatus: "PAID" },
        },
      });
      return updated;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

/** Backfill all delivered orders still missing commission credit. */
export async function settlePendingDeliveredCommissions(actor: Actor) {
  const pending = await prisma.order.findMany({
    where: {
      deliveryStatus: "DELIVERED",
      financeStatus: { in: ["UNINVOICED", "INVOICED"] },
    },
    select: { id: true },
    take: 200,
  });
  for (const item of pending) {
    await settleDeliveredOrderCommission(
      actor.id,
      item.id,
      "Auto-settled (affiliate payouts only)",
    ).catch(() => undefined);
  }
}

/** Backfill one affiliate's delivered orders (partner dashboard / wallet). */
export async function settleAffiliateDeliveredCommissions(
  actorId: string,
  affiliateId: string,
) {
  const pending = await prisma.order.findMany({
    where: {
      affiliateId,
      deliveryStatus: "DELIVERED",
      financeStatus: { in: ["UNINVOICED", "INVOICED"] },
    },
    select: { id: true },
    take: 200,
  });
  for (const item of pending) {
    await settleDeliveredOrderCommission(
      actorId,
      item.id,
      "Auto-settled on delivery",
    ).catch(() => undefined);
  }
}

export async function changeFinanceStatus(
  actor: Actor,
  orderId: string,
  to: FinanceStatus,
  note?: string,
) {
  if (!(["SUPER_ADMIN", "FINANCE"] as Role[]).includes(actor.role))
    throw new Error("Forbidden");
  return prisma.$transaction(
    async (tx) => {
      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: {
          lines: true,
          invoiceLines: { include: { invoice: true } },
          affiliate: true,
        },
      });
      if (order.deliveryStatus !== "DELIVERED")
        throw new Error("Order must be delivered before finance processing");

      // Allow jumping UNINVOICED → PAID (invoice + credit in one step).
      if (to === "PAID" && order.financeStatus === "UNINVOICED") {
        await createInvoice(tx, orderId);
        const refreshed = await tx.order.findUniqueOrThrow({
          where: { id: orderId },
          include: {
            lines: true,
            invoiceLines: { include: { invoice: true } },
            affiliate: true,
          },
        });
        await creditOrderCommissionInTx(tx, refreshed, note);
        const updated = await tx.order.update({
          where: { id: orderId },
          data: { financeStatus: "PAID", paidAt: new Date() },
        });
        await tx.orderStatusHistory.create({
          data: {
            orderId,
            actorId: actor.id,
            statusType: "FINANCE",
            fromStatus: order.financeStatus,
            toStatus: "PAID",
            note,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: "MONEY_CREDIT",
            entityType: "Order",
            entityId: orderId,
            before: { financeStatus: order.financeStatus },
            after: { financeStatus: "PAID" },
          },
        });
        return updated;
      }

      assertTransition(financeTransitions, order.financeStatus, to);
      let invoice = order.invoiceLines[0]?.invoice;
      if (to === "INVOICED") invoice = await createInvoice(tx, orderId);
      if (to === "PAID") {
        await creditOrderCommissionInTx(tx, order, note);
      }
      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          financeStatus: to,
          paidAt: to === "PAID" ? new Date() : undefined,
        },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          actorId: actor.id,
          statusType: "FINANCE",
          fromStatus: order.financeStatus,
          toStatus: to,
          note,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: to === "PAID" ? "MONEY_CREDIT" : "STATUS_CHANGE",
          entityType: "Order",
          entityId: orderId,
          before: { financeStatus: order.financeStatus },
          after: { financeStatus: to },
        },
      });
      return updated;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
