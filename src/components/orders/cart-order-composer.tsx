"use client";

import { Check, Minus, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { CheckoutForm } from "@/components/orders/checkout-form";
import type { CityOption } from "@/components/orders/city-search-input";
import { formatMoney } from "@/lib/money";
import { removeCartItemAction } from "@/server/cart/actions";

export type CartOrderItem = {
  id: string;
  name: string;
  sku: string;
  availableQuantity: number;
  unitSale: number;
  unitCommission: number;
};

type ComposerLabels = {
  cart: string;
  instructions: string;
  selectAll: string;
  clearSelection: string;
  selectedProduct: string;
  selectedProducts: string;
  noneSelected: string;
  forCustomer: string;
  availableInCart: string;
  availableInCartPlural: string;
  unitPrice: string;
  decreaseQuantity: string;
  increaseQuantity: string;
  remove: string;
  totalSale: string;
  totalCommission: string;
};

type CheckoutLabels = Parameters<typeof CheckoutForm>[0]["labels"];

export function CartOrderComposer({
  locale,
  items,
  cities,
  labels,
  checkoutLabels,
}: {
  locale: "fr" | "ar";
  items: CartOrderItem[];
  cities: CityOption[];
  labels: ComposerLabels;
  checkoutLabels: CheckoutLabels;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(items.map((item) => [item.id, 1])),
  );
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const orderItems = selectedIds.map((itemId) => ({
    itemId,
    quantity: quantities[itemId] ?? 1,
  }));
  const selectedTotals = useMemo(() => {
    let sale = 0;
    let commission = 0;
    for (const item of items) {
      if (!selectedSet.has(item.id)) continue;
      const quantity = quantities[item.id] ?? 1;
      sale += item.unitSale * quantity;
      commission += item.unitCommission * quantity;
    }
    return { sale, commission };
  }, [items, quantities, selectedSet]);

  const setQuantity = (item: CartOrderItem, nextQuantity: number) => {
    const quantity = Math.min(
      item.availableQuantity,
      Math.max(1, Math.round(nextQuantity || 1)),
    );
    setQuantities((current) => ({ ...current, [item.id]: quantity }));
  };

  const toggleItem = (itemId: string) => {
    setSelectedIds((current) =>
      current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId],
    );
  };

  return (
    <div className="cart-layout">
      <section className="detail-card cart-composer">
        <div className="cart-composer__header">
          <div>
            <h2>{labels.cart}</h2>
            <p>{labels.instructions}</p>
          </div>
          <span className="cart-composer__count">
            <strong>{selectedIds.length}</strong>
            {selectedIds.length === 1
              ? labels.selectedProduct
              : labels.selectedProducts}
          </span>
        </div>
        {items.length > 1 ? (
          <div className="cart-composer__bulk-actions">
            <button
              type="button"
              onClick={() => setSelectedIds(items.map((item) => item.id))}
              disabled={selectedIds.length === items.length}
            >
              <Check size={15} />
              {labels.selectAll}
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              disabled={!selectedIds.length}
            >
              {labels.clearSelection}
            </button>
          </div>
        ) : null}
        <div className="cart-composer__items">
          {items.map((item) => {
            const selected = selectedSet.has(item.id);
            const quantity = quantities[item.id] ?? 1;
            return (
              <article
                className={`cart-order-item${selected ? " cart-order-item--selected" : ""}`}
                key={item.id}
              >
                <label className="cart-order-item__selector">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleItem(item.id)}
                  />
                  <span className="cart-order-item__check" aria-hidden="true">
                    <Check size={15} />
                  </span>
                  <span className="cart-order-item__identity">
                    <strong>{item.name}</strong>
                    <small>{item.sku}</small>
                  </span>
                </label>

                <div className="cart-order-item__price">
                  <small>{labels.unitPrice}</small>
                  <strong>{formatMoney(item.unitSale, locale)}</strong>
                </div>

                <div className="cart-order-item__quantity">
                  <span>{labels.forCustomer}</span>
                  <div className="quantity-stepper">
                    <button
                      type="button"
                      onClick={() => setQuantity(item, quantity - 1)}
                      disabled={!selected || quantity <= 1}
                      aria-label={labels.decreaseQuantity}
                    >
                      <Minus size={15} />
                    </button>
                    <input
                      type="number"
                      min="1"
                      max={item.availableQuantity}
                      value={quantity}
                      onChange={(event) =>
                        setQuantity(item, Number(event.target.value))
                      }
                      disabled={!selected}
                      aria-label={`${labels.forCustomer}: ${item.name}`}
                    />
                    <button
                      type="button"
                      onClick={() => setQuantity(item, quantity + 1)}
                      disabled={!selected || quantity >= item.availableQuantity}
                      aria-label={labels.increaseQuantity}
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                  <small>
                    {item.availableQuantity}{" "}
                    {item.availableQuantity === 1
                      ? labels.availableInCart
                      : labels.availableInCartPlural}
                  </small>
                </div>

                <form action={removeCartItemAction}>
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="itemId" value={item.id} />
                  <button
                    className="cart-order-item__remove"
                    type="submit"
                    aria-label={`${labels.remove}: ${item.name}`}
                  >
                    <Trash2 size={17} />
                  </button>
                </form>
              </article>
            );
          })}
        </div>
        <div className="cart-totals cart-totals--selection">
          <span>
            {labels.totalSale}
            <strong>{formatMoney(selectedTotals.sale, locale)}</strong>
          </span>
          <span>
            {labels.totalCommission}
            <strong>{formatMoney(selectedTotals.commission, locale)}</strong>
          </span>
        </div>
      </section>

      <CheckoutForm
        locale={locale}
        cities={cities}
        orderItems={orderItems}
        itemsTotal={selectedTotals.sale}
        commission={selectedTotals.commission}
        labels={checkoutLabels}
      />
    </div>
  );
}
