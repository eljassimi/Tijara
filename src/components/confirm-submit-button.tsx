"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, X } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type MouseEvent,
} from "react";

type Props = ComponentProps<"button"> & {
  confirmMessage: string;
  confirmTitle?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  locale?: "fr" | "ar";
};

function resolveLocale(locale?: "fr" | "ar"): "fr" | "ar" {
  if (locale) return locale;
  if (typeof document === "undefined") return "fr";
  const lang = document.documentElement.lang?.toLowerCase() ?? "";
  const dir = document.documentElement.dir;
  if (lang.startsWith("ar") || dir === "rtl") return "ar";
  return "fr";
}

export function ConfirmSubmitButton({
  confirmMessage,
  confirmTitle,
  confirmLabel,
  cancelLabel,
  locale,
  onClick,
  children,
  type = "submit",
  ...props
}: Props) {
  const [open, setOpen] = useState(false);
  const [resolvedLocale, setResolvedLocale] = useState<"fr" | "ar">(
    locale ?? "fr",
  );
  const buttonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    setResolvedLocale(resolveLocale(locale));
  }, [locale]);

  const copy =
    resolvedLocale === "ar"
      ? {
          title: confirmTitle ?? "تأكيد الإجراء",
          confirm: confirmLabel ?? "تأكيد",
          cancel: cancelLabel ?? "إلغاء",
        }
      : {
          title: confirmTitle ?? "Confirmer l’action",
          confirm: confirmLabel ?? "Confirmer",
          cancel: cancelLabel ?? "Annuler",
        };

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    onClick?.(event);
    if (event.defaultPrevented || props.disabled) return;
    event.preventDefault();
    setOpen(true);
  }

  function handleConfirm() {
    const button = buttonRef.current;
    const form = button?.form;
    setOpen(false);
    if (!button || !form) return;
    // Native requestSubmit bypasses this button's click handler.
    queueMicrotask(() => form.requestSubmit(button));
  }

  return (
    <>
      <button
        {...props}
        ref={buttonRef}
        type={type}
        onClick={handleClick}
      >
        {children}
      </button>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="confirm-dialog__overlay" />
          <Dialog.Content
            className="confirm-dialog"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            <div className="confirm-dialog__icon" aria-hidden="true">
              <AlertTriangle size={22} strokeWidth={2} />
            </div>
            <div className="confirm-dialog__body">
              <Dialog.Title className="confirm-dialog__title" id={titleId}>
                {copy.title}
              </Dialog.Title>
              <Dialog.Description
                className="confirm-dialog__message"
                id={descriptionId}
              >
                {confirmMessage}
              </Dialog.Description>
            </div>
            <div className="confirm-dialog__actions">
              <Dialog.Close asChild>
                <button className="button button--ghost" type="button">
                  {copy.cancel}
                </button>
              </Dialog.Close>
              <button
                className="button button--primary"
                type="button"
                onClick={handleConfirm}
              >
                {copy.confirm}
              </button>
            </div>
            <Dialog.Close asChild>
              <button
                className="confirm-dialog__close"
                type="button"
                aria-label={copy.cancel}
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
