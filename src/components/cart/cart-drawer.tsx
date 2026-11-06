"use client";

/* eslint-disable @next/next/no-img-element */
import { ShoppingCart, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { Link } from "@/i18n/navigation";
import { removeCartItemAction } from "@/server/cart/actions";

export type CartDrawerItem = {
  id: string;
  name: string;
  quantity: number;
  size?: string | null;
  color?: string | null;
  imageUrl?: string | null;
  priceLabel: string;
};

export function CartDrawer({
  locale,
  items,
  cartCount,
  openOnMount = false,
}: {
  locale: "fr" | "ar";
  items: CartDrawerItem[];
  cartCount: number;
  openOnMount?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(openOnMount);

  useEffect(() => {
    if (
      openOnMount ||
      searchParams.get("cart") === "open" ||
      searchParams.get("status") === "added"
    ) {
      setOpen(true);
    }
  }, [openOnMount, searchParams]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const returnTo = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

  return (
    <>
      <button
        type="button"
        className="icon-button cart-link"
        aria-label={locale === "ar" ? "السلة" : "Panier"}
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <ShoppingCart size={19} />
        {cartCount > 0 ? <span>{cartCount > 99 ? "99+" : cartCount}</span> : null}
      </button>

      {open ? (
        <div className="cart-drawer" role="dialog" aria-modal="true">
          <button
            type="button"
            className="cart-drawer__backdrop"
            aria-label={locale === "ar" ? "إغلاق" : "Fermer"}
            onClick={() => setOpen(false)}
          />
          <aside className="cart-drawer__panel">
            <header className="cart-drawer__header">
              <div>
                <p className="app-kicker">
                  {locale === "ar" ? "سلتك" : "Votre panier"}
                </p>
                <h2>
                  {locale === "ar"
                    ? `${cartCount} منتج`
                    : `${cartCount} article${cartCount > 1 ? "s" : ""}`}
                </h2>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label={locale === "ar" ? "إغلاق" : "Fermer"}
                onClick={() => setOpen(false)}
              >
                <X size={18} />
              </button>
            </header>

            <div className="cart-drawer__body">
              {!items.length ? (
                <div className="cart-drawer__empty">
                  <ShoppingCart size={36} />
                  <p>
                    {locale === "ar"
                      ? "سلتك فارغة حالياً."
                      : "Votre panier est vide pour le moment."}
                  </p>
                  <button
                    type="button"
                    className="button button--primary button--compact"
                    onClick={() => setOpen(false)}
                  >
                    {locale === "ar" ? "متابعة التسوّق" : "Continuer"}
                  </button>
                </div>
              ) : (
                <ul className="cart-drawer__list">
                  {items.map((item) => {
                    const variant = [item.color, item.size]
                      .filter(Boolean)
                      .join(" / ");
                    return (
                      <li key={item.id} className="cart-drawer__item">
                        <div className="cart-drawer__thumb">
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt="" />
                          ) : (
                            <ShoppingCart size={18} />
                          )}
                        </div>
                        <div className="cart-drawer__info">
                          <strong>{item.name}</strong>
                          {variant ? <span>{variant}</span> : null}
                          <small>
                            ×{item.quantity} · {item.priceLabel}
                          </small>
                        </div>
                        <form action={removeCartItemAction}>
                          <input type="hidden" name="locale" value={locale} />
                          <input type="hidden" name="itemId" value={item.id} />
                          <input type="hidden" name="returnTo" value={returnTo} />
                          <button
                            type="submit"
                            className="icon-button"
                            aria-label={
                              locale === "ar" ? "حذف" : "Retirer du panier"
                            }
                          >
                            <Trash2 size={16} />
                          </button>
                        </form>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {items.length ? (
              <footer className="cart-drawer__footer">
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => setOpen(false)}
                >
                  {locale === "ar" ? "متابعة التسوّق" : "Continuer vos achats"}
                </button>
                <Link
                  className="button button--primary"
                  href="/app/partner/cart"
                  onClick={() => setOpen(false)}
                >
                  {locale === "ar" ? "إتمام الطلب" : "Passer commande"}
                </Link>
              </footer>
            ) : null}
          </aside>
        </div>
      ) : null}
    </>
  );
}
