import { CircleAlert, CircleCheck } from "lucide-react";

/** Statuses that should stay on the error/warning (red) notice style. */
const errorNoticeStatuses = new Set([
  "bank-required",
  "bank_reference_required",
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
  "handoff-already-sent",
  "handoff-company-inactive",
  "handoff-company-required",
  "handoff-duplicate-parcel",
  "handoff-failed",
  "handoff-forbidden",
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

export function FormNotice({
  status,
  messages,
}: {
  status?: string;
  messages: Record<string, string>;
}) {
  if (!status || !messages[status]) return null;
  const positive = isSuccessNoticeStatus(status);
  return (
    <p
      className={`workflow-notice${positive ? " workflow-notice--success" : ""}`}
    >
      {positive ? <CircleCheck size={17} /> : <CircleAlert size={17} />}
      {messages[status]}
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
