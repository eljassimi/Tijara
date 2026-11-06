import { FileText, LayoutGrid, Printer, SquareStack } from "lucide-react";

import { formatAppDateTime } from "@/lib/time";
import { ozonDeliveryNotePdfUrls } from "@/server/delivery/ozon-express/client";

export type DeliveryNotePrintItem = {
  id: string;
  externalRef: string;
  status: string;
  createdAt: Date;
  savedAt: Date | null;
  courierName: string;
  orders: Array<{
    id: string;
    code: string;
    parcelCode: string | null;
  }>;
};

const formats = [
  {
    key: "standard" as const,
    icon: FileText,
    labelFr: "Bon A4",
    labelAr: "بون A4",
    hintFr: "Liste pour le ramasseur",
    hintAr: "قائمة للمُجمّع",
  },
  {
    key: "ticketsA4" as const,
    icon: LayoutGrid,
    labelFr: "Étiquettes A4",
    labelAr: "ملصقات A4",
    hintFr: "4 tickets / page",
    hintAr: "4 تذاكر / صفحة",
  },
  {
    key: "tickets10x10" as const,
    icon: SquareStack,
    labelFr: "Stickers 10×10",
    labelAr: "ملصقات 10×10",
    hintFr: "Imprimante thermique",
    hintAr: "طابعة حرارية",
  },
];

export function DeliveryNotePrintDock({
  locale,
  notes,
  highlightRef,
}: {
  locale: "fr" | "ar";
  notes: DeliveryNotePrintItem[];
  highlightRef?: string;
}) {
  if (!notes.length) return null;

  return (
    <div className="bl-print-dock">
      <div className="bl-print-dock__intro">
        <Printer size={18} aria-hidden />
        <div>
          <strong>
            {locale === "ar" ? "طباعة بونات التسليم" : "Imprimer les bons"}
          </strong>
          <p>
            {locale === "ar"
              ? "اختر الصيغة المناسبة لكل بون بعد الإرسال الجماعي."
              : "Choisissez le format pour chaque bon après un envoi groupé."}
          </p>
        </div>
      </div>

      <ul className="bl-print-dock__list">
        {notes.map((note) => {
          const pdfs = ozonDeliveryNotePdfUrls(note.externalRef);
          const active =
            highlightRef != null &&
            highlightRef.trim() === note.externalRef.trim();
          return (
            <li
              key={note.id}
              id={`bl-${note.externalRef}`}
              className={`bl-print-dock__note${active ? " bl-print-dock__note--active" : ""}`}
            >
              <div className="bl-print-dock__meta">
                <div className="bl-print-dock__ref">
                  <span>{note.courierName}</span>
                  <strong dir="ltr">{note.externalRef}</strong>
                </div>
                <p>
                  {locale === "ar"
                    ? `${note.orders.length} طرد`
                    : `${note.orders.length} colis`}
                  {" · "}
                  {formatAppDateTime(note.savedAt ?? note.createdAt, locale)}
                  {note.status === "DRAFT"
                    ? locale === "ar"
                      ? " · مسودة"
                      : " · Brouillon"
                    : ""}
                </p>
                <div className="bl-print-dock__parcels">
                  {note.orders.slice(0, 8).map((order) => (
                    <span key={order.id} dir="ltr">
                      {order.parcelCode || order.code}
                    </span>
                  ))}
                  {note.orders.length > 8 ? (
                    <span>
                      +{note.orders.length - 8}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="bl-print-dock__formats" role="group">
                {formats.map((format) => {
                  const Icon = format.icon;
                  return (
                    <a
                      key={format.key}
                      className={`bl-print-format bl-print-format--${format.key}`}
                      href={pdfs[format.key]}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Icon size={18} aria-hidden />
                      <span>
                        <strong>
                          {locale === "ar" ? format.labelAr : format.labelFr}
                        </strong>
                        <small>
                          {locale === "ar" ? format.hintAr : format.hintFr}
                        </small>
                      </span>
                    </a>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
