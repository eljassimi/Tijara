"use client";

import {
  useTransition,
  type ComponentProps,
  type FormEvent,
  type ReactNode,
} from "react";

type Props = Omit<ComponentProps<"form">, "action"> & {
  action: (formData: FormData) => Promise<void>;
  children: ReactNode;
};

export function PreserveScrollForm({ action, children, onSubmit, ...props }: Props) {
  const [, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    onSubmit?.(event);
    if (event.defaultPrevented) return;
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const scrollY = window.scrollY;
    startTransition(async () => {
      await action(formData);
      // Soft revalidation can still nudge the viewport; pin it back.
      requestAnimationFrame(() => {
        window.scrollTo(0, scrollY);
      });
    });
  }

  return (
    <form {...props} onSubmit={handleSubmit}>
      {children}
    </form>
  );
}
