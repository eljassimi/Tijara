"use client";

import { ShoppingBag } from "lucide-react";
import { useActionState } from "react";

import { formatMoney } from "@/lib/money";
import {
  CitySearchInput,
  type CityOption,
} from "@/components/orders/city-search-input";
import type { CheckoutField, CheckoutFormState } from "@/lib/validation/order";
import { checkoutFormAction } from "@/server/cart/actions";

const emptyValues: CheckoutFormState["values"] = {
  customerName: "",
  phone: "",
  city: "",
  address: "",
  notes: "",
};

function FieldError({
  field,
  state,
}: {
  field: CheckoutField;
  state: CheckoutFormState;
}) {
  const error = state.fieldErrors[field]?.[0];
  if (!error) return null;
  return <small className="field-error">{error}</small>;
}

export function CheckoutForm({
  locale,
  cities,
  orderItems,
  itemsTotal,
  commission,
  labels,
}: {
  locale: "fr" | "ar";
  cities: CityOption[];
  orderItems: { itemId: string; quantity: number }[];
  itemsTotal: number;
  commission: number;
  labels: Record<
    | "customerName"
    | "phone"
    | "city"
    | "chooseCity"
    | "cityHelp"
    | "address"
    | "addressHelp"
    | "notes"
    | "total"
    | "commission"
    | "submit"
    | "submitting"
    | "invalid"
    | "duplicate"
    | "empty-cart"
    | "invalid-price"
    | "unknown-city"
    | "unavailable"
    | "failed"
    | "phoneError"
    | "addressError"
    | "selectedProduct"
    | "selectedProducts"
    | "noneSelected",
    string
  >;
}) {
  const initialState: CheckoutFormState = {
    revision: 0,
    fieldErrors: {},
    values: emptyValues,
  };
  const [state, action, pending] = useActionState(
    checkoutFormAction,
    initialState,
  );
  const statusMessage = state.status ? labels[state.status] : undefined;
  const errorFor = (field: CheckoutField) => {
    if (state.fieldErrors[field]?.length) {
      if (field === "phone") return labels.phoneError;
      if (field === "address") return labels.addressError;
      return labels.invalid;
    }
    return undefined;
  };

  return (
    <form action={action} className="workflow-form cart-checkout">
      <input type="hidden" name="locale" value={locale} />
      <input
        type="hidden"
        name="orderItems"
        value={JSON.stringify(orderItems)}
      />
      {statusMessage && (
        <p className="workflow-notice workflow-form__notice" aria-live="polite">
          {statusMessage}
        </p>
      )}
      <div
        className={`checkout-selection workflow-form__span${orderItems.length ? "" : " checkout-selection--empty"}`}
        aria-live="polite"
      >
        <ShoppingBag size={20} />
        {orderItems.length ? (
          <p>
            <strong>{orderItems.length}</strong>{" "}
            {orderItems.length === 1
              ? labels.selectedProduct
              : labels.selectedProducts}
          </p>
        ) : (
          <p>{labels.noneSelected}</p>
        )}
      </div>
      <label className="field">
        <span>{labels.customerName}</span>
        <input
          key={`customerName-${state.revision}`}
          name="customerName"
          defaultValue={state.values.customerName}
          minLength={2}
          aria-invalid={Boolean(state.fieldErrors.customerName)}
          required
        />
        {errorFor("customerName") && (
          <small className="field-error">{errorFor("customerName")}</small>
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
          aria-invalid={Boolean(state.fieldErrors.phone)}
          required
        />
        {errorFor("phone") && (
          <small className="field-error">{errorFor("phone")}</small>
        )}
      </label>
      <label className="field workflow-form__span">
        <span>{labels.city}</span>
        <CitySearchInput
          key={`city-${state.revision}`}
          listId="checkout-cities"
          locale={locale}
          cities={cities}
          defaultValue={state.values.city}
          invalid={Boolean(state.fieldErrors.city)}
          placeholder={labels.chooseCity}
        />
        <small>{labels.cityHelp}</small>
        {(state.status === "unknown-city" || state.fieldErrors.city?.length) && (
          <small className="field-error">
            {state.status === "unknown-city"
              ? labels["unknown-city"]
              : labels.invalid}
          </small>
        )}
      </label>
      <label className="field workflow-form__span">
        <span>{labels.address}</span>
        <input
          key={`address-${state.revision}`}
          name="address"
          autoComplete="street-address"
          defaultValue={state.values.address}
          minLength={5}
          aria-invalid={Boolean(state.fieldErrors.address)}
          required
        />
        <small>{labels.addressHelp}</small>
        {errorFor("address") && (
          <small className="field-error">{errorFor("address")}</small>
        )}
      </label>
      <label className="field workflow-form__span">
        <span>{labels.notes}</span>
        <textarea
          key={`notes-${state.revision}`}
          name="notes"
          defaultValue={state.values.notes}
          rows={3}
          aria-invalid={Boolean(state.fieldErrors.notes)}
        />
        <FieldError field="notes" state={state} />
      </label>
      <div className="checkout-summary workflow-form__span">
        <span className="checkout-summary__total">
          {labels.total}
          <strong>{formatMoney(itemsTotal, locale)}</strong>
        </span>
        <span className="checkout-summary__commission">
          {labels.commission}
          <strong>{formatMoney(commission, locale)}</strong>
        </span>
      </div>
      <button
        className="button button--primary workflow-form__submit"
        type="submit"
        disabled={pending || orderItems.length === 0}
      >
        {pending ? labels.submitting : labels.submit}
      </button>
    </form>
  );
}
