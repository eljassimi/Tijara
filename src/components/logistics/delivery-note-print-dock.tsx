"use client";

import { useEffect, useMemo, useState } from "react";

import { CustomSelect } from "@/components/ui/custom-select";
import { formatAppDateTime } from "@/lib/time";
import { ozonDeliveryNotePdfUrls } from "@/server/delivery/ozon-express/client";

export type DeliveryNotePrintItem = {
  id: string;
  externalRef: string;
  status: string;
  createdAt: Date | string;
  savedAt: Date | string | null;
  courierName: string;
  orders: Array<{
    id: string;
    code: string;
    parcelCode: string | null;
  }>;
};

function asDate(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

export function DeliveryNotePrintDock({
  locale,
  notes,
  highlightRef,
}: {
  locale: "fr" | "ar";
  notes: DeliveryNotePrintItem[];
  highlightRef?: string;
}) {
  const initialId = useMemo(() => {
    if (!notes.length) return "";
    if (highlightRef) {
      const match = notes.find(
        (note) => note.externalRef.trim() === highlightRef.trim(),
      );
      if (match) return match.id;
    }
    return notes[0]!.id;
  }, [highlightRef, notes]);

  const [selectedId, setSelectedId] = useState(initialId);
  useEffect(() => {
    setSelectedId(initialId);
  }, [initialId]);

  const selected =
    notes.find((note) => note.id === selectedId) ?? notes[0] ?? null;

  if (!selected) return null;

  const pdfs = ozonDeliveryNotePdfUrls(selected.externalRef);
  const when = asDate(selected.savedAt) ?? asDate(selected.createdAt);
  const options = notes.map((note) => {
    const stamp = asDate(note.savedAt) ?? asDate(note.createdAt);
    const count =
      locale === "ar"
        ? `${note.orders.length} طرد`
        : `${note.orders.length} colis`;
    const dateBit = stamp ? ` · ${formatAppDateTime(stamp, locale)}` : "";
    return {
      value: note.id,
      label: `${note.externalRef} · ${count}${dateBit}`,
    };
  });

  return (
    <div className="bl-print-bar filter-bar operations-filter-bar">
      <div className="queue-form-field bl-print-bar__select">
        <span>{locale === "ar" ? "البون" : "Bon à imprimer"}</span>
        <CustomSelect
          name="deliveryNoteId"
          label={locale === "ar" ? "البون" : "Bon à imprimer"}
          locale={locale}
          value={selected.id}
          onValueChange={setSelectedId}
          searchable={notes.length > 6}
          options={options}
        />
      </div>

      <div className="bl-print-bar__meta">
        <span>
          {locale === "ar"
            ? `${selected.orders.length} طرد`
            : `${selected.orders.length} colis`}
          {when ? ` · ${formatAppDateTime(when, locale)}` : ""}
        </span>
        <small className="bl-print-bar__parcels" dir="ltr">
          {selected.orders
            .slice(0, 5)
            .map((order) => order.parcelCode || order.code)
            .join(" · ")}
          {selected.orders.length > 5
            ? ` · +${selected.orders.length - 5}`
            : ""}
        </small>
      </div>

      <div className="bl-print-bar__actions">
        <a
          className="button button--ghost button--compact"
          href={pdfs.standard}
          target="_blank"
          rel="noreferrer"
        >
          {locale === "ar" ? "بون A4" : "Bon A4"}
        </a>
        <a
          className="button button--ghost button--compact"
          href={pdfs.ticketsA4}
          target="_blank"
          rel="noreferrer"
        >
          {locale === "ar" ? "ملصقات A4" : "Étiquettes A4"}
        </a>
        <a
          className="button button--primary button--compact"
          href={pdfs.tickets10x10}
          target="_blank"
          rel="noreferrer"
        >
          {locale === "ar" ? "10×10" : "Stickers 10×10"}
        </a>
      </div>
    </div>
  );
}
