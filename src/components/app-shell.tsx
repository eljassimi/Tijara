import type { LucideIcon } from "lucide-react";
import { Bell, LogOut, Menu } from "lucide-react";
import { Suspense } from "react";

import { Logo } from "@/components/brand/logo";
import { ActiveLink } from "@/components/active-link";
import {
  CartDrawer,
  type CartDrawerItem,
} from "@/components/cart/cart-drawer";
import { LiveChatBadge } from "@/components/chat/live-badge";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ProfileMenu } from "@/components/profile-menu";
import { RouteClosingDetails } from "@/components/route-closing-details";
import { Link } from "@/i18n/navigation";
import { logoutAction } from "@/server/auth/actions";

export type ShellItem = {
  label: string;
  mobileLabel?: string;
  mobilePrimary?: boolean;
  href: string;
  icon: LucideIcon;
  badge?: number;
  /** Poll live unread chat count for this nav item. */
  liveChatBadge?: boolean;
};

type AppShellProps = {
  areaLabel: string;
  items: ShellItem[];
  children: React.ReactNode;
  showCart?: boolean;
  cartCount?: number;
  cartItems?: CartDrawerItem[];
  notificationCount?: number;
  notificationHref: string;
  locale: string;
  logoutLabel: string;
  userName: string;
};

export function AppShell({
  areaLabel,
  items,
  children,
  showCart = false,
  cartCount = 0,
  cartItems = [],
  notificationCount = 0,
  notificationHref,
  locale,
  logoutLabel,
  userName,
}: AppShellProps) {
  const logout = logoutAction.bind(null, locale);
  const navigationHrefs = items.map((item) => item.href);
  const requestedMobileItems = items.filter((item) => item.mobilePrimary);
  const mobileItems = requestedMobileItems.length
    ? requestedMobileItems
    : items.slice(0, 4);
  const mobileHrefs = new Set(mobileItems.map((item) => item.href));
  const moreItems = items.filter((item) => !mobileHrefs.has(item.href));
  return (
    <div className={`app-frame${showCart ? " app-frame--partner" : ""}`}>
      <aside className="app-sidebar">
        <Link href="/" className="app-sidebar__logo">
          <Logo inverse />
        </Link>
        <p className="app-sidebar__area">{areaLabel}</p>
        <nav className="app-nav">
          {items.map(({ label, href, icon: Icon, badge, liveChatBadge }) => (
            <ActiveLink href={href} hrefs={navigationHrefs} key={href}>
              <Icon size={19} aria-hidden="true" />
              <span>{label}</span>
              {liveChatBadge ? (
                <LiveChatBadge initialCount={badge ?? 0} />
              ) : badge && badge > 0 ? (
                <span className="app-nav__badge">
                  {badge > 99 ? "99+" : badge}
                </span>
              ) : null}
            </ActiveLink>
          ))}
        </nav>
      </aside>
      <div className="app-main">
        <header className="app-header">
          <details className="mobile-menu-popover">
            <summary
              className="icon-button mobile-menu"
              aria-label={locale === "ar" ? "فتح القائمة" : "Ouvrir le menu"}
            >
              <Menu size={20} />
            </summary>
            <nav className="mobile-menu-panel" aria-label={areaLabel}>
              {items.map(({ label, href, icon: Icon, badge, liveChatBadge }) => (
                <ActiveLink href={href} hrefs={navigationHrefs} key={href}>
                  <Icon size={19} />
                  <span>{label}</span>
                  {liveChatBadge ? (
                    <LiveChatBadge initialCount={badge ?? 0} />
                  ) : badge && badge > 0 ? (
                    <span className="app-nav__badge">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  ) : null}
                </ActiveLink>
              ))}
            </nav>
          </details>
          <div className="app-header__spacer" />
          <LocaleSwitcher />
          <Link
            className="icon-button cart-link"
            href={notificationHref}
            aria-label="Notifications"
          >
            <Bell size={19} />
            {notificationCount > 0 && <span>{notificationCount}</span>}
          </Link>
          {showCart ? (
            <Suspense
              fallback={
                <span className="icon-button cart-link" aria-hidden>
                  <span className="cart-link__placeholder" />
                </span>
              }
            >
              <CartDrawer
                locale={locale === "ar" ? "ar" : "fr"}
                items={cartItems}
                cartCount={cartCount}
              />
            </Suspense>
          ) : null}
          <ProfileMenu
            locale={locale}
            userName={userName}
            logoutLabel={logoutLabel}
          />
        </header>
        <div className="app-content">{children}</div>
      </div>
      <nav className="mobile-tabs">
        {mobileItems.map(
          ({ label, mobileLabel, href, icon: Icon, badge, liveChatBadge }) => (
            <ActiveLink href={href} hrefs={navigationHrefs} key={href}>
              <span className="mobile-tabs__icon">
                <Icon size={20} />
                {liveChatBadge ? (
                  <span className="app-nav__badge--host">
                    <LiveChatBadge initialCount={badge ?? 0} />
                  </span>
                ) : badge && badge > 0 ? (
                  <span className="app-nav__badge app-nav__badge--float">
                    {badge > 99 ? "99+" : badge}
                  </span>
                ) : null}
              </span>
              <span>{mobileLabel ?? label}</span>
            </ActiveLink>
          ),
        )}
        <RouteClosingDetails
          className="mobile-tabs__more"
          summary={
            <summary>
              <Menu size={20} />
              <span>{locale === "ar" ? "المزيد" : "Plus"}</span>
            </summary>
          }
        >
          <div>
            {moreItems.map(
              ({ label, href, icon: Icon, badge, liveChatBadge }) => (
                <ActiveLink href={href} hrefs={navigationHrefs} key={href}>
                  <Icon size={18} />
                  <span>{label}</span>
                  {liveChatBadge ? (
                    <LiveChatBadge initialCount={badge ?? 0} />
                  ) : badge && badge > 0 ? (
                    <span className="app-nav__badge">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  ) : null}
                </ActiveLink>
              ),
            )}
            <form action={logout}>
              <button type="submit">
                <LogOut size={18} />
                <span>{logoutLabel}</span>
              </button>
            </form>
          </div>
        </RouteClosingDetails>
      </nav>
    </div>
  );
}
