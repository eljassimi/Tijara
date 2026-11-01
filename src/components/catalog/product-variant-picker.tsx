"use client";

import { PackageCheck } from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";

export type ProductVariantOption = {
  id: string;
  size: string | null;
  color: string | null;
  stock: number;
  active: boolean;
};

const defaultColorKey = "__default__";

function colorKey(color: string | null) {
  return color?.trim() || defaultColorKey;
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}

function swatchColor(color: string | null) {
  const value = normalize(color ?? "");
  if (!value || value.includes("disponibil"))
    return "conic-gradient(#6f4e37, #171717, #d9c3a3, #7f1734, #6f4e37)";
  if (value.includes("noir")) return "#171717";
  if (value.includes("blanc")) return "#ffffff";
  if (value.includes("beige")) return "#d9c3a3";
  if (value.includes("grenat")) return "#7f1734";
  if (value.includes("brique")) return "#a9533e";
  if (value.includes("marron fonce")) return "#4b3329";
  if (value.includes("marron clair")) return "#a4765a";
  if (value.includes("marron")) return "#6f4e37";
  if (value.includes("bleu marine")) return "#1b2a4a";
  if (value.includes("bleu ciel")) return "#82bde0";
  if (value.includes("bleu")) return "#3b6fb6";
  if (value.includes("vert")) return "#4e6b50";
  if (value.includes("gris")) return "#8b8d91";
  if (value.includes("kaki")) return "#7a7651";
  if (value.includes("rose")) return "#d990a8";
  if (value.includes("mortadelle")) return "#c98f8c";
  return "linear-gradient(135deg, #3b3bf5, #e2553f)";
}

export function ProductVariantPicker({
  variants,
  locale,
}: {
  variants: ProductVariantOption[];
  locale: "fr" | "ar";
}) {
  const firstAvailable = variants.find(
    (variant) => variant.active && variant.stock > 0,
  );
  const [selectedId, setSelectedId] = useState(firstAvailable?.id ?? "");
  const selected =
    variants.find((variant) => variant.id === selectedId) ?? firstAvailable;

  const colors = useMemo(() => {
    const groups = new Map<
      string,
      { color: string | null; available: boolean }
    >();
    for (const variant of variants) {
      const key = colorKey(variant.color);
      const current = groups.get(key);
      groups.set(key, {
        color: variant.color,
        available:
          Boolean(current?.available) || (variant.active && variant.stock > 0),
      });
    }
    return [...groups.entries()].map(([key, value]) => ({ key, ...value }));
  }, [variants]);

  const selectedColor = colorKey(selected?.color ?? null);
  const sizes = variants.filter(
    (variant) => colorKey(variant.color) === selectedColor,
  );
  const colorLabel = locale === "ar" ? "اللون" : "Couleur";
  const sizeLabel = locale === "ar" ? "المقاس" : "Taille";

  return (
    <div className="product-variant-picker">
      <input type="hidden" name="variantId" value={selected?.id ?? ""} />
      {colors.length > 1 ? (
        <fieldset className="variant-choice-group">
          <legend>{colorLabel}</legend>
          <div className="variant-color-options">
            {colors.map((item) => {
              const isSelected = item.key === selectedColor;
              return (
                <button
                  className="variant-color-option"
                  type="button"
                  disabled={!item.available}
                  aria-pressed={isSelected}
                  onClick={() => {
                    const sameSize = variants.find(
                      (variant) =>
                        colorKey(variant.color) === item.key &&
                        variant.size === selected?.size &&
                        variant.active &&
                        variant.stock > 0,
                    );
                    const next =
                      sameSize ??
                      variants.find(
                        (variant) =>
                          colorKey(variant.color) === item.key &&
                          variant.active &&
                          variant.stock > 0,
                      );
                    if (next) setSelectedId(next.id);
                  }}
                  key={item.key}
                >
                  <i
                    aria-hidden="true"
                    style={
                      {
                        "--variant-swatch": swatchColor(item.color),
                      } as CSSProperties
                    }
                  />
                  <span>
                    {item.color ||
                      (locale === "ar" ? "حسب المتوفر" : "Selon disponibilité")}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : colors[0]?.color ? (
        <p className="variant-single-color">
          <span>{colorLabel}</span>
          <strong>{colors[0].color}</strong>
        </p>
      ) : null}

      <fieldset className="variant-choice-group">
        <legend>{sizeLabel}</legend>
        <div className="variant-size-options">
          {sizes.map((variant) => {
            const available = variant.active && variant.stock > 0;
            return (
              <button
                className="variant-size-option"
                type="button"
                disabled={!available}
                aria-pressed={variant.id === selected?.id}
                onClick={() => setSelectedId(variant.id)}
                key={variant.id}
              >
                {variant.size ||
                  (locale === "ar" ? "مقاس موحد" : "Taille unique")}
              </button>
            );
          })}
        </div>
      </fieldset>

      {selected ? (
        <p className="variant-stock-note" aria-live="polite">
          <PackageCheck size={16} />
          {locale === "ar"
            ? `${selected.stock} قطع متوفرة`
            : `${selected.stock} pièces en stock`}
        </p>
      ) : null}
    </div>
  );
}
