"use server";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { hash, verify } from "argon2";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import ExcelJS from "exceljs";

import { buildProductCode, buildVariantSku } from "@/lib/catalog-identifiers";
import { prisma } from "@/lib/prisma";
import { payoutRequestSchema } from "@/lib/validation/order";
import {
  createProductFields,
  createProductSchema,
  normalizeProductSlug,
  parseProductSizes,
  validateProductFinancials,
  type CreateProductField,
  type CreateProductState,
} from "@/lib/validation/product";
import { requirePermission, requireRole } from "@/server/auth/session";
import { affiliateIdFor } from "@/server/orders/service";
import { nextCounter } from "@/server/db/counter";
import {
  requestConfirmatorPayout,
  transitionConfirmatorPayout,
} from "@/server/payouts/confirmator";
import {
  PayoutError,
  requestPayout,
  transitionPayout,
} from "@/server/payouts/service";
import { deleteObject, uploadObject } from "@/server/media/storage";
import { inspectImageFile } from "@/server/media/image-validation";
import {
  notifyActiveAffiliates,
  notifyRoles,
  notifyUser,
  notifyUsers,
} from "@/server/notifications/service";

async function uploadPayoutProof(file: File, folder: string) {
  const image = await inspectImageFile(file);
  if (!image) return null;
  const objectKey = `${folder}/${randomUUID()}.${image.extension}`;
  const url = await uploadObject(objectKey, file);
  return { objectKey, url };
}

function localeFrom(formData: FormData) {
  return formData.get("locale") === "ar" ? "ar" : "fr";
}
const ribSchema = z
  .string()
  .transform((value) => value.replace(/\s/g, ""))
  .pipe(z.string().regex(/^\d{24}$/));
const moroccanPhoneSchema = z
  .string()
  .trim()
  .regex(/^(?:0[67]|\+212[67])\d{8}$/);

export async function affiliateStatusAction(formData: FormData) {
  const locale = localeFrom(formData);
  const actor = await requireRole(locale, ["SUPER_ADMIN"]);
  const parsed = z
    .object({
      userId: z.string().cuid(),
      status: z.enum(["ACTIVE", "SUSPENDED"]),
      reason: z.string().trim().max(500).optional(),
    })
    .superRefine((value, context) => {
      if (value.status === "SUSPENDED" && !value.reason)
        context.addIssue({
          code: "custom",
          path: ["reason"],
          message: "Suspension reason required",
        });
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/${locale}/admin/affiliates?status=invalid`);
  if (parsed.data.userId === actor.id)
    redirect(`/${locale}/admin/affiliates?status=invalid`);
  const target = await prisma.user.findFirst({
    where: { id: parsed.data.userId, role: "AFFILIATE" },
    include: {
      affiliateProfile: { include: { staff: { select: { userId: true } } } },
    },
  });
  if (!target?.affiliateProfile)
    redirect(`/${locale}/admin/affiliates?status=invalid`);
  const targetProfile = target.affiliateProfile;
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: parsed.data.userId },
      data: { status: parsed.data.status },
    });
    if (parsed.data.status === "SUSPENDED") {
      const affectedUserIds = [
        parsed.data.userId,
        ...targetProfile.staff.map((staff) => staff.userId),
      ];
      await tx.session.deleteMany({
        where: { userId: { in: affectedUserIds } },
      });
    }
    if (parsed.data.status === "ACTIVE" && !targetProfile.approvedAt)
      await tx.affiliateProfile.update({
        where: { userId: parsed.data.userId },
        data: { approvedAt: new Date(), approvedById: actor.id },
      });
    await notifyUser(tx, {
      userId: parsed.data.userId,
      type: "ACCOUNT_STATUS",
      titleKey:
        parsed.data.status === "ACTIVE"
          ? "account.activated.title"
          : "account.suspended.title",
      bodyKey:
        parsed.data.status === "ACTIVE"
          ? "account.activated.body"
          : "account.suspended.body",
      data: { reason: parsed.data.reason || null },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "UPDATE",
        entityType: "User",
        entityId: parsed.data.userId,
        before: { status: target.status },
        after: {
          status: parsed.data.status,
          reason: parsed.data.reason || null,
        },
      },
    });
  });
  revalidatePath(`/${locale}/admin/affiliates`);
  redirect(`/${locale}/admin/affiliates?status=updated`);
}

export async function createCourierAction(formData: FormData) {
  const locale = localeFrom(formData);
  const actor = await requireRole(locale, ["SUPER_ADMIN"]);
  const parsed = z
    .object({
      name: z.string().trim().min(2).max(100),
      integrationMode: z.enum(["MANUAL", "API"]),
      externalAccountId: z.string().trim().max(100).optional(),
      apiBaseUrl: z.preprocess(
        (value) => (value === "" ? undefined : value),
        z.string().url().max(500).optional(),
      ),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/${locale}/admin/couriers?status=invalid`);
  const courier = await prisma.courier.create({
    data: {
      name: parsed.data.name,
      integrationMode: parsed.data.integrationMode,
      integrationStatus: "NOT_CONFIGURED",
      externalAccountId: parsed.data.externalAccountId || null,
      apiBaseUrl: parsed.data.apiBaseUrl || null,
    },
  });
  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      action: "CREATE",
      entityType: "Courier",
      entityId: courier.id,
      after: { name: courier.name },
    },
  });
  revalidatePath(`/${locale}/admin/couriers`);
  redirect(`/${locale}/admin/couriers?status=created`);
}

export async function updateCourierAction(formData: FormData) {
  const locale = localeFrom(formData);
  const actor = await requireRole(locale, ["SUPER_ADMIN"]);
  const parsed = z
    .object({
      courierId: z.string().cuid(),
      name: z.string().trim().min(2).max(100),
      integrationMode: z.enum(["MANUAL", "API"]),
      integrationStatus: z.enum(["NOT_CONFIGURED", "CONNECTED", "PAUSED"]),
      externalAccountId: z.string().trim().max(100).optional(),
      apiBaseUrl: z.preprocess(
        (value) => (value === "" ? undefined : value),
        z.string().url().max(500).optional(),
      ),
      active: z.preprocess((value) => value === "on", z.boolean()),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/${locale}/admin/couriers?status=invalid`);
  const courier = await prisma.courier.update({
    where: { id: parsed.data.courierId },
    data: {
      name: parsed.data.name,
      integrationMode: parsed.data.integrationMode,
      integrationStatus: parsed.data.integrationStatus,
      externalAccountId: parsed.data.externalAccountId || null,
      apiBaseUrl: parsed.data.apiBaseUrl || null,
      active: parsed.data.active,
    },
  });
  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      action: "UPDATE",
      entityType: "DeliveryCompany",
      entityId: courier.id,
      after: {
        name: courier.name,
        active: courier.active,
        integrationMode: courier.integrationMode,
        integrationStatus: courier.integrationStatus,
      },
    },
  });
  revalidatePath(`/${locale}/admin/couriers`);
  redirect(`/${locale}/admin/couriers?status=updated`);
}

export async function saveCityAction(formData: FormData) {
  const locale = localeFrom(formData);
  const actor = await requireRole(locale, ["SUPER_ADMIN"]);
  const parsed = z
    .object({
      cityId: z.preprocess(
        (value) => (value === "" ? undefined : value),
        z.string().cuid().optional(),
      ),
      nameFr: z.string().trim().min(2).max(100),
      nameAr: z.string().trim().min(2).max(100),
      slug: z
        .string()
        .trim()
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      deliveryFee: z.coerce.number().nonnegative().max(10_000),
      active: z.preprocess((value) => value === "on", z.boolean()),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/${locale}/admin/cities?status=invalid`);
  const city = parsed.data.cityId
    ? await prisma.city.update({
        where: { id: parsed.data.cityId },
        data: {
          nameFr: parsed.data.nameFr,
          nameAr: parsed.data.nameAr,
          slug: parsed.data.slug,
          deliveryFee: parsed.data.deliveryFee,
          active: parsed.data.active,
        },
      })
    : await prisma.city.create({
        data: {
          nameFr: parsed.data.nameFr,
          nameAr: parsed.data.nameAr,
          slug: parsed.data.slug,
          deliveryFee: parsed.data.deliveryFee,
          active: parsed.data.active,
        },
      });
  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      action: parsed.data.cityId ? "UPDATE" : "CREATE",
      entityType: "City",
      entityId: city.id,
      after: {
        slug: city.slug,
        deliveryFee: city.deliveryFee?.toString(),
        active: city.active,
      },
    },
  });
  revalidatePath(`/${locale}/admin/cities`);
  revalidatePath(`/${locale}/app/partner/orders/new`);
  revalidatePath(`/${locale}/app/partner/cart`);
  redirect(`/${locale}/admin/cities?status=updated`);
}

export async function requestPayoutAction(formData: FormData) {
  const locale = localeFrom(formData);
  const user = await requirePermission(locale, "payouts:request");
  const parsed = payoutRequestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/${locale}/app/partner/wallet?status=invalid`);
  try {
    await requestPayout(
      { id: user.id, role: user.role },
      new Prisma.Decimal(parsed.data.amount),
    );
  } catch (error) {
    if (error instanceof PayoutError && error.code === "BANK_REQUIRED")
      redirect(`/${locale}/app/partner/settings?status=bank-required`);
    if (error instanceof PayoutError && error.code === "OPEN_REQUEST")
      redirect(`/${locale}/app/partner/wallet?status=open-request`);
    if (error instanceof PayoutError && error.code === "NEGATIVE_BALANCE")
      redirect(`/${locale}/app/partner/wallet?status=negative-balance`);
    if (error instanceof PayoutError && error.code === "INSUFFICIENT")
      redirect(`/${locale}/app/partner/wallet?status=insufficient`);
    redirect(`/${locale}/app/partner/wallet?status=failed`);
  }
  revalidatePath(`/${locale}/app/partner/wallet`);
  redirect(`/${locale}/app/partner/wallet?status=requested`);
}

export async function payoutStatusAction(formData: FormData) {
  const locale = localeFrom(formData);
  const actor = await requirePermission(locale, "finance:manage");
  const parsed = z
    .object({
      payoutId: z.string().cuid(),
      status: z.enum(["APPROVED", "REJECTED", "PAID"]),
      reason: z.string().trim().max(500).optional(),
      bankReference: z.string().trim().max(100).optional().or(z.literal("")),
    })
    .superRefine((value, context) => {
      if (value.status === "REJECTED" && !value.reason)
        context.addIssue({
          code: "custom",
          path: ["reason"],
          message: "Reason required",
        });
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/${locale}/admin/finance?status=invalid`);

  let proof: { objectKey: string; url: string } | null = null;
  if (parsed.data.status === "PAID") {
    const file = formData.get("proof");
    if (!(file instanceof File) || file.size <= 0) {
      redirect(`/${locale}/admin/finance?status=proof_required`);
    }
    proof = await uploadPayoutProof(
      file,
      `payout-proofs/affiliate/${parsed.data.payoutId}`,
    );
    if (!proof) redirect(`/${locale}/admin/finance?status=invalid-proof`);
  }

  try {
    await transitionPayout(actor.id, parsed.data.payoutId, parsed.data.status, {
      ...parsed.data,
      proofObjectKey: proof?.objectKey,
      proofUrl: proof?.url,
    });
  } catch (error) {
    if (proof) await deleteObject(proof.objectKey).catch(() => undefined);
    if (error instanceof PayoutError)
      redirect(`/${locale}/admin/finance?status=${error.code.toLowerCase()}`);
    redirect(`/${locale}/admin/finance?status=failed`);
  }
  revalidatePath(`/${locale}/admin/finance`);
  revalidatePath(`/${locale}/app/partner/wallet`);
  redirect(`/${locale}/admin/finance?status=updated`);
}

export async function requestConfirmatorPayoutAction(formData: FormData) {
  const locale = localeFrom(formData);
  const user = await requireRole(locale, ["CONFIRMATION_AGENT"]);
  const parsed = z
    .object({
      amount: z.coerce.number().positive().max(1_000_000),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    redirect(`/${locale}/admin/confirmation/payments?status=invalid`);
  try {
    await requestConfirmatorPayout(
      { id: user.id, role: user.role },
      new Prisma.Decimal(parsed.data.amount),
    );
  } catch (error) {
    if (error instanceof PayoutError && error.code === "BANK_REQUIRED")
      redirect(`/${locale}/admin/settings?tab=bank&status=bank-required`);
    if (error instanceof PayoutError && error.code === "OPEN_REQUEST")
      redirect(`/${locale}/admin/confirmation/payments?status=open-request`);
    if (error instanceof PayoutError && error.code === "INSUFFICIENT")
      redirect(`/${locale}/admin/confirmation/payments?status=insufficient`);
    if (error instanceof PayoutError && error.code === "NEGATIVE_BALANCE")
      redirect(
        `/${locale}/admin/confirmation/payments?status=negative-balance`,
      );
    redirect(`/${locale}/admin/confirmation/payments?status=failed`);
  }
  revalidatePath(`/${locale}/admin/confirmation/payments`);
  revalidatePath(`/${locale}/admin/confirmator-payouts`);
  revalidatePath(`/${locale}/admin/confirmation/dashboard`);
  redirect(`/${locale}/admin/confirmation/payments?status=requested`);
}

export async function updateStaffProfileAction(formData: FormData) {
  const locale = localeFrom(formData);
  const user = await requirePermission(locale, "profile:manage");
  if (user.role === "AFFILIATE" || user.role === "AFFILIATE_STAFF")
    redirect(`/${locale}/app/partner/settings?status=invalid`);
  const parsed = z
    .object({
      name: z.string().trim().min(2).max(120),
      phone: z.union([moroccanPhoneSchema, z.literal("")]),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    redirect(`/${locale}/admin/settings?tab=profile&status=invalid`);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        name: parsed.data.name,
        phone: parsed.data.phone || null,
        preferredLocale: locale === "ar" ? "AR" : "FR",
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "UPDATE",
        entityType: "User",
        entityId: user.id,
        after: { profileUpdated: true },
      },
    });
  });
  revalidatePath(`/${locale}/admin/settings`);
  redirect(`/${locale}/admin/settings?tab=profile&status=profile-updated`);
}

export async function updateStaffBankAction(formData: FormData) {
  const locale = localeFrom(formData);
  const user = await requirePermission(locale, "profile:manage");
  if (user.role === "AFFILIATE" || user.role === "AFFILIATE_STAFF")
    redirect(`/${locale}/app/partner/settings?tab=bank&status=invalid`);
  const parsed = z
    .object({
      bankName: z.string().trim().max(100),
      rib: z.union([ribSchema, z.literal("")]),
      currentPassword: z.string().max(128).optional().or(z.literal("")),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    redirect(`/${locale}/admin/settings?tab=bank&status=invalid`);
  const current = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
  });
  const nextBankName = parsed.data.bankName || null;
  const nextRib = nextBankName ? parsed.data.rib || current.rib : null;
  if (nextBankName && !nextRib)
    redirect(`/${locale}/admin/settings?tab=bank&status=invalid`);
  const bankChanging =
    nextBankName !== current.bankName || nextRib !== current.rib;
  if (
    bankChanging &&
    (!current.passwordHash ||
      !parsed.data.currentPassword ||
      !(await verify(current.passwordHash, parsed.data.currentPassword)))
  ) {
    redirect(`/${locale}/admin/settings?tab=bank&status=current-password`);
  }
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { bankName: nextBankName, rib: nextRib },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "UPDATE",
        entityType: "User",
        entityId: user.id,
        before: {
          bankName: current.bankName,
          ribLast4: current.rib?.slice(-4),
        },
        after: { bankName: nextBankName, ribLast4: nextRib?.slice(-4) },
      },
    });
  });
  revalidatePath(`/${locale}/admin/settings`);
  revalidatePath(`/${locale}/admin/confirmation/payments`);
  redirect(`/${locale}/admin/settings?tab=bank&status=bank-updated`);
}

export async function updateStaffPasswordAction(formData: FormData) {
  const locale = localeFrom(formData);
  const user = await requirePermission(locale, "profile:manage");
  if (user.role === "AFFILIATE" || user.role === "AFFILIATE_STAFF")
    redirect(`/${locale}/app/partner/settings?tab=password&status=invalid`);
  const parsed = z
    .object({
      currentPassword: z.string().min(1).max(128),
      password: z.string().min(10).max(128),
      confirmation: z.string().min(10).max(128),
    })
    .refine((value) => value.password === value.confirmation, {
      path: ["confirmation"],
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    redirect(
      `/${locale}/admin/settings?tab=password&status=password-mismatch`,
    );
  const current = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
  });
  if (
    !current.passwordHash ||
    !(await verify(current.passwordHash, parsed.data.currentPassword))
  ) {
    redirect(
      `/${locale}/admin/settings?tab=password&status=current-password`,
    );
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hash(parsed.data.password) },
  });
  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "UPDATE",
      entityType: "User",
      entityId: user.id,
      after: { passwordChanged: true },
    },
  });
  revalidatePath(`/${locale}/admin/settings`);
  redirect(`/${locale}/admin/settings?tab=password&status=password-updated`);
}

export async function confirmatorPayoutStatusAction(formData: FormData) {
  const locale = localeFrom(formData);
  const actor = await requireRole(locale, ["SUPER_ADMIN", "FINANCE"]);
  const parsed = z
    .object({
      payoutId: z.string().cuid(),
      status: z.enum(["APPROVED", "REJECTED", "PAID"]),
      reason: z.string().trim().max(500).optional(),
      bankReference: z.string().trim().max(100).optional().or(z.literal("")),
    })
    .superRefine((value, context) => {
      if (value.status === "REJECTED" && !value.reason)
        context.addIssue({
          code: "custom",
          path: ["reason"],
          message: "Reason required",
        });
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    redirect(`/${locale}/admin/confirmator-payouts?status=invalid`);

  let proof: { objectKey: string; url: string } | null = null;
  if (parsed.data.status === "PAID") {
    const file = formData.get("proof");
    if (!(file instanceof File) || file.size <= 0) {
      redirect(`/${locale}/admin/confirmator-payouts?status=proof_required`);
    }
    proof = await uploadPayoutProof(
      file,
      `payout-proofs/confirmator/${parsed.data.payoutId}`,
    );
    if (!proof)
      redirect(`/${locale}/admin/confirmator-payouts?status=invalid-proof`);
  }

  try {
    await transitionConfirmatorPayout(
      actor.id,
      parsed.data.payoutId,
      parsed.data.status,
      {
        ...parsed.data,
        proofObjectKey: proof?.objectKey,
        proofUrl: proof?.url,
      },
    );
  } catch (error) {
    if (proof) await deleteObject(proof.objectKey).catch(() => undefined);
    if (error instanceof PayoutError)
      redirect(
        `/${locale}/admin/confirmator-payouts?status=${error.code.toLowerCase()}`,
      );
    redirect(`/${locale}/admin/confirmator-payouts?status=failed`);
  }
  revalidatePath(`/${locale}/admin/confirmator-payouts`);
  revalidatePath(`/${locale}/admin/confirmation/payments`);
  revalidatePath(`/${locale}/admin/confirmation/dashboard`);
  redirect(`/${locale}/admin/confirmator-payouts?status=updated`);
}

export async function createTicketAction(formData: FormData) {
  const locale = localeFrom(formData);
  const user = await requirePermission(locale, "orders:view");
  const parsed = z
    .object({
      type: z.enum(["SUPPORT", "CLAIM"]),
      subject: z.string().trim().min(3).max(160),
      message: z.string().trim().min(5).max(4000),
      orderId: z.preprocess(
        (value) => (value === "" ? undefined : value),
        z.string().cuid().optional(),
      ),
    })
    .superRefine((value, context) => {
      if (value.type === "CLAIM" && !value.orderId)
        context.addIssue({
          code: "custom",
          path: ["orderId"],
          message: "Order required for a claim",
        });
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    redirect(`/${locale}/app/partner/tickets?status=invalid`);
  const affiliateId = await affiliateIdFor(user.id, user.role);
  await prisma.$transaction(
    async (tx) => {
      if (parsed.data.orderId)
        await tx.order.findFirstOrThrow({
          where: {
            id: parsed.data.orderId,
            affiliateId,
            ...(parsed.data.type === "CLAIM"
              ? {
                  deliveryStatus: {
                    in: ["IN_TRANSIT", "DELIVERED", "RETURNED"] as const,
                  },
                }
              : {}),
          },
          select: { id: true },
        });
      const year = new Date().getFullYear();
      const sequence = await nextCounter(tx, `ticket:${year}`);
      const ticket = await tx.ticket.create({
        data: {
          code: `TKT-${year}-${String(sequence).padStart(6, "0")}`,
          type: parsed.data.type,
          subject: parsed.data.subject,
          affiliateId,
          createdById: user.id,
          orderId: parsed.data.orderId || null,
          messages: {
            create: { authorId: user.id, message: parsed.data.message },
          },
        },
      });
      await notifyRoles(tx, ["SUPER_ADMIN", "SUPPORT"], {
        type: "TICKET_CREATED",
        titleKey: "ticket.created.title",
        bodyKey: "ticket.created.body",
        data: {
          ticketCode: ticket.code,
          ticketId: ticket.id,
          subject: ticket.subject,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "CREATE",
          entityType: "Ticket",
          entityId: ticket.id,
          after: { code: ticket.code },
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  revalidatePath(`/${locale}/app/partner/tickets`);
  redirect(`/${locale}/app/partner/tickets?status=created`);
}

export async function replyPartnerTicketAction(formData: FormData) {
  const locale = localeFrom(formData);
  const user = await requirePermission(locale, "orders:view");
  const parsed = z
    .object({
      ticketId: z.string().cuid(),
      message: z.string().trim().min(2).max(4000),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    redirect(`/${locale}/app/partner/tickets?status=invalid`);
  const affiliateId = await affiliateIdFor(user.id, user.role);
  await prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.findFirstOrThrow({
      where: { id: parsed.data.ticketId, affiliateId },
    });
    await tx.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        authorId: user.id,
        message: parsed.data.message,
      },
    });
    if (ticket.status === "CLOSED")
      await tx.ticket.update({
        where: { id: ticket.id },
        data: { status: "OPEN" },
      });
    const notifyIds = new Set<string>();
    if (ticket.assignedToId) notifyIds.add(ticket.assignedToId);
    const supportUsers = await tx.user.findMany({
      where: {
        role: { in: ["SUPER_ADMIN", "SUPPORT"] },
        status: "ACTIVE",
        id: { not: user.id },
      },
      select: { id: true },
    });
    for (const supportUser of supportUsers) notifyIds.add(supportUser.id);
    await notifyUsers(
      tx,
      [...notifyIds].map((userId) => ({
        userId,
        type: "TICKET_REPLY" as const,
        titleKey: "ticket.partnerReply.title",
        bodyKey: "ticket.partnerReply.body",
        data: { ticketCode: ticket.code, ticketId: ticket.id },
      })),
    );
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "UPDATE",
        entityType: "Ticket",
        entityId: ticket.id,
        after: {
          partnerReply: true,
          status: ticket.status === "CLOSED" ? "OPEN" : ticket.status,
        },
      },
    });
  });
  revalidatePath(`/${locale}/app/partner/tickets/${parsed.data.ticketId}`);
  revalidatePath(`/${locale}/admin/support`);
  redirect(
    `/${locale}/app/partner/tickets/${parsed.data.ticketId}?status=updated`,
  );
}

export async function updateProfileAction(formData: FormData) {
  const locale = localeFrom(formData);
  const user = await requireRole(locale, ["AFFILIATE"]);
  const parsed = z
    .object({
      name: z.string().trim().min(2).max(120),
      phone: moroccanPhoneSchema,
      socialPage: z.string().trim().url().or(z.literal("")),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    redirect(`/${locale}/app/partner/settings?status=invalid`);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        name: parsed.data.name,
        phone: parsed.data.phone,
        preferredLocale: locale === "ar" ? "AR" : "FR",
      },
    });
    await tx.affiliateProfile.update({
      where: { userId: user.id },
      data: { socialPage: parsed.data.socialPage || null },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "UPDATE",
        entityType: "AffiliateProfile",
        entityId: user.id,
        after: { profileUpdated: true },
      },
    });
  });
  revalidatePath(`/${locale}/app/partner/settings`);
  redirect(
    `/${locale}/app/partner/settings?tab=profile&status=profile-updated`,
  );
}

export async function updateBankAction(formData: FormData) {
  const locale = localeFrom(formData);
  const user = await requirePermission(locale, "profile:manage");
  const parsed = z
    .object({
      bankName: z.string().trim().max(100),
      rib: z.union([ribSchema, z.literal("")]),
      currentPassword: z.string().max(128).optional().or(z.literal("")),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    redirect(`/${locale}/app/partner/settings?tab=bank&status=invalid`);
  const affiliateId = await affiliateIdFor(user.id, user.role);
  const [current, affiliate] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
    prisma.affiliateProfile.findUniqueOrThrow({ where: { id: affiliateId } }),
  ]);
  const nextBankName = parsed.data.bankName || null;
  const nextRib = nextBankName ? parsed.data.rib || affiliate.rib : null;
  if (nextBankName && !nextRib) {
    redirect(`/${locale}/app/partner/settings?tab=bank&status=invalid`);
  }
  const bankChanging =
    nextBankName !== affiliate.bankName || nextRib !== affiliate.rib;
  if (
    bankChanging &&
    (!current.passwordHash ||
      !parsed.data.currentPassword ||
      !(await verify(current.passwordHash, parsed.data.currentPassword)))
  ) {
    redirect(
      `/${locale}/app/partner/settings?tab=bank&status=current-password`,
    );
  }
  await prisma.$transaction(async (tx) => {
    await tx.affiliateProfile.update({
      where: { id: affiliateId },
      data: { bankName: nextBankName, rib: nextRib },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "UPDATE",
        entityType: "AffiliateProfile",
        entityId: affiliateId,
        before: {
          bankName: affiliate.bankName,
          ribLast4: affiliate.rib?.slice(-4),
        },
        after: { bankName: nextBankName, ribLast4: nextRib?.slice(-4) },
      },
    });
  });
  revalidatePath(`/${locale}/app/partner/settings`);
  redirect(`/${locale}/app/partner/settings?tab=bank&status=bank-updated`);
}

export async function updatePasswordAction(formData: FormData) {
  const locale = localeFrom(formData);
  const user = await requireRole(locale, ["AFFILIATE"]);
  const parsed = z
    .object({
      currentPassword: z.string().min(1).max(128),
      password: z.string().min(10).max(128),
      confirmation: z.string().min(10).max(128),
    })
    .refine((value) => value.password === value.confirmation, {
      path: ["confirmation"],
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    redirect(
      `/${locale}/app/partner/settings?tab=password&status=password-mismatch`,
    );
  const current = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
  });
  if (
    !current.passwordHash ||
    !(await verify(current.passwordHash, parsed.data.currentPassword))
  ) {
    redirect(
      `/${locale}/app/partner/settings?tab=password&status=current-password`,
    );
  }
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash: await hash(parsed.data.password) },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "UPDATE",
        entityType: "User",
        entityId: user.id,
        after: { passwordChanged: true },
      },
    });
  });
  redirect(
    `/${locale}/app/partner/settings?tab=password&status=password-updated`,
  );
}

export async function createProductAction(
  previousState: CreateProductState,
  formData: FormData,
): Promise<CreateProductState> {
  const locale = localeFrom(formData);
  const actor = await requirePermission(locale, "catalog:manage");
  const submitted = Object.fromEntries(formData);
  submitted.slug = normalizeProductSlug(
    String(submitted.slug ?? ""),
    String(submitted.nameFr ?? ""),
  );
  const values = Object.fromEntries(
    createProductFields.map((field) => [field, String(submitted[field] ?? "")]),
  ) as Record<CreateProductField, string>;
  const images = formData
    .getAll("images")
    .filter((value): value is File => value instanceof File && value.size > 0);
  const inspectedImages = await Promise.all(
    images.map(async (file) => ({ file, kind: await inspectImageFile(file) })),
  );
  const invalidImages =
    images.length > 8 || inspectedImages.some((image) => !image.kind);
  const parsed = createProductSchema.safeParse(submitted);
  if (!parsed.success || invalidImages) {
    return {
      status: "invalid",
      revision: previousState.revision + 1,
      message:
        locale === "ar"
          ? "صحّح الحقول المشار إليها ثم أعد اختيار الصور إن لزم."
          : "Corrigez les champs signalés puis sélectionnez à nouveau les images si nécessaire.",
      fieldErrors: {
        ...(parsed.success ? {} : parsed.error.flatten().fieldErrors),
        ...(invalidImages ? { images: ["Invalid product images"] } : {}),
      },
      values,
    };
  }
  const uploadedImages: {
    objectKey: string;
    url: string;
    sortOrder: number;
  }[] = [];
  try {
    const uploadBatch = randomUUID();
    for (const [index, inspected] of inspectedImages.entries()) {
      if (!inspected.kind) throw new Error("Invalid image signature");
      const { file: image, kind } = inspected;
      const extension = kind.extension;
      const objectKey = `products/${uploadBatch}/${String(index + 1).padStart(2, "0")}.${extension}`;
      const url = await uploadObject(objectKey, image);
      uploadedImages.push({ objectKey, url, sortOrder: index });
    }
    await prisma.$transaction(async (tx) => {
      const year = new Date().getFullYear();
      let code = "";
      for (let attempt = 0; attempt < 100 && !code; attempt += 1) {
        const sequence = await nextCounter(tx, `product:${year}`);
        const candidate = buildProductCode(year, sequence);
        const exists = await tx.product.findUnique({
          where: { code: candidate },
          select: { id: true },
        });
        if (!exists) code = candidate;
      }
      if (!code) throw new Error("Unable to allocate a product code");
      const sizes = parseProductSizes(parsed.data.sizes);
      const product = await tx.product.create({
        data: {
          categoryId: parsed.data.categoryId,
          code,
          slug: parsed.data.slug,
          nameFr: parsed.data.nameFr,
          nameAr: parsed.data.nameAr || null,
          descriptionFr: parsed.data.descriptionFr,
          descriptionAr: parsed.data.descriptionAr || null,
          productPrice: parsed.data.productPrice,
          serviceFee: parsed.data.serviceFee,
          salePrice: parsed.data.salePrice,
          commission: parsed.data.commission,
          mediaDriveUrl: parsed.data.mediaDriveUrl || null,
          published: false,
          publishedAt: null,
          images: uploadedImages.length
            ? {
                create: uploadedImages.map((image) => ({
                  ...image,
                  altFr: parsed.data.nameFr,
                })),
              }
            : undefined,
          variants: {
            create: sizes.map((size) => ({
              sku: buildVariantSku(code, randomUUID()),
              color: parsed.data.color || null,
              size,
              stock: parsed.data.stock,
            })),
          },
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "CREATE",
          entityType: "Product",
          entityId: product.id,
          after: {
            code: product.code,
            published: false,
            sizes,
            imageCount: uploadedImages.length,
            mediaDriveUrl: product.mediaDriveUrl,
          },
        },
      });
    });
  } catch (error) {
    await Promise.allSettled(
      uploadedImages.map((image) => deleteObject(image.objectKey)),
    );
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        status: "duplicate",
        revision: previousState.revision + 1,
        message:
          locale === "ar"
            ? "معرّف URL مستخدم بالفعل."
            : "L’identifiant URL existe déjà.",
        values,
      };
    }
    return {
      status: "failed",
      revision: previousState.revision + 1,
      message:
        locale === "ar"
          ? "تعذر إنشاء المنتج أو رفع الصور. أعد المحاولة."
          : "Impossible de créer le produit ou de téléverser les images. Réessayez.",
      values,
    };
  }
  revalidatePath(`/${locale}/admin/catalog`);
  revalidatePath(`/${locale}/app/partner/products`);
  redirect(`/${locale}/admin/catalog?status=created`);
}

export async function toggleProductAction(formData: FormData) {
  const locale = localeFrom(formData);
  const actor = await requirePermission(locale, "catalog:manage");
  const parsed = z
    .object({
      productId: z.string().cuid(),
      published: z.enum(["true", "false"]),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/${locale}/admin/catalog?status=invalid`);
  const published = parsed.data.published === "true";
  if (published) {
    const requirements = await prisma.product.findUnique({
      where: { id: parsed.data.productId },
      select: {
        nameAr: true,
        descriptionFr: true,
        descriptionAr: true,
        _count: { select: { images: true } },
        variants: {
          where: { active: true, stock: { gt: 0 } },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (
      !requirements ||
      !requirements.nameAr?.trim() ||
      !requirements.descriptionFr.trim() ||
      !requirements.descriptionAr?.trim() ||
      requirements._count.images < 1 ||
      requirements.variants.length < 1
    )
      redirect(`/${locale}/admin/catalog?status=publish-requirements`);
  }
  await prisma.product.update({
    where: { id: parsed.data.productId },
    data: { published, publishedAt: published ? new Date() : null },
  });
  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      action: "UPDATE",
      entityType: "Product",
      entityId: parsed.data.productId,
      after: { published },
    },
  });
  revalidatePath(`/${locale}/admin/catalog`);
  revalidatePath(`/${locale}/app/partner/products`);
  redirect(`/${locale}/admin/catalog?status=updated`);
}

export async function updateProductAction(formData: FormData) {
  const locale = localeFrom(formData);
  const actor = await requirePermission(locale, "catalog:manage");
  const parsed = z
    .object({
      productId: z.string().cuid(),
      categoryId: z.string().cuid(),
      slug: z
        .string()
        .trim()
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      nameFr: z.string().trim().min(2).max(160),
      nameAr: z.string().trim().max(160).optional(),
      descriptionFr: z.string().trim().min(5).max(5000),
      descriptionAr: z.string().trim().max(5000).optional(),
      productPrice: z.coerce.number().nonnegative(),
      serviceFee: z.coerce.number().nonnegative(),
      salePrice: z.coerce.number().positive(),
      commission: z.coerce.number().nonnegative(),
      videoUrl: z.string().trim().url().optional().or(z.literal("")),
      mediaDriveUrl: z.string().trim().url().optional().or(z.literal("")),
      allowCustomSalePrice: z.preprocess(
        (value) => value === "on",
        z.boolean(),
      ),
      minSalePrice: z.preprocess(
        (value) => (value === "" ? undefined : value),
        z.coerce.number().positive().optional(),
      ),
    })
    .superRefine((value, context) => {
      validateProductFinancials(value, context);
      if (
        value.allowCustomSalePrice &&
        value.minSalePrice &&
        value.minSalePrice > value.salePrice
      )
        context.addIssue({
          code: "custom",
          path: ["minSalePrice"],
          message: "Minimum price must not exceed sale price",
        });
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    redirect(
      `/${locale}/admin/catalog/${String(formData.get("productId") ?? "")}?status=invalid`,
    );
  try {
    const before = await prisma.product.findUniqueOrThrow({
      where: { id: parsed.data.productId },
      select: { code: true, salePrice: true, commission: true },
    });
    const product = await prisma.product.update({
      where: { id: parsed.data.productId },
      data: {
        categoryId: parsed.data.categoryId,
        slug: parsed.data.slug,
        nameFr: parsed.data.nameFr,
        nameAr: parsed.data.nameAr || null,
        descriptionFr: parsed.data.descriptionFr,
        descriptionAr: parsed.data.descriptionAr || null,
        productPrice: parsed.data.productPrice,
        serviceFee: parsed.data.serviceFee,
        salePrice: parsed.data.salePrice,
        commission: parsed.data.commission,
        videoUrl: parsed.data.videoUrl || null,
        mediaDriveUrl: parsed.data.mediaDriveUrl || null,
        allowCustomSalePrice: parsed.data.allowCustomSalePrice,
        minSalePrice: parsed.data.allowCustomSalePrice
          ? (parsed.data.minSalePrice ?? parsed.data.salePrice)
          : null,
      },
    });
    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        action: "UPDATE",
        entityType: "Product",
        entityId: product.id,
        before: {
          code: before.code,
          salePrice: before.salePrice.toString(),
          commission: before.commission.toString(),
        },
        after: {
          code: product.code,
          salePrice: product.salePrice.toString(),
          commission: product.commission.toString(),
        },
      },
    });
  } catch {
    redirect(`/${locale}/admin/catalog/${parsed.data.productId}?status=failed`);
  }
  revalidatePath(`/${locale}/admin/catalog`);
  revalidatePath(`/${locale}/admin/catalog/${parsed.data.productId}`);
  revalidatePath(`/${locale}/app/partner/products`);
  redirect(`/${locale}/admin/catalog/${parsed.data.productId}?status=updated`);
}

export async function addProductVariantAction(formData: FormData) {
  const locale = localeFrom(formData);
  const actor = await requirePermission(locale, "catalog:manage");
  const parsed = z
    .object({
      productId: z.string().cuid(),
      size: z.string().trim().min(1).max(40),
      color: z.string().trim().max(80).optional(),
      stock: z.coerce.number().int().nonnegative(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    redirect(
      `/${locale}/admin/catalog/${String(formData.get("productId") ?? "")}?status=invalid-variant`,
    );
  const product = await prisma.product.findUniqueOrThrow({
    where: { id: parsed.data.productId },
    select: { code: true, slug: true },
  });
  const duplicate = await prisma.productVariant.findFirst({
    where: {
      productId: parsed.data.productId,
      size: { equals: parsed.data.size },
      color: parsed.data.color || null,
    },
    select: { id: true },
  });
  if (duplicate)
    redirect(
      `/${locale}/admin/catalog/${parsed.data.productId}?status=duplicate-variant`,
    );
  const variant = await prisma.productVariant.create({
    data: {
      productId: parsed.data.productId,
      sku: buildVariantSku(product.code, randomUUID()),
      size: parsed.data.size,
      color: parsed.data.color || null,
      stock: parsed.data.stock,
    },
  });
  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      action: "CREATE",
      entityType: "ProductVariant",
      entityId: variant.id,
      after: {
        productId: product.slug,
        size: variant.size,
        color: variant.color,
        stock: variant.stock,
      },
    },
  });
  revalidatePath(`/${locale}/admin/catalog/${parsed.data.productId}`);
  revalidatePath(`/${locale}/app/partner/products/${product.slug}`);
  redirect(
    `/${locale}/admin/catalog/${parsed.data.productId}?status=variant-added`,
  );
}

export async function updateProductVariantAction(formData: FormData) {
  const locale = localeFrom(formData);
  const actor = await requirePermission(locale, "catalog:manage");
  const parsed = z
    .object({
      productId: z.string().cuid(),
      variantId: z.string().cuid(),
      stock: z.coerce.number().int().nonnegative().max(1_000_000),
      reason: z.string().trim().min(3).max(500),
      active: z.preprocess((value) => value === "on", z.boolean()),
    })
    .safeParse(Object.fromEntries(formData));
  const productId = String(formData.get("productId") ?? "");
  if (!parsed.success)
    redirect(`/${locale}/admin/catalog/${productId}?status=invalid-stock`);
  const product = await prisma.$transaction(async (tx) => {
    const variant = await tx.productVariant.findFirstOrThrow({
      where: { id: parsed.data.variantId, productId: parsed.data.productId },
      include: { product: { select: { slug: true } } },
    });
    const updated = await tx.productVariant.update({
      where: { id: variant.id },
      data: { stock: parsed.data.stock, active: parsed.data.active },
    });
    if (updated.stock !== variant.stock)
      await tx.stockMovement.create({
        data: {
          variantId: variant.id,
          actorId: actor.id,
          type: "MANUAL",
          quantityDelta: updated.stock - variant.stock,
          stockBefore: variant.stock,
          stockAfter: updated.stock,
          reason: parsed.data.reason,
        },
      });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "UPDATE",
        entityType: "ProductVariant",
        entityId: variant.id,
        before: { stock: variant.stock, active: variant.active },
        after: {
          stock: updated.stock,
          active: updated.active,
          reason: parsed.data.reason,
        },
      },
    });
    return variant.product;
  });
  revalidatePath(`/${locale}/admin/catalog/${parsed.data.productId}`);
  revalidatePath(`/${locale}/app/partner/products/${product.slug}`);
  redirect(
    `/${locale}/admin/catalog/${parsed.data.productId}?status=variant-updated`,
  );
}

export async function uploadProductImageAction(formData: FormData) {
  const locale = localeFrom(formData);
  const actor = await requirePermission(locale, "catalog:manage");
  const productId = String(formData.get("productId") ?? "");
  const file = formData.get("image");
  const altFr = String(formData.get("altFr") ?? "")
    .trim()
    .slice(0, 180);
  const altAr = String(formData.get("altAr") ?? "")
    .trim()
    .slice(0, 180);
  const inspectedImage =
    file instanceof File ? await inspectImageFile(file) : null;
  if (
    !z.string().cuid().safeParse(productId).success ||
    !(file instanceof File) ||
    !inspectedImage
  )
    redirect(`/${locale}/admin/catalog/${productId}?status=invalid-image`);
  const extension = inspectedImage.extension;
  const objectKey = `products/${productId}/${randomUUID()}.${extension}`;
  try {
    const url = await uploadObject(objectKey, file);
    const last = await prisma.productImage.findFirst({
      where: { productId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const image = await prisma.productImage.create({
      data: {
        productId,
        objectKey,
        url,
        altFr: altFr || null,
        altAr: altAr || null,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });
    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        action: "CREATE",
        entityType: "ProductImage",
        entityId: image.id,
        after: { productId, objectKey },
      },
    });
  } catch {
    redirect(`/${locale}/admin/catalog/${productId}?status=storage-failed`);
  }
  revalidatePath(`/${locale}/admin/catalog/${productId}`);
  revalidatePath(`/${locale}/app/partner/products`);
  redirect(`/${locale}/admin/catalog/${productId}?status=image-uploaded`);
}

export async function reorderProductImageAction(formData: FormData) {
  const locale = localeFrom(formData);
  await requirePermission(locale, "catalog:manage");
  const parsed = z
    .object({
      productId: z.string().cuid(),
      imageId: z.string().cuid(),
      direction: z.enum(["up", "down"]),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/${locale}/admin/catalog?status=invalid`);
  const images = await prisma.productImage.findMany({
    where: { productId: parsed.data.productId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const index = images.findIndex((item) => item.id === parsed.data.imageId);
  const targetIndex = parsed.data.direction === "up" ? index - 1 : index + 1;
  if (index >= 0 && targetIndex >= 0 && targetIndex < images.length)
    await prisma.$transaction([
      prisma.productImage.update({
        where: { id: images[index].id },
        data: { sortOrder: images[targetIndex].sortOrder },
      }),
      prisma.productImage.update({
        where: { id: images[targetIndex].id },
        data: { sortOrder: images[index].sortOrder },
      }),
    ]);
  revalidatePath(`/${locale}/admin/catalog/${parsed.data.productId}`);
  revalidatePath(`/${locale}/app/partner/products`);
  redirect(`/${locale}/admin/catalog/${parsed.data.productId}?status=updated`);
}

export async function deleteProductImageAction(formData: FormData) {
  const locale = localeFrom(formData);
  const actor = await requirePermission(locale, "catalog:manage");
  const parsed = z
    .object({ productId: z.string().cuid(), imageId: z.string().cuid() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/${locale}/admin/catalog?status=invalid`);
  const image = await prisma.productImage.findFirstOrThrow({
    where: { id: parsed.data.imageId, productId: parsed.data.productId },
  });
  try {
    await deleteObject(image.objectKey);
  } catch {
    redirect(
      `/${locale}/admin/catalog/${parsed.data.productId}?status=storage-failed`,
    );
  }
  await prisma.$transaction([
    prisma.productImage.delete({ where: { id: image.id } }),
    prisma.auditLog.create({
      data: {
        actorId: actor.id,
        action: "DELETE",
        entityType: "ProductImage",
        entityId: image.id,
        before: {
          productId: parsed.data.productId,
          objectKey: image.objectKey,
        },
      },
    }),
  ]);
  revalidatePath(`/${locale}/admin/catalog/${parsed.data.productId}`);
  revalidatePath(`/${locale}/app/partner/products`);
  redirect(`/${locale}/admin/catalog/${parsed.data.productId}?status=updated`);
}

export async function importCatalogAction(formData: FormData) {
  const locale = localeFrom(formData);
  const actor = await requirePermission(locale, "catalog:manage");
  const file = formData.get("file");
  if (
    !(file instanceof File) ||
    file.size <= 0 ||
    file.size > 5 * 1024 * 1024 ||
    !file.name.toLowerCase().endsWith(".xlsx")
  )
    redirect(`/${locale}/admin/catalog?status=invalid-import`);
  const job = await prisma.importJob.create({
    data: {
      type: "EXCEL_IMPORT",
      status: "RUNNING",
      createdById: actor.id,
      startedAt: new Date(),
    },
  });
  let processed = 0;
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()) as never);
    const sheet = workbook.worksheets[0];
    if (!sheet || sheet.rowCount < 2 || sheet.rowCount > 501)
      throw new Error(
        "The workbook must contain between 1 and 500 product rows",
      );
    const headers = new Map<string, number>();
    sheet.getRow(1).eachCell((cell, column) =>
      headers.set(
        String(cell.value ?? "")
          .trim()
          .toLowerCase(),
        column,
      ),
    );
    const required = [
      "code",
      "slug",
      "categoryslug",
      "namefr",
      "descriptionfr",
      "productprice",
      "servicefee",
      "saleprice",
      "commission",
      "sku",
      "stock",
    ];
    if (required.some((header) => !headers.has(header)))
      throw new Error(
        `Missing columns: ${required.filter((header) => !headers.has(header)).join(", ")}`,
      );
    const value = (row: ExcelJS.Row, key: string) =>
      String(row.getCell(headers.get(key)!).value ?? "").trim();
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      if (!value(row, "code")) continue;
      const parsed = z
        .object({
          code: z.string().min(2).max(40),
          slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
          categorySlug: z.string().min(1),
          nameFr: z.string().min(2),
          descriptionFr: z.string().min(5),
          productPrice: z.coerce.number().nonnegative(),
          serviceFee: z.coerce.number().nonnegative(),
          salePrice: z.coerce.number().positive(),
          commission: z.coerce.number().nonnegative(),
          sku: z.string().min(2),
          stock: z.coerce.number().int().nonnegative(),
        })
        .superRefine(validateProductFinancials)
        .parse({
          code: value(row, "code").toUpperCase(),
          slug: value(row, "slug"),
          categorySlug: value(row, "categoryslug"),
          nameFr: value(row, "namefr"),
          descriptionFr: value(row, "descriptionfr"),
          productPrice: value(row, "productprice"),
          serviceFee: value(row, "servicefee"),
          salePrice: value(row, "saleprice"),
          commission: value(row, "commission"),
          sku: value(row, "sku").toUpperCase(),
          stock: value(row, "stock"),
        });
      const category = await prisma.category.findUniqueOrThrow({
        where: { slug: parsed.categorySlug },
        select: { id: true },
      });
      const product = await prisma.product.upsert({
        where: { code: parsed.code },
        create: {
          categoryId: category.id,
          code: parsed.code,
          slug: parsed.slug,
          nameFr: parsed.nameFr,
          descriptionFr: parsed.descriptionFr,
          productPrice: parsed.productPrice,
          serviceFee: parsed.serviceFee,
          salePrice: parsed.salePrice,
          commission: parsed.commission,
          published: true,
          publishedAt: new Date(),
        },
        update: {
          categoryId: category.id,
          slug: parsed.slug,
          nameFr: parsed.nameFr,
          descriptionFr: parsed.descriptionFr,
          productPrice: parsed.productPrice,
          serviceFee: parsed.serviceFee,
          salePrice: parsed.salePrice,
          commission: parsed.commission,
        },
      });
      await prisma.productVariant.upsert({
        where: { sku: parsed.sku },
        create: { productId: product.id, sku: parsed.sku, stock: parsed.stock },
        update: { productId: product.id, stock: parsed.stock, active: true },
      });
      processed += 1;
    }
    await prisma.$transaction([
      prisma.importJob.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          progress: 100,
          totalRows: sheet.rowCount - 1,
          processedRows: processed,
          completedAt: new Date(),
        },
      }),
      prisma.auditLog.create({
        data: {
          actorId: actor.id,
          action: "CREATE",
          entityType: "ImportJob",
          entityId: job.id,
          after: { type: "CATALOG_XLSX", processed },
        },
      }),
    ]);
  } catch (error) {
    await prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        error: error instanceof Error ? error.message : "Import failed",
        processedRows: processed,
        completedAt: new Date(),
      },
    });
    redirect(`/${locale}/admin/catalog?status=import-failed`);
  }
  revalidatePath(`/${locale}/admin/catalog`);
  revalidatePath(`/${locale}/app/partner/products`);
  redirect(`/${locale}/admin/catalog?status=imported`);
}

export async function replyTicketAction(formData: FormData) {
  const locale = localeFrom(formData);
  const actor = await requirePermission(locale, "support:manage");
  const parsed = z
    .object({
      ticketId: z.string().cuid(),
      message: z.string().trim().min(2).max(4000),
      status: z.enum(["OPEN", "IN_PROGRESS", "CLOSED"]),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/${locale}/admin/support?status=invalid`);
  await prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.update({
      where: { id: parsed.data.ticketId },
      data: { status: parsed.data.status, assignedToId: actor.id },
    });
    await tx.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        authorId: actor.id,
        message: parsed.data.message,
      },
    });
    await tx.notification.create({
      data: {
        userId: ticket.createdById,
        type: "TICKET_REPLY",
        titleKey: "ticket.reply.title",
        bodyKey: "ticket.reply.body",
        data: { ticketCode: ticket.code, ticketId: ticket.id },
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "UPDATE",
        entityType: "Ticket",
        entityId: ticket.id,
        after: { status: ticket.status },
      },
    });
  });
  revalidatePath(`/${locale}/admin/support`);
  redirect(`/${locale}/admin/support?status=updated`);
}

export async function createAnnouncementAction(formData: FormData) {
  const locale = localeFrom(formData);
  const actor = await requirePermission(locale, "support:manage");
  const parsed = z
    .object({
      titleFr: z.string().trim().min(2).max(160),
      titleAr: z.string().trim().min(2).max(160),
      bodyFr: z.string().trim().min(5).max(3000),
      bodyAr: z.string().trim().min(5).max(3000),
      startsAt: z.coerce.date(),
      endsAt: z.coerce.date(),
    })
    .refine((item) => item.endsAt > item.startsAt)
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/${locale}/admin/content?status=invalid`);
  await prisma.$transaction(async (tx) => {
    const created = await tx.announcement.create({
      data: { ...parsed.data, published: true, createdById: actor.id },
    });
    await notifyActiveAffiliates(tx, {
      type: "ANNOUNCEMENT",
      titleKey: "announcement.published.title",
      bodyKey: "announcement.published.body",
      data: {
        announcementId: created.id,
        titleFr: created.titleFr,
        titleAr: created.titleAr,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "CREATE",
        entityType: "Announcement",
        entityId: created.id,
        after: { published: true },
      },
    });
  });
  revalidatePath(`/${locale}/admin/content`);
  revalidatePath(`/${locale}/app/partner`);
  revalidatePath(`/${locale}/app/partner/announcements`);
  redirect(`/${locale}/admin/content?status=created`);
}

export async function saveSettingsAction(formData: FormData) {
  const locale = localeFrom(formData);
  const actor = await requireRole(locale, ["SUPER_ADMIN"]);
  const parsed = z
    .object({
      weekdayCutoff: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
      saturdayCutoff: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
      unreachableDays: z.coerce.number().int().min(1).max(14),
      proThreshold: z.coerce.number().int().positive(),
      masterThreshold: z.coerce.number().int().positive(),
      confirmationRewardDh: z.coerce.number().min(0).max(10_000),
    })
    .refine((value) => value.masterThreshold > value.proThreshold, {
      path: ["masterThreshold"],
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/${locale}/admin/settings?status=invalid`);
  for (const [key, value] of Object.entries(parsed.data))
    await prisma.setting.upsert({
      where: { key },
      update: { value, updatedById: actor.id },
      create: { key, value, updatedById: actor.id },
    });
  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      action: "UPDATE",
      entityType: "Setting",
      entityId: "operations",
      after: parsed.data,
    },
  });
  revalidatePath(`/${locale}/admin/settings`);
  redirect(`/${locale}/admin/settings?tab=operations&status=updated`);
}

const staffKeys = [
  "CREATE_ORDERS",
  "VIEW_ORDERS",
  "VIEW_WALLET",
  "REQUEST_PAYOUTS",
  "MANAGE_BANK_DETAILS",
  "MANAGE_STAFF",
] as const;

export async function inviteStaffAction(formData: FormData) {
  const locale = localeFrom(formData);
  const owner = await requirePermission(locale, "team:manage");
  const parsed = z
    .object({
      name: z.string().trim().min(2).max(120),
      email: z.string().trim().toLowerCase().email(),
      phone: z.string().trim().max(30).optional(),
      password: z.string().min(10).max(128),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/${locale}/app/partner/team?status=invalid`);
  if (
    await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true },
    })
  )
    redirect(`/${locale}/app/partner/team?status=failed`);
  const affiliateId = await affiliateIdFor(owner.id, owner.role);
  const affiliate = await prisma.affiliateProfile.findUniqueOrThrow({
    where: { id: affiliateId },
  });
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone || null,
        passwordHash: await hash(parsed.data.password),
        role: "AFFILIATE_STAFF",
        status: "ACTIVE",
        preferredLocale: locale === "ar" ? "AR" : "FR",
      },
    });
    const staff = await tx.affiliateStaff.create({
      data: {
        affiliateProfileId: affiliate.id,
        userId: user.id,
        ownerId: affiliate.userId,
        acceptedAt: new Date(),
      },
    });
    await tx.staffPermission.createMany({
      data: staffKeys.map((key) => ({
        staffId: staff.id,
        key,
        enabled: formData.get(key) === "on",
      })),
    });
    await notifyUser(tx, {
      userId: user.id,
      type: "ACCOUNT_STATUS",
      titleKey: "account.activated.title",
      bodyKey: "account.activated.body",
      data: { invitedBy: owner.name },
    });
    await tx.auditLog.create({
      data: {
        actorId: owner.id,
        action: "CREATE",
        entityType: "AffiliateStaff",
        entityId: staff.id,
        after: { email: user.email },
      },
    });
  });
  revalidatePath(`/${locale}/app/partner/team`);
  redirect(`/${locale}/app/partner/team?status=created`);
}

export async function updateStaffAction(formData: FormData) {
  const locale = localeFrom(formData);
  const owner = await requirePermission(locale, "team:manage");
  const parsed = z
    .object({
      staffId: z.string().cuid(),
      currentActive: z.enum(["true", "false"]),
      intent: z.enum(["save", "toggle"]),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/${locale}/app/partner/team?status=invalid`);
  const affiliateProfileId = await affiliateIdFor(owner.id, owner.role);
  const staff = await prisma.affiliateStaff.findFirstOrThrow({
    where: { id: parsed.data.staffId, affiliateProfileId },
  });
  const active =
    parsed.data.intent === "toggle"
      ? parsed.data.currentActive !== "true"
      : parsed.data.currentActive === "true";
  await prisma.$transaction(async (tx) => {
    await tx.affiliateStaff.update({
      where: { id: staff.id },
      data: { active },
    });
    await tx.user.update({
      where: { id: staff.userId },
      data: { status: active ? "ACTIVE" : "DEACTIVATED" },
    });
    if (!active)
      await tx.session.deleteMany({ where: { userId: staff.userId } });
    for (const key of staffKeys)
      await tx.staffPermission.upsert({
        where: { staffId_key: { staffId: staff.id, key } },
        update: { enabled: formData.get(key) === "on" },
        create: { staffId: staff.id, key, enabled: formData.get(key) === "on" },
      });
    await tx.auditLog.create({
      data: {
        actorId: owner.id,
        action: "UPDATE",
        entityType: "AffiliateStaff",
        entityId: staff.id,
        after: { active },
      },
    });
  });
  revalidatePath(`/${locale}/app/partner/team`);
  redirect(`/${locale}/app/partner/team?status=updated`);
}

export async function createOperationsTeamMemberAction(formData: FormData) {
  const locale = localeFrom(formData);
  const actor = await requireRole(locale, ["SUPER_ADMIN"]);
  const parsed = z
    .object({
      name: z.string().trim().min(2).max(120),
      email: z.string().trim().toLowerCase().email(),
      password: z.string().min(10).max(128),
      role: z.enum([
        "CONFIRMATION_AGENT",
        "CATALOG_MANAGER",
        "FINANCE",
        "SUPPORT",
        "SUPER_ADMIN",
      ]),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/${locale}/admin/team?status=invalid`);
  if (
    await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true },
    })
  )
    redirect(`/${locale}/admin/team?status=duplicate`);

  const member = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash: await hash(parsed.data.password),
      role: parsed.data.role,
      status: "ACTIVE",
      preferredLocale: locale === "ar" ? "AR" : "FR",
    },
  });
  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      action: "CREATE",
      entityType: "OperationsTeamMember",
      entityId: member.id,
      after: { email: member.email, role: member.role },
    },
  });
  revalidatePath(`/${locale}/admin/team`);
  redirect(`/${locale}/admin/team?status=created`);
}

export async function toggleOperationsTeamMemberAction(formData: FormData) {
  const locale = localeFrom(formData);
  const actor = await requireRole(locale, ["SUPER_ADMIN"]);
  const parsed = z
    .object({
      userId: z.string().cuid(),
      currentStatus: z.enum(["ACTIVE", "DEACTIVATED"]),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/${locale}/admin/team?status=invalid`);
  if (parsed.data.userId === actor.id)
    redirect(`/${locale}/admin/team?status=self-change`);
  const member = await prisma.user.findFirstOrThrow({
    where: {
      id: parsed.data.userId,
      role: {
        in: [
          "CONFIRMATION_AGENT",
          "CATALOG_MANAGER",
          "FINANCE",
          "SUPPORT",
          "SUPER_ADMIN",
        ],
      },
    },
  });
  const status =
    parsed.data.currentStatus === "ACTIVE" ? "DEACTIVATED" : "ACTIVE";
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: member.id }, data: { status } });
    if (status === "DEACTIVATED")
      await tx.session.deleteMany({ where: { userId: member.id } });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "UPDATE",
        entityType: "OperationsTeamMember",
        entityId: member.id,
        before: { status: member.status },
        after: { status, role: member.role },
      },
    });
  });
  revalidatePath(`/${locale}/admin/team`);
  redirect(`/${locale}/admin/team?status=updated`);
}

export async function updateOperationsTeamRoleAction(formData: FormData) {
  const locale = localeFrom(formData);
  const actor = await requireRole(locale, ["SUPER_ADMIN"]);
  const parsed = z
    .object({
      userId: z.string().cuid(),
      role: z.enum([
        "CONFIRMATION_AGENT",
        "CATALOG_MANAGER",
        "FINANCE",
        "SUPPORT",
        "SUPER_ADMIN",
      ]),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success || parsed.data.userId === actor.id)
    redirect(`/${locale}/admin/team?status=self-change`);
  const member = await prisma.user.findFirst({
    where: {
      id: parsed.data.userId,
      role: {
        in: [
          "CONFIRMATION_AGENT",
          "CATALOG_MANAGER",
          "FINANCE",
          "SUPPORT",
          "SUPER_ADMIN",
        ],
      },
    },
  });
  if (!member) redirect(`/${locale}/admin/team?status=invalid`);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: member.id },
      data: { role: parsed.data.role },
    });
    await tx.session.deleteMany({ where: { userId: member.id } });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "UPDATE",
        entityType: "OperationsTeamMember",
        entityId: member.id,
        before: { role: member.role },
        after: { role: parsed.data.role },
      },
    });
  });
  revalidatePath(`/${locale}/admin/team`);
  redirect(`/${locale}/admin/team?status=role-updated`);
}
