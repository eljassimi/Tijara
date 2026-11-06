"use server";

import type {
  ConfirmationStatus,
  DeliveryStatus,
  FinanceStatus,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  confirmationTransitionSchema,
  createOrderFields,
  createOrderSchema,
  deliveryHandoffSchema,
  type CreateOrderFormState,
  deliveryTransitionSchema,
  financeTransitionSchema,
} from "@/lib/validation/order";
import { requirePermission, requireRole } from "@/server/auth/session";
import { orderCreationStatus } from "./errors";
import { handoffStatusFromError } from "./handoff-errors";
import { parseGoogleSheetUrl } from "./import-format";
import { runOrderImport } from "./import-service";
import {
  affiliateIdFor,
  assignConfirmationAgent,
  changeConfirmationStatus,
  changeDeliveryStatus,
  changeFinanceStatus,
  createAffiliateOrder,
  distributeUnassignedConfirmationOrders,
  markOrderSentToDeliveryCompany,
} from "./service";

function localeFrom(formData: FormData) {
  return formData.get("locale") === "ar" ? "ar" : "fr";
}

export async function createOrderFormAction(
  previousState: CreateOrderFormState,
  formData: FormData,
): Promise<CreateOrderFormState> {
  const locale = localeFrom(formData);
  const user = await requirePermission(locale, "orders:create");
  const values = Object.fromEntries(
    createOrderFields.map((field) => [
      field,
      String(formData.get(field) ?? ""),
    ]),
  ) as CreateOrderFormState["values"];
  const parsed = createOrderSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      revision: previousState.revision + 1,
      status: "invalid",
      fieldErrors: parsed.error.flatten().fieldErrors,
      values,
    };
  }
  let orderId: string;
  try {
    orderId = (
      await createAffiliateOrder({ id: user.id, role: user.role }, parsed.data)
    ).id;
  } catch (error) {
    return {
      revision: previousState.revision + 1,
      status: orderCreationStatus(error),
      fieldErrors: {},
      values,
    };
  }
  revalidatePath(`/${locale}/app/partner`);
  redirect(`/${locale}/app/partner/orders/${orderId}?created=1`);
}

export async function importOrdersAction(formData: FormData) {
  const locale = localeFrom(formData);
  const user = await requirePermission(locale, "orders:create");
  const file = formData.get("file");
  if (
    !(file instanceof File) ||
    file.size <= 0 ||
    file.size > 5 * 1024 * 1024 ||
    !file.name.toLowerCase().endsWith(".xlsx")
  )
    redirect(`/${locale}/app/partner/orders/import?status=invalid-import`);
  const result = await runOrderImport({
    actor: { id: user.id, role: user.role },
    locale,
    buffer: Buffer.from(await file.arrayBuffer()),
    format: "xlsx",
    sourceObjectKey: `excel:${file.name.slice(0, 180)}`,
    importSource: "excel",
    useFallbackReference: false,
  });
  revalidatePath(`/${locale}/app/partner/orders`);
  const status = result.failed
    ? "import-failed"
    : result.errors.length
      ? "import-partial"
      : "imported";
  redirect(
    `/${locale}/app/partner/orders/import?status=${status}&job=${result.jobId}&orders=${result.orders}&lines=${result.imported}`,
  );
}

export async function syncGoogleSheetOrdersAction(formData: FormData) {
  const locale = localeFrom(formData);
  const user = await requirePermission(locale, "orders:create");
  let sheet: ReturnType<typeof parseGoogleSheetUrl>;
  try {
    sheet = parseGoogleSheetUrl(String(formData.get("sheetUrl") ?? ""));
  } catch {
    redirect(`/${locale}/app/partner/orders/import?status=invalid-sheet-url`);
  }
  const { prisma } = await import("@/lib/prisma");
  const affiliateId = await affiliateIdFor(user.id, user.role);
  await prisma.affiliateProfile.update({
    where: { id: affiliateId },
    data: { orderSheetUrl: sheet.canonicalUrl },
  });

  let buffer: Buffer;
  try {
    const response = await fetch(sheet.exportUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok)
      throw new Error(`Google Sheets returned ${response.status}`);
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > 10 * 1024 * 1024) throw new Error("Sheet is too large");
    buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > 10 * 1024 * 1024)
      throw new Error("Sheet is empty or too large");
  } catch {
    redirect(`/${locale}/app/partner/orders/import?status=sheet-unavailable`);
  }
  const result = await runOrderImport({
    actor: { id: user.id, role: user.role },
    locale,
    buffer,
    format: sheet.format,
    sourceObjectKey: `google-sheet:${sheet.spreadsheetId}:${sheet.gid ?? "auto"}`,
    importSource: `google-sheet:${sheet.spreadsheetId}:${sheet.gid ?? "auto"}`,
    useFallbackReference: true,
  });
  if (!result.failed)
    await prisma.affiliateProfile.update({
      where: { id: affiliateId },
      data: { orderSheetLastSyncedAt: new Date() },
    });
  revalidatePath(`/${locale}/app/partner/orders`);
  revalidatePath(`/${locale}/app/partner`);
  const status =
    result.failed && result.total > 0
      ? "sheet-needs-catalog"
      : result.failed
        ? "sheet-failed"
        : result.errors.length
          ? "sheet-partial"
          : "sheet-synced";
  redirect(
    `/${locale}/app/partner/orders/import?status=${status}&job=${result.jobId}&orders=${result.orders}&lines=${result.imported}`,
  );
}

export async function confirmationTransitionAction(formData: FormData) {
  const locale = localeFrom(formData);
  const user = await requirePermission(locale, "orders:confirm");
  const parsed = confirmationTransitionSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!parsed.success) {
    redirect(`/${locale}/admin/confirmation?status=invalid`);
  }
  try {
    await changeConfirmationStatus(
      { id: user.id, role: user.role },
      parsed.data.orderId,
      parsed.data.to as ConfirmationStatus,
      { note: parsed.data.note, callbackAt: parsed.data.callbackAt },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("assigned to another"))
      redirect(`/${locale}/admin/confirmation?status=not-assigned`);
    redirect(`/${locale}/admin/confirmation?status=invalid-transition`);
  }
  revalidatePath(`/${locale}/admin/confirmation`);
  revalidatePath(`/${locale}/admin/logistics`);
  revalidatePath(`/${locale}/admin/orders`);
  redirect(
    `/${locale}/admin/confirmation?status=${
      parsed.data.to === "CONFIRMED" ? "confirmed-sent" : "updated"
    }`,
  );
}

export async function assignConfirmationAgentAction(formData: FormData) {
  const locale = localeFrom(formData);
  const user = await requireRole(locale, ["SUPER_ADMIN"]);
  const orderId = String(formData.get("orderId") ?? "").trim();
  const agentIdRaw = String(formData.get("agentId") ?? "").trim();
  const agentId = agentIdRaw.length ? agentIdRaw : null;
  if (!orderId || orderId.length > 64)
    redirect(`/${locale}/admin/confirmation?status=invalid`);
  if (agentId && agentId.length > 64)
    redirect(`/${locale}/admin/confirmation?status=invalid`);
  try {
    await assignConfirmationAgent(
      { id: user.id, role: user.role },
      orderId,
      agentId,
    );
  } catch {
    redirect(`/${locale}/admin/confirmation?status=assign-failed`);
  }
  revalidatePath(`/${locale}/admin/confirmation`);
  revalidatePath(`/${locale}/admin/orders`);
  revalidatePath(`/${locale}/admin/logistics`);
  redirect(`/${locale}/admin/confirmation?status=assigned`);
}

export async function distributeUnassignedConfirmationOrdersAction(
  formData: FormData,
) {
  const locale = localeFrom(formData);
  const user = await requireRole(locale, ["SUPER_ADMIN"]);
  try {
    await distributeUnassignedConfirmationOrders({
      id: user.id,
      role: user.role,
    });
  } catch {
    redirect(`/${locale}/admin/confirmation?status=assign-failed`);
  }
  revalidatePath(`/${locale}/admin/confirmation`);
  revalidatePath(`/${locale}/admin/orders`);
  revalidatePath(`/${locale}/admin/logistics`);
  redirect(`/${locale}/admin/confirmation?status=distributed`);
}

export async function deliveryTransitionAction(formData: FormData) {
  const locale = localeFrom(formData);
  const user = await requirePermission(locale, "orders:deliver");
  const parsed = deliveryTransitionSchema.safeParse(
    Object.fromEntries(formData),
  );
  const orderId = String(formData.get("orderId") ?? "");
  const focus = orderId ? `#order-${orderId}` : "";
  if (!parsed.success)
    redirect(`/${locale}/admin/logistics?status=invalid${focus}`);
  try {
    await changeDeliveryStatus(
      { id: user.id, role: user.role },
      parsed.data.orderId,
      parsed.data.to as DeliveryStatus,
      parsed.data,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("assigned to another"))
      redirect(`/${locale}/admin/logistics?status=not-assigned${focus}`);
    redirect(
      `/${locale}/admin/logistics?status=invalid-transition${focus}`,
    );
  }
  // Soft refresh only — avoid redirect so the viewport stays on the card.
  revalidatePath(`/${locale}/admin/logistics`);
  revalidatePath(`/${locale}/admin/orders`);
  revalidatePath(`/${locale}/admin`);
}

export async function adminOrderDeliveryAction(formData: FormData) {
  const locale = localeFrom(formData);
  const user = await requirePermission(locale, "orders:deliver");
  const parsed = deliveryTransitionSchema.safeParse(
    Object.fromEntries(formData),
  );
  const orderId = String(formData.get("orderId") ?? "");
  if (!parsed.success)
    redirect(`/${locale}/admin/orders/${orderId}?status=invalid`);
  if (
    ["RETURNED", "REFUSED"].includes(parsed.data.to) &&
    !parsed.data.note?.trim()
  )
    redirect(`/${locale}/admin/orders/${orderId}?status=reason-required`);
  try {
    await changeDeliveryStatus(
      { id: user.id, role: user.role },
      parsed.data.orderId,
      parsed.data.to as DeliveryStatus,
      parsed.data,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("assigned to another"))
      redirect(
        `/${locale}/admin/orders/${parsed.data.orderId}?status=not-assigned`,
      );
    redirect(
      `/${locale}/admin/orders/${parsed.data.orderId}?status=invalid-transition`,
    );
  }
  revalidatePath(`/${locale}/admin/orders`);
  revalidatePath(`/${locale}/admin/orders/${parsed.data.orderId}`);
  revalidatePath(`/${locale}/admin`);
  revalidatePath(`/${locale}/admin/finance`);
  revalidatePath(`/${locale}/app/partner`);
  revalidatePath(`/${locale}/app/partner/wallet`);
  redirect(
    `/${locale}/admin/orders/${parsed.data.orderId}?status=delivery-updated`,
  );
}

export async function deliveryHandoffAction(formData: FormData) {
  const locale = localeFrom(formData);
  const user = await requirePermission(locale, "orders:deliver");
  const parsed = deliveryHandoffSchema.safeParse(Object.fromEntries(formData));
  const orderId = String(formData.get("orderId") ?? "");
  const focus = orderId ? `#order-${orderId}` : "";
  if (!parsed.success) {
    const courierId = String(formData.get("courierId") ?? "").trim();
    if (!courierId)
      redirect(
        `/${locale}/admin/logistics?status=handoff-company-required${focus}`,
      );
    redirect(`/${locale}/admin/logistics?status=invalid${focus}`);
  }
  try {
    await markOrderSentToDeliveryCompany(
      { id: user.id, role: user.role },
      parsed.data.orderId,
      parsed.data,
    );
  } catch (error) {
    const result = handoffStatusFromError(error);
    const params = new URLSearchParams({ status: result.status });
    if (result.ref) params.set("ref", result.ref);
    redirect(
      `/${locale}/admin/logistics?${params.toString()}#order-${parsed.data.orderId}`,
    );
  }
  // Soft refresh only — keep the agent on the same scroll position.
  revalidatePath(`/${locale}/admin/logistics`);
  revalidatePath(`/${locale}/admin/orders`);
  revalidatePath(`/${locale}/admin`);
}

export async function bulkDeliveryHandoffAction(formData: FormData) {
  const locale = localeFrom(formData);
  const user = await requirePermission(locale, "orders:deliver");
  const courierId = String(formData.get("courierId") ?? "").trim();
  const orderIds = formData
    .getAll("orderIds")
    .map((value) => String(value).trim())
    .filter(Boolean);
  if (!courierId)
    redirect(`/${locale}/admin/logistics?status=handoff-company-required`);
  if (!orderIds.length)
    redirect(`/${locale}/admin/logistics?status=bulk-empty`);

  const { bulkSendOrdersViaOzon, isOzonCourier } = await import(
    "@/server/delivery/ozon-express/service"
  );
  const { prisma } = await import("@/lib/prisma");
  const courier = await prisma.courier.findFirst({
    where: { id: courierId, active: true },
  });
  if (!courier) redirect(`/${locale}/admin/logistics?status=handoff-company-inactive`);

  if (isOzonCourier(courier)) {
    const results = await bulkSendOrdersViaOzon(
      { id: user.id, role: user.role },
      orderIds,
      courierId,
    );
    const ok = results.filter((item) => item.ok).length;
    const failed = results.length - ok;
    revalidatePath(`/${locale}/admin/logistics`);
    redirect(
      `/${locale}/admin/logistics?status=bulk-done&ok=${ok}&failed=${failed}`,
    );
  }

  let ok = 0;
  let failed = 0;
  for (const orderId of orderIds) {
    try {
      await markOrderSentToDeliveryCompany(
        { id: user.id, role: user.role },
        orderId,
        { courierId },
      );
      ok += 1;
    } catch {
      failed += 1;
    }
  }
  revalidatePath(`/${locale}/admin/logistics`);
  redirect(
    `/${locale}/admin/logistics?status=bulk-done&ok=${ok}&failed=${failed}`,
  );
}

export async function createDeliveryNoteAction(formData: FormData) {
  const locale = localeFrom(formData);
  const user = await requirePermission(locale, "orders:deliver");
  const courierId = String(formData.get("courierId") ?? "").trim();
  const orderIds = formData
    .getAll("orderIds")
    .map((value) => String(value).trim())
    .filter(Boolean);
  if (!courierId || !orderIds.length)
    redirect(`/${locale}/admin/logistics?status=bl-invalid`);
  let result: Awaited<
    ReturnType<
      typeof import("@/server/delivery/ozon-express/service").createDeliveryNoteForOrders
    >
  >;
  try {
    const { createDeliveryNoteForOrders } = await import(
      "@/server/delivery/ozon-express/service"
    );
    result = await createDeliveryNoteForOrders(
      { id: user.id, role: user.role },
      courierId,
      orderIds,
      { save: formData.get("save") !== "0" },
    );
  } catch (error) {
    const mapped = handoffStatusFromError(error);
    redirect(`/${locale}/admin/logistics?status=${mapped.status}`);
  }
  revalidatePath(`/${locale}/admin/logistics`);
  redirect(
    `/${locale}/admin/logistics?status=bl-created&ref=${encodeURIComponent(result.note.externalRef)}&pdf=${encodeURIComponent(result.pdf.standard)}`,
  );
}

export async function syncOzonTrackingAction(formData: FormData) {
  const locale = localeFrom(formData);
  await requirePermission(locale, "orders:deliver");
  const { syncOzonTrackingForOpenOrders } = await import(
    "@/server/delivery/ozon-express/service"
  );
  const result = await syncOzonTrackingForOpenOrders();
  revalidatePath(`/${locale}/admin/logistics`);
  redirect(
    `/${locale}/admin/logistics?status=tracking-synced&checked=${result.checked}&updated=${result.updated}`,
  );
}

export async function financeTransitionAction(formData: FormData) {
  const locale = localeFrom(formData);
  const user = await requirePermission(locale, "finance:manage");
  const parsed = financeTransitionSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!parsed.success) redirect(`/${locale}/admin/finance?status=invalid`);
  try {
    await changeFinanceStatus(
      { id: user.id, role: user.role },
      parsed.data.orderId,
      parsed.data.to as FinanceStatus,
      parsed.data.note,
    );
  } catch {
    redirect(`/${locale}/admin/finance?status=invalid-transition`);
  }
  revalidatePath(`/${locale}/admin/finance`);
  revalidatePath(`/${locale}/app/partner/wallet`);
  redirect(`/${locale}/admin/finance?status=updated`);
}
