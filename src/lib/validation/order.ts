import { z } from "zod";

const moroccanPhone = /^(?:0|\+212)[67]\d{8}$/;
const optionalCuid = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().cuid().optional(),
);

export function normalizeMoroccanPhone(value: string) {
  const compact = value.replace(/[\s().-]/g, "");
  if (compact.startsWith("+212")) return `0${compact.slice(4)}`;
  if (compact.startsWith("212")) return `0${compact.slice(3)}`;
  if (/^[67]\d{8}$/.test(compact)) return `0${compact}`;
  return compact;
}

export const createOrderSchema = z.object({
  customerName: z.string().trim().min(2).max(120),
  phone: z
    .string()
    .trim()
    .transform(normalizeMoroccanPhone)
    .refine((value) => moroccanPhone.test(value)),
  city: z.string().trim().min(2).max(100),
  address: z.string().trim().min(5).max(240),
  notes: z.string().trim().max(1000).optional(),
  variantId: z.string().cuid(),
  quantity: z.coerce.number().int().min(1).max(20),
});

export const confirmationTransitionSchema = z
  .object({
    orderId: z.string().cuid(),
    to: z.enum([
      "CALLING",
      "BUSY",
      "NO_ANSWER",
      "CALL_BACK_LATER",
      "CONFIRMED",
      "CANCELLED",
      "UNREACHABLE",
    ]),
    note: z.string().trim().max(1000).optional(),
    callbackAt: z.preprocess((value) => {
      if (value === "" || value == null) return undefined;
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed))
        return new Date(`${trimmed}:00.000Z`);
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(trimmed))
        return new Date(`${trimmed}.000Z`);
      return trimmed;
    }, z.coerce.date().optional()),
  })
  .transform((input) => ({
    ...input,
    // Auto-schedule call-back for +2h UTC when the agent picks “rappeler plus tard”.
    callbackAt:
      input.callbackAt ??
      (input.to === "CALL_BACK_LATER"
        ? new Date(Date.now() + 2 * 60 * 60 * 1000)
        : undefined),
  }));

export const deliveryTransitionSchema = z.object({
  orderId: z.string().cuid(),
  to: z.enum([
    "AWAITING_PICKUP",
    "IN_TRANSIT",
    "DELIVERED",
    "NOT_DELIVERED",
    "REFUSED",
    "RETURNED",
  ]),
  courierId: optionalCuid,
  parcelCode: z.string().trim().max(80).optional(),
  note: z.string().trim().max(1000).optional(),
});

export const deliveryHandoffSchema = z.object({
  orderId: z.string().cuid(),
  courierId: z.string().cuid(),
  parcelCode: z.string().trim().max(80).optional(),
  note: z.string().trim().max(1000).optional(),
});

export const financeTransitionSchema = z.object({
  orderId: z.string().cuid(),
  to: z.enum(["INVOICED", "PAID"]),
  note: z.string().trim().max(1000).optional(),
});

export const payoutRequestSchema = z.object({
  amount: z.coerce.number().positive().max(1_000_000),
});

export const checkoutSchema = z.object({
  customerName: z.string().trim().min(2).max(120),
  phone: z
    .string()
    .trim()
    .transform(normalizeMoroccanPhone)
    .refine((value) => moroccanPhone.test(value)),
  city: z.string().trim().min(2).max(100),
  address: z.string().trim().min(5).max(240),
  notes: z.string().trim().max(1000).optional(),
  orderItems: z.preprocess(
    (value) => {
      if (typeof value !== "string") return value;
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    },
    z
      .array(
        z.object({
          itemId: z.string().cuid(),
          quantity: z.number().int().min(1).max(20),
        }),
      )
      .min(1)
      .max(50)
      .superRefine((items, context) => {
        const ids = new Set<string>();
        for (const item of items) {
          if (ids.has(item.itemId)) {
            context.addIssue({
              code: "custom",
              message: "Duplicate cart item",
            });
            return;
          }
          ids.add(item.itemId);
        }
      }),
  ),
});

export const checkoutFields = [
  "customerName",
  "phone",
  "city",
  "address",
  "notes",
] as const;
export type CheckoutValueField = (typeof checkoutFields)[number];
export type CheckoutField = CheckoutValueField | "orderItems";
export type CheckoutFormState = {
  revision: number;
  status?:
    | "invalid"
    | "duplicate"
    | "empty-cart"
    | "invalid-price"
    | "unknown-city"
    | "unavailable"
    | "failed";
  fieldErrors: Partial<Record<CheckoutField, string[]>>;
  values: Record<CheckoutValueField, string>;
};

export const createOrderFields = [
  ...checkoutFields,
  "variantId",
  "quantity",
] as const;
export type CreateOrderField = (typeof createOrderFields)[number];
export type CreateOrderFormState = {
  revision: number;
  status?:
    | "invalid"
    | "duplicate"
    | "empty-cart"
    | "invalid-price"
    | "unknown-city"
    | "unavailable"
    | "failed";
  fieldErrors: Partial<Record<CreateOrderField, string[]>>;
  values: Record<CreateOrderField, string>;
};
