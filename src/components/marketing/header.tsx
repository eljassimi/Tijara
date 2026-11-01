import { getTranslations } from "next-intl/server";

import { LocaleSwitcher } from "@/components/locale-switcher";
import { Logo } from "@/components/brand/logo";
import { Link } from "@/i18n/navigation";
import { homeHrefForRole } from "@/lib/navigation";
import { getSessionUser } from "@/server/auth/session";

export async function MarketingHeader() {
  const [common, nav, user] = await Promise.all([
    getTranslations("Common"),
    getTranslations("Nav"),
    getSessionUser(),
  ]);

  return (
    <header className="marketing-header">
      <div className="site-container marketing-header__inner">
        <Link href="/" className="logo-link" aria-label={common("brandLabel")}>
          <Logo />
        </Link>
        <nav className="desktop-nav" aria-label="Main">
          <a href="#how">{nav("how")}</a>
          <a href="#benefits">{nav("benefits")}</a>
          <a href="#faq">{nav("faq")}</a>
          <a href="#contact">{nav("contact")}</a>
        </nav>
        <div className="marketing-header__actions">
          <LocaleSwitcher />
          {user ? (
            <Link
              href={homeHrefForRole(user.role)}
              className="button button--primary button--small header-signup"
            >
              {common("goToDashboard")}
            </Link>
          ) : (
            <>
              <Link href="/login" className="button button--ghost button--small">
                {common("login")}
              </Link>
              <Link
                href="/signup"
                className="button button--primary button--small header-signup"
              >
                {common("signup")}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
