"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";

import {
  checkoutFields,
  checkoutSchema,
  type CheckoutFormState,
} from "@/lib/validation/order";
import { requirePermission } from "@/server/auth/session";
import { orderCreationStatus } from "@/server/orders/errors";
import { affiliateIdFor, createCartOrder } from "@/server/orders/service";
import { prisma } from "@/lib/prisma";

function localeFrom(formData: FormData) {
  return formData.get("locale") === "ar" ? "ar" : "fr";
}

export async function addToCartAction(formData: FormData) {
  const locale = localeFrom(formData);
  const user = await requirePermission(locale, "orders:create");
  const returnSlug = String(formData.get("returnSlug") ?? "").trim();
  const parsed = z
    .object({
      variantId: z.string().cuid(),
      quantity: z.coerce.number().int().min(1).max(20),
      returnSlug: z.string().trim().min(1),
      customSalePrice: z.preprocess(
        (value) => (value === "" ? undefined : value),
        z.coerce.number().positive().optional(),
      ),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    redirect(
      returnSlug
        ? `/${locale}/app/partner/products/${returnSlug}?status=invalid`
        : `/${locale}/app/partner/products?status=invalid`,
    );
  const affiliateProfileId = await affiliateIdFor(user.id, user.role);
  const variant = await prisma.productVariant.findUniqueOrThrow({
    where: { id: parsed.data.variantId },
    include: { product: true },
  });
  if (
    !variant.active ||
    !variant.product.published ||
    variant.stock < parsed.data.quantity
  )
    redirect(
      `/${locale}/app/partner/products/${parsed.data.returnSlug}?status=unavailable`,
    );
  if (
    parsed.data.customSalePrice !== undefined &&
    (!variant.product.allowCustomSalePrice ||
      (variant.product.minSalePrice &&
        new Prisma.Decimal(parsed.data.customSalePrice).lt(
          variant.product.minSalePrice,
        )))
  )
    redirect(
      `/${locale}/app/partner/products/${parsed.data.returnSlug}?status=invalid-price`,
    );
  try {
    await prisma.$transaction(
      async (tx) => {
        const cart = await tx.cart.upsert({
          where: {
            affiliateProfileId_createdById: {
              affiliateProfileId,
              createdById: user.id,
            },
          },
          update: {},
          create: { affiliateProfileId, createdById: user.id },
        });
        const existing = await tx.cartItem.findUnique({
          where: {
            cartId_variantId: { cartId: cart.id, variantId: variant.id },
          },
          select: { quantity: true },
        });
        const quantity = (existing?.quantity ?? 0) + parsed.data.quantity;
        if (quantity > Math.min(20, variant.stock))
          throw new Error("CART_STOCK_LIMIT");
        await tx.cartItem.upsert({
          where: {
            cartId_variantId: { cartId: cart.id, variantId: variant.id },
          },
          update: { quantity, customSalePrice: parsed.data.customSalePrice },
          create: {
            cartId: cart.id,
            productId: variant.productId,
            variantId: variant.id,
            quantity,
            customSalePrice: parsed.data.customSalePrice,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    redirect(
      `/${locale}/app/partner/products/${parsed.data.returnSlug}?status=${error instanceof Error && error.message === "CART_STOCK_LIMIT" ? "cap-20" : "unavailable"}`,
    );
  }
  revalidatePath(`/${locale}/app/partner`, "layout");
  redirect(
    `/${locale}/app/partner/products/${parsed.data.returnSlug}?status=added`,
  );
}

export async function updateCartItemAction(formData: FormData) {
  const locale = localeFrom(formData);
  const user = await requirePermission(locale, "orders:create");
  const parsed = z
    .object({
      itemId: z.string().cuid(),
      quantity: z.coerce.number().int().min(1).max(20),
      customSalePrice: z.preprocess(
        (value) => (value === "" ? undefined : value),
        z.coerce.number().positive().optional(),
      ),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/${locale}/app/partner/cart?status=invalid`);
  const affiliateProfileId = await affiliateIdFor(user.id, user.role);
  const item = await prisma.cartItem.findFirstOrThrow({
    where: {
      id: parsed.data.itemId,
      cart: { affiliateProfileId, createdById: user.id },
    },
    include: { product: true, variant: true },
  });
  const invalidCustomPrice =
    parsed.data.customSalePrice !== undefined &&
    (!item.product.allowCustomSalePrice ||
      Boolean(
        item.product.minSalePrice &&
        new Prisma.Decimal(parsed.data.customSalePrice).lt(
          item.product.minSalePrice,
        ),
      ));
  if (parsed.data.quantity > item.variant.stock || invalidCustomPrice)
    redirect(`/${locale}/app/partner/cart?status=invalid`);
  await prisma.cartItem.update({
    where: { id: item.id },
    data: {
      quantity: parsed.data.quantity,
      customSalePrice: parsed.data.customSalePrice,
    },
  });
  revalidatePath(`/${locale}/app/partner`, "layout");
  redirect(`/${locale}/app/partner/cart?status=updated`);
}

export async function removeCartItemAction(formData: FormData) {
  const locale = localeFrom(formData);
  const user = await requirePermission(locale, "orders:create");
  const parsed = z
    .object({ itemId: z.string().cuid() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/${locale}/app/partner/cart?status=invalid`);
  const affiliateProfileId = await affiliateIdFor(user.id, user.role);
  await prisma.cartItem.deleteMany({
    where: {
      id: parsed.data.itemId,
      cart: { affiliateProfileId, createdById: user.id },
    },
  });
  revalidatePath(`/${locale}/app/partner`, "layout");
  redirect(`/${locale}/app/partner/cart?status=updated`);
}

export async function checkoutFormAction(
  previousState: CheckoutFormState,
  formData: FormData,
): Promise<CheckoutFormState> {
  const locale = localeFrom(formData);
  const user = await requirePermission(locale, "orders:create");
  const values = Object.fromEntries(
    checkoutFields.map((field) => [field, String(formData.get(field) ?? "")]),
  ) as CheckoutFormState["values"];
  const parsed = checkoutSchema.safeParse(Object.fromEntries(formData));
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
      await createCartOrder({ id: user.id, role: user.role }, parsed.data)
    ).id;
  } catch (error) {
    return {
      revision: previousState.revision + 1,
      status: orderCreationStatus(error),
      fieldErrors: {},
      values,
    };
  }
  revalidatePath(`/${locale}/app/partner`, "layout");
  redirect(`/${locale}/app/partner/orders/${orderId}?created=1`);
}
