export function resolveActiveHref(pathname: string, hrefs: readonly string[]) {
  return hrefs
    .filter((href) => {
      const root = href === "/admin" || href === "/app/partner";
      return pathname === href || (!root && pathname.startsWith(`${href}/`));
    })
    .sort((left, right) => right.length - left.length)[0];
}

/** Locale-free home path for next-intl `Link` / `redirect`. */
export function homeHrefForRole(role: string) {
  if (role === "AFFILIATE" || role === "AFFILIATE_STAFF") return "/app/partner";
  if (role === "CATALOG_MANAGER") return "/admin/catalog";
  if (role === "CONFIRMATION_AGENT") return "/admin/confirmation/dashboard";
  if (role === "SUPPORT") return "/admin/support";
  return "/admin";
}

export function homePathForRole(locale: string, role: string) {
  return `/${locale}${homeHrefForRole(role)}`;
}
