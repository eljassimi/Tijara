import { z } from "zod";

export type ProductFinancials = {
  productPrice: number;
  serviceFee: number;
  salePrice: number;
  commission: number;
};

export function validateProductFinancials(
  value: ProductFinancials,
  context: z.RefinementCtx,
) {
  if (value.commission >= value.salePrice) {
    context.addIssue({
      code: "custom",
      path: ["commission"],
      message: "Commission must be lower than the sale price",
    });
  }
}

export const createProductSchema = z
  .object({
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
    mediaDriveUrl: z.string().trim().url().optional().or(z.literal("")),
    color: z.string().trim().max(80).optional(),
    sizes: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .superRefine((value, context) => {
        const sizes = parseProductSizes(value);
        if (sizes.length > 20)
          context.addIssue({
            code: "custom",
            message: "A product can have at most 20 sizes",
          });
        if (sizes.some((size) => size.length > 40))
          context.addIssue({
            code: "custom",
            message: "Each size can have at most 40 characters",
          });
      }),
    stock: z.coerce.number().int().nonnegative(),
  })
  .superRefine(validateProductFinancials);

function slugifyProductValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function normalizeProductSlug(value: string, productName = "") {
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return (
        slugifyProductValue(productName) ||
        slugifyProductValue(
          url.pathname.split("/").filter(Boolean).at(-1) ?? url.hostname,
        )
      );
    }
  } catch {
    // A normal product identifier is not expected to be a URL.
  }
  return slugifyProductValue(trimmed || productName);
}

export function parseProductSizes(value: string) {
  const sizes = value
    .split(/[,;\n]+/)
    .map((size) => size.trim())
    .filter(Boolean);
  const uniqueSizes = new Map<string, string>();
  for (const size of sizes) {
    const normalizedSize = size.toLocaleLowerCase();
    if (!uniqueSizes.has(normalizedSize)) uniqueSizes.set(normalizedSize, size);
  }
  return [...uniqueSizes.values()];
}

export type CreateProductInput = z.infer<typeof createProductSchema>;
export const createProductFields = [
  "categoryId",
  "slug",
  "nameFr",
  "nameAr",
  "descriptionFr",
  "descriptionAr",
  "productPrice",
  "serviceFee",
  "salePrice",
  "commission",
  "mediaDriveUrl",
  "color",
  "sizes",
  "stock",
] as const satisfies readonly (keyof CreateProductInput)[];
export type CreateProductField = (typeof createProductFields)[number];
export type CreateProductErrorField = CreateProductField | "images";

export type CreateProductState = {
  status: "idle" | "invalid" | "duplicate" | "failed";
  revision: number;
  message?: string;
  fieldErrors?: Partial<Record<CreateProductErrorField, string[]>>;
  values?: Partial<Record<CreateProductField, string>>;
};

export const initialCreateProductState: CreateProductState = {
  status: "idle",
  revision: 0,
};
