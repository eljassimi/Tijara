import { ExternalLink, ImageIcon } from "lucide-react";

import { StatusPill } from "@/components/workflow-ui";
import { formatMoney } from "@/lib/money";
import { statusLabel } from "@/lib/status";
import { formatAppDateTime } from "@/lib/time";

type PayoutHistoryCardProps = {
  locale: "fr" | "ar";
  reference: string;
  amount: string | number;
  status: string;
  createdAt: Date;
  personLabel?: string | null;
  bankName?: string | null;
  ribLast4?: string | null;
  bankReference?: string | null;
  rejectionReason?: string | null;
  proofUrl?: string | null;
  waitingProofHint?: string | null;
};

export function PayoutHistoryCard({
  locale,
  reference,
  amount,
  status,
  createdAt,
  personLabel,
  bankName,
  ribLast4,
  bankReference,
  rejectionReason,
  proofUrl,
  waitingProofHint,
}: PayoutHistoryCardProps) {
  const meta = [
    personLabel,
    bankName && ribLast4 ? `${bankName} · •••• ${ribLast4}` : bankName,
    formatAppDateTime(createdAt, locale),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="payout-history-card">
      <div className="payout-history-card__body">
        <div className="payout-history-card__top">
          <div>
            <strong className="payout-history-card__ref">{reference}</strong>
            <p className="payout-history-card__amount">
              {formatMoney(String(amount), locale)}
            </p>
          </div>
          <StatusPill>{statusLabel(status, locale)}</StatusPill>
        </div>
        {meta ? <p className="payout-history-card__meta">{meta}</p> : null}
        {bankReference ? (
          <p className="payout-history-card__note">
            {locale === "ar" ? "مرجع" : "Réf."}: {bankReference}
          </p>
        ) : null}
        {rejectionReason ? (
          <p className="payout-history-card__note payout-history-card__note--danger">
            {locale === "ar" ? "السبب" : "Motif"}: {rejectionReason}
          </p>
        ) : null}
        {waitingProofHint && !proofUrl ? (
          <p className="payout-history-card__note">{waitingProofHint}</p>
        ) : null}
      </div>
      {proofUrl ? (
        <a
          className="payout-history-card__proof"
          href={proofUrl}
          target="_blank"
          rel="noreferrer"
        >
          <img
            src={proofUrl}
            alt={
              locale === "ar" ? "صورة التحويل البنكي" : "Capture du virement"
            }
          />
          <span>
            <ExternalLink size={14} />
            {locale === "ar" ? "فتح الصورة" : "Voir la capture"}
          </span>
        </a>
      ) : status === "PAID" ? (
        <div className="payout-history-card__proof payout-history-card__proof--empty">
          <ImageIcon size={22} />
          <span>{locale === "ar" ? "بدون صورة" : "Sans capture"}</span>
        </div>
      ) : null}
    </article>
  );
}
