"use client";

import { CircleAlert } from "lucide-react";
import { useActionState } from "react";

import { CustomSelect } from "@/components/ui/custom-select";
import {
  initialCreateProductState,
  type CreateProductErrorField,
} from "@/lib/validation/product";
import { createProductAction } from "@/server/operations/actions";

type CategoryOption = { id: string; nameFr: string; nameAr: string };

type ProductFormLabels = Record<
  | "category"
  | "slug"
  | "slugHelp"
  | "nameFr"
  | "nameAr"
  | "descriptionFr"
  | "descriptionAr"
  | "productPrice"
  | "serviceFee"
  | "salePrice"
  | "commission"
  | "mediaDriveUrl"
  | "images"
  | "imagesHelp"
  | "color"
  | "sizes"
  | "sizesHelp"
  | "stock"
  | "createProduct"
  | "creatingProduct"
  | "invalidField",
  string
>;

function FieldError({
  field,
  errors,
  message,
}: {
  field: CreateProductErrorField;
  errors?: Partial<Record<CreateProductErrorField, string[]>>;
  message: string;
}) {
  if (!errors?.[field]?.length) return null;
  return (
    <small className="field-error" id={`${field}-error`}>
      {message}
    </small>
  );
}

export function CreateProductForm({
  categories,
  labels,
  locale,
}: {
  categories: CategoryOption[];
  labels: ProductFormLabels;
  locale: "fr" | "ar";
}) {
  const [state, formAction, pending] = useActionState(
    createProductAction,
    initialCreateProductState,
  );
  const invalid = (field: CreateProductErrorField) =>
    Boolean(state.fieldErrors?.[field]?.length);
  const errorProps = (field: CreateProductErrorField) => ({
    "aria-invalid": invalid(field) || undefined,
    "aria-describedby": invalid(field) ? `${field}-error` : undefined,
  });

  return (
    <form
      action={formAction}
      className="workflow-form catalog-form"
      key={state.revision}
    >
      <input type="hidden" name="locale" value={locale} />
      {state.message && (
        <p className="workflow-notice workflow-form__notice" role="alert">
          <CircleAlert size={17} />
          {state.message}
        </p>
      )}

      <div className="field">
        <span>{labels.category}</span>
        <CustomSelect
          name="categoryId"
          label={labels.category}
          locale={locale}
          options={categories.map((item) => ({
            value: item.id,
            label: locale === "ar" ? item.nameAr : item.nameFr,
          }))}
          required
          defaultValue={state.values?.categoryId ?? categories[0]?.id}
          invalid={invalid("categoryId")}
        />
        <FieldError
          field="categoryId"
          errors={state.fieldErrors}
          message={labels.invalidField}
        />
      </div>
      <label className="field">
        <span>{labels.slug}</span>
        <input
          name="slug"
          required
          minLength={1}
          defaultValue={state.values?.slug}
          {...errorProps("slug")}
        />
        <small>{labels.slugHelp}</small>
        <FieldError
          field="slug"
          errors={state.fieldErrors}
          message={labels.invalidField}
        />
      </label>
      <label className="field">
        <span>{labels.nameFr}</span>
        <input
          name="nameFr"
          required
          minLength={2}
          maxLength={160}
          defaultValue={state.values?.nameFr}
          {...errorProps("nameFr")}
        />
        <FieldError
          field="nameFr"
          errors={state.fieldErrors}
          message={labels.invalidField}
        />
      </label>
      <label className="field">
        <span>{labels.nameAr}</span>
        <input
          name="nameAr"
          dir="rtl"
          maxLength={160}
          defaultValue={state.values?.nameAr}
          {...errorProps("nameAr")}
        />
        <FieldError
          field="nameAr"
          errors={state.fieldErrors}
          message={labels.invalidField}
        />
      </label>
      <label className="field">
        <span>{labels.descriptionFr}</span>
        <textarea
          name="descriptionFr"
          rows={3}
          required
          minLength={5}
          maxLength={5000}
          defaultValue={state.values?.descriptionFr}
          {...errorProps("descriptionFr")}
        />
        <FieldError
          field="descriptionFr"
          errors={state.fieldErrors}
          message={labels.invalidField}
        />
      </label>
      <label className="field">
        <span>{labels.descriptionAr}</span>
        <textarea
          name="descriptionAr"
          rows={3}
          dir="rtl"
          maxLength={5000}
          defaultValue={state.values?.descriptionAr}
          {...errorProps("descriptionAr")}
        />
        <FieldError
          field="descriptionAr"
          errors={state.fieldErrors}
          message={labels.invalidField}
        />
      </label>
      <label className="field">
        <span>{labels.productPrice}</span>
        <input
          name="productPrice"
          type="number"
          min="0"
          step="0.01"
          required
          defaultValue={state.values?.productPrice}
          {...errorProps("productPrice")}
        />
        <FieldError
          field="productPrice"
          errors={state.fieldErrors}
          message={labels.invalidField}
        />
      </label>
      <label className="field">
        <span>{labels.serviceFee}</span>
        <input
          name="serviceFee"
          type="number"
          min="0"
          step="0.01"
          required
          defaultValue={state.values?.serviceFee}
          {...errorProps("serviceFee")}
        />
        <FieldError
          field="serviceFee"
          errors={state.fieldErrors}
          message={labels.invalidField}
        />
      </label>
      <label className="field">
        <span>{labels.salePrice}</span>
        <input
          name="salePrice"
          type="number"
          min="0.01"
          step="0.01"
          required
          defaultValue={state.values?.salePrice}
          {...errorProps("salePrice")}
        />
        <FieldError
          field="salePrice"
          errors={state.fieldErrors}
          message={labels.invalidField}
        />
      </label>
      <label className="field">
        <span>{labels.commission}</span>
        <input
          name="commission"
          type="number"
          min="0"
          step="0.01"
          required
          defaultValue={state.values?.commission}
          {...errorProps("commission")}
        />
        <FieldError
          field="commission"
          errors={state.fieldErrors}
          message={labels.invalidField}
        />
      </label>
      <label className="field workflow-form__span">
        <span>{labels.images}</span>
        <input
          name="images"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          {...errorProps("images")}
        />
        <small>{labels.imagesHelp}</small>
        <FieldError
          field="images"
          errors={state.fieldErrors}
          message={labels.invalidField}
        />
      </label>
      <label className="field workflow-form__span">
        <span>{labels.mediaDriveUrl}</span>
        <input
          name="mediaDriveUrl"
          type="url"
          defaultValue={state.values?.mediaDriveUrl}
          {...errorProps("mediaDriveUrl")}
        />
        <FieldError
          field="mediaDriveUrl"
          errors={state.fieldErrors}
          message={labels.invalidField}
        />
      </label>
      <label className="field">
        <span>{labels.color}</span>
        <input
          name="color"
          maxLength={80}
          defaultValue={state.values?.color}
          {...errorProps("color")}
        />
        <FieldError
          field="color"
          errors={state.fieldErrors}
          message={labels.invalidField}
        />
      </label>
      <label className="field">
        <span>{labels.sizes}</span>
        <input
          name="sizes"
          required
          maxLength={500}
          defaultValue={state.values?.sizes}
          {...errorProps("sizes")}
        />
        <small>{labels.sizesHelp}</small>
        <FieldError
          field="sizes"
          errors={state.fieldErrors}
          message={labels.invalidField}
        />
      </label>
      <label className="field">
        <span>{labels.stock}</span>
        <input
          name="stock"
          type="number"
          min="0"
          step="1"
          defaultValue={state.values?.stock ?? "0"}
          required
          {...errorProps("stock")}
        />
        <FieldError
          field="stock"
          errors={state.fieldErrors}
          message={labels.invalidField}
        />
      </label>
      <button
        className="button button--primary workflow-form__submit"
        type="submit"
        disabled={pending}
      >
        {pending ? labels.creatingProduct : labels.createProduct}
      </button>
    </form>
  );
}
