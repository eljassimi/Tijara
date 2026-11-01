"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { resolveActiveHref } from "@/lib/navigation";

export function ActiveLink({
  href,
  hrefs = [href],
  children,
}: {
  href: string;
  hrefs?: readonly string[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = resolveActiveHref(pathname, hrefs) === href;
  return (
    <Link href={href} className={active ? "is-active" : undefined}>
      {children}
    </Link>
  );
}
