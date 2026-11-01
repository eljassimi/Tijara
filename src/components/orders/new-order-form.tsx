"use client";

import { useActionState, useDeferredValue, useMemo, useState } from "react";

import { formatMoney } from "@/lib/money";
import {
  CitySearchInput,
  type CityOption,
} from "@/components/orders/city-search-input";
import { CustomSelect } from "@/components/ui/custom-select";
import type {
  CreateOrderField,
  CreateOrderFormState,
} from "@/lib/validation/order";
import { createOrderFormAction } from "@/server/orders/actions";

type ProductOption = {
  id: string;
  label: string;
  searchText: string;
  salePrice: number;
  commission: number;
};

const sizeSearchTerms = new Set([
  "xs",
  "s",
  "m",
  "l",
  "xl",
  "2xl",
  "3xl",
  "4xl",
  "5xl",
]);

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const emptyValues: CreateOrderFormState["values"] = {
  customerName: "",
  phone: "",
  city: "",
  address: "",
  notes: "",
  variantId: "",
  quantity: "1",
};

export function NewOrderForm({
  locale,
  cities,
  products,
  labels,
  initialVariant = "",
}: {
  locale: "fr" | "ar";
  cities: CityOption[];
  products: ProductOption[];
  labels: Record<string, string>;
  initialVariant?: string;
}) {
  const initialValues = { ...emptyValues, variantId: initialVariant };
  const [state, action, pending] = useActionState(createOrderFormAction, {
    revision: 0,
    fieldErrors: {},
    values: initialValues,
  });
  const [variantId, setVariantId] = useState(initialVariant);
  const [quantity, setQuantity] = useState(1);
  const [productQuery, setProductQuery] = useState("");
  const deferredProductQuery = useDeferredValue(productQuery);
  const product = products.find((item) => item.id === variantId);
  const visibleProducts = useMemo(() => {
    const query = normalizeSearch(deferredProductQuery.trim());
    if (!query) return products;
    const queryTerms = query.split(/\s+/);
    const matches = products.filter((item) => {
      const searchText = normalizeSearch(item.searchText);
      const searchTerms = searchText.split(/\s+/);
      return queryTerms.every((term) =>
        sizeSearchTerms.has(term)
          ? searchTerms.includes(term)
          : searchTerms.some((candidate) => candidate.includes(term)),
      );
    });
    const selected = products.find((item) => item.id === variantId);
    return selected && !matches.some((item) => item.id === selected.id)
      ? [selected, ...matches]
      : matches;
  }, [deferredProductQuery, products, variantId]);
  const message = state.status ? labels[state.status] : undefined;
  const error = (field: CreateOrderField) =>
    state.fieldErrors[field]?.length
      ? field === "phone"
        ? labels.phoneError
        : field === "address"
          ? labels.addressError
          : labels.invalid
      : undefined;
  return (
    <form action={action} className="workflow-form workflow-form--wide">
      <input type="hidden" name="locale" value={locale} />
      {message && (
        <p className="workflow-notice workflow-form__notice" aria-live="polite">
          {message}
        </p>
      )}
      <label className="field">
        <span>{labels.customerName}</span>
        <input
          key={`customerName-${state.revision}`}
          name="customerName"
          defaultValue={state.values.customerName}
          minLength={2}
          aria-invalid={Boolean(error("customerName"))}
          required
        />
        {error("customerName") && (
          <small className="field-error">{error("customerName")}</small>
        )}
      </label>
      <label className="field">
        <span>{labels.phone}</span>
        <input
          key={`phone-${state.revision}`}
          name="phone"
          type="tel"
          inputMode="tel"
          defaultValue={state.values.phone}
          placeholder="06XXXXXXXX"
          aria-invalid={Boolean(error("phone"))}
          required
        />
        {error("phone") && (
          <small className="field-error">{error("phone")}</small>
        )}
      </label>
      <label className="field">
        <span>{labels.city}</span>
        <CitySearchInput
          key={`city-${state.revision}`}
          listId="new-order-cities"
          cities={cities}
          defaultValue={state.values.city}
          placeholder={labels.chooseCity}
          invalid={Boolean(error("city"))}
        />
        {error("city") && (
          <small className="field-error">{error("city")}</small>
        )}
      </label>
      <div className="field">
        <span>{labels.product}</span>
        <input
          type="search"
          value={productQuery}
          onChange={(event) => setProductQuery(event.target.value)}
          placeholder={labels.searchProduct}
          aria-label={labels.searchProduct}
          aria-controls="new-order-product-select"
          spellCheck={false}
        />
        <CustomSelect
          key={`variantId-${state.revision}`}
          id="new-order-product-select"
          name="variantId"
          label={labels.product}
          locale={locale}
          options={visibleProducts.map((item) => ({
            value: item.id,
            label: `${item.label} · ${formatMoney(item.salePrice, locale)}`,
          }))}
          placeholder={labels.chooseProduct}
          emptyMessage={labels.noProductsFound}
          defaultValue={state.values.variantId}
          onValueChange={setVariantId}
          invalid={Boolean(error("variantId"))}
          required
        />
        {error("variantId") && (
          <small className="field-error">{error("variantId")}</small>
        )}
      </div>
      <label className="field">
        <span>{labels.quantity}</span>
        <input
          key={`quantity-${state.revision}`}
          name="quantity"
          type="number"
          min="1"
          max="20"
          defaultValue={state.values.quantity || "1"}
          onChange={(event) =>
            setQuantity(Math.max(1, Number(event.target.value) || 1))
          }
          aria-invalid={Boolean(error("quantity"))}
          required
        />
        {error("quantity") && (
          <small className="field-error">{error("quantity")}</small>
        )}
      </label>
      <label className="field workflow-form__span">
        <span>{labels.address}</span>
        <input
          key={`address-${state.revision}`}
          name="address"
          defaultValue={state.values.address}
          minLength={5}
          aria-invalid={Boolean(error("address"))}
          required
        />
        <small>{labels.addressHelp}</small>
        {error("address") && (
          <small className="field-error">{error("address")}</small>
        )}
      </label>
      <label className="field workflow-form__span">
        <span>{labels.notes}</span>
        <textarea
          key={`notes-${state.revision}`}
          name="notes"
          defaultValue={state.values.notes}
          rows={4}
        />
      </label>
      <div className="checkout-summary workflow-form__span">
        <span>
          {labels.total}
          <strong>
            {product ? formatMoney(product.salePrice * quantity, locale) : "—"}
          </strong>
        </span>
        <span className="checkout-summary__commission">
          {labels.commission}
          <strong>
            {product ? formatMoney(product.commission * quantity, locale) : "—"}
          </strong>
        </span>
      </div>
      <button
        className="button button--primary workflow-form__submit"
        type="submit"
        disabled={pending}
      >
        {pending ? labels.submitting : labels.submit}
      </button>
    </form>
  );
}
