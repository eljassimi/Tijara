"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export function RouteClosingDetails({
  className,
  summary,
  children,
}: {
  className?: string;
  summary: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const details = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (details.current) details.current.open = false;
  }, [pathname]);

  return (
    <details className={className} ref={details}>
      {summary}
      {children}
    </details>
  );
}
