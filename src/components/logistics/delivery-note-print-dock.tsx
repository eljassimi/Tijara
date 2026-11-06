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

function parcelCountLabel(count: number, locale: "fr" | "ar") {
  if (locale === "ar") {
    return count === 1 ? "1 طرد" : `${count} طرود`;
  }
  return count === 1 ? "1 colis" : `${count} colis`;
}

function friendlyNoteLabel(
  note: DeliveryNotePrintItem,
  index: number,
  locale: "fr" | "ar",
) {
  const stamp = asDate(note.savedAt) ?? asDate(note.createdAt);
  const count = parcelCountLabel(note.orders.length, locale);
  const when = stamp ? formatAppDateTime(stamp, locale) : null;
  const rank = index + 1;

  if (locale === "ar") {
    return when
      ? `بون ${rank} · ${when} · ${count}`
      : `بون ${rank} · ${count}`;
  }
  return when
    ? `Bon ${rank} · ${when} · ${count}`
    : `Bon ${rank} · ${count}`;
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

  const selectedIndex = notes.findIndex((note) => note.id === selectedId);
  const selected =
    (selectedIndex >= 0 ? notes[selectedIndex] : notes[0]) ?? null;

  if (!selected) return null;

  const pdfs = ozonDeliveryNotePdfUrls(selected.externalRef);
  const when = asDate(selected.savedAt) ?? asDate(selected.createdAt);
  const options = notes.map((note, index) => ({
    value: note.id,
    label: friendlyNoteLabel(note, index, locale),
    // Keep the Ozon ref searchable for support, without showing it as the title.
    keywords: note.externalRef,
  }));

  return (
    <div className="bl-print-bar filter-bar operations-filter-bar">
      <div className="queue-form-field bl-print-bar__select">
        <span>{locale === "ar" ? "أي بون تطبع؟" : "Quel bon imprimer ?"}</span>
        <CustomSelect
          name="deliveryNoteId"
          label={locale === "ar" ? "أي بون تطبع؟" : "Quel bon imprimer ?"}
          locale={locale}
          value={selected.id}
          onValueChange={setSelectedId}
          searchable={notes.length > 6}
          options={options}
        />
      </div>

      <div className="bl-print-bar__meta">
        <strong>
          {parcelCountLabel(selected.orders.length, locale)}
          {when ? ` · ${formatAppDateTime(when, locale)}` : ""}
        </strong>
        <small>
          {locale === "ar"
            ? "اختر الصيغة ثم اطبع"
            : "Choisissez le format, puis imprimez"}
        </small>
      </div>

      <div className="bl-print-bar__actions">
        <a
          className="button button--ghost button--compact"
          href={pdfs.standard}
          target="_blank"
          rel="noreferrer"
        >
          {locale === "ar" ? "قائمة A4" : "Liste A4"}
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
          {locale === "ar" ? "ملصقات 10×10" : "Stickers 10×10"}
        </a>
      </div>
    </div>
  );
}
