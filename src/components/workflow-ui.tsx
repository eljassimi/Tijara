"use client";

import { CircleAlert, CircleCheck, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Statuses that should stay on the error/warning (red) notice style. */
const errorNoticeStatuses = new Set([
  "bank-required",
  "bank_reference_required",
  "bl-invalid",
  "callback-required",
  "cap-20",
  "captcha",
  "current-password",
  "duplicate",
  "duplicate-variant",
  "empty-cart",
  "exists",
  "expired",
  "failed",
  "forbidden",
  "handoff-address-required",
  "handoff-already-sent",
  "handoff-api-failed",
  "handoff-city-unmapped",
  "handoff-company-inactive",
  "handoff-company-required",
  "handoff-duplicate-parcel",
  "handoff-failed",
  "handoff-forbidden",
  "handoff-no-parcels",
  "handoff-not-confirmed",
  "handoff-not-ready",
  "handoff-order-closed",
  "import-failed",
  "import-partial",
  "insufficient",
  "invalid",
  "invalid-image",
  "invalid-import",
  "invalid-price",
  "invalid-sheet-url",
  "invalid-stock",
  "invalid-transition",
  "invalid-variant",
  "negative-balance",
  "negative_balance",
  "open-request",
  "password-mismatch",
  "pending-login",
  "publish-requirements",
  "rate-limited",
  "reason-required",
  "self-change",
  "sheet-failed",
  "sheet-needs-catalog",
  "sheet-partial",
  "sheet-unavailable",
  "storage-failed",
  "suspended",
  "unavailable",
  "unknown-city",
]);

const STATUS_QUERY_KEYS = [
  "status",
  "ref",
  "ok",
  "failed",
  "pdf",
  "cities",
  "count",
] as const;

export function isSuccessNoticeStatus(status: string) {
  return !errorNoticeStatuses.has(status);
}

export function WorkflowHeader({
  eyebrow,
  title,
  body,
  action,
}: {
  eyebrow: string;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="dashboard-heading workflow-heading">
      <div>
        {eyebrow ? <p className="app-kicker">{eyebrow}</p> : null}
        <h1>{title}</h1>
        <p>{body}</p>
      </div>
      {action}
    </div>
  );
}

function clearStatusQuery(pathname: string) {
  const url = new URL(window.location.href);
  let changed = false;
  for (const key of STATUS_QUERY_KEYS) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  if (!changed) return null;
  const qs = url.searchParams.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function FormNotice({
  status,
  messages,
  dismissMs = 7000,
}: {
  status?: string;
  messages: Record<string, string>;
  dismissMs?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const message = status ? messages[status] : undefined;
  const [visible, setVisible] = useState(Boolean(message));

  useEffect(() => {
    setVisible(Boolean(message));
  }, [message, status]);

  useEffect(() => {
    if (!status || !message) return;

    const timer = window.setTimeout(() => {
      setVisible(false);
      const next = clearStatusQuery(pathname);
      if (next) router.replace(next, { scroll: false });
    }, dismissMs);

    return () => window.clearTimeout(timer);
  }, [dismissMs, message, pathname, router, status]);

  if (!visible || !status || !message) return null;
  const positive = isSuccessNoticeStatus(status);

  return (
    <p
      className={`workflow-notice${positive ? " workflow-notice--success" : ""}`}
      role="status"
      aria-live="polite"
    >
      {positive ? <CircleCheck size={17} /> : <CircleAlert size={17} />}
      <span className="workflow-notice__text">{message}</span>
      <button
        type="button"
        className="workflow-notice__dismiss"
        aria-label="Fermer"
        onClick={() => {
          setVisible(false);
          const next = clearStatusQuery(pathname);
          if (next) router.replace(next, { scroll: false });
        }}
      >
        <X size={15} />
      </button>
    </p>
  );
}

export function StatusPill({
  children,
  status,
}: {
  children: React.ReactNode;
  status?: string;
}) {
  const tone = status ? ` module-status--${status}` : "";
  return (
    <span className={`module-status${tone}`}>
      <i />
      {children}
    </span>
  );
}
