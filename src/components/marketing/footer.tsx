import { getTranslations } from "next-intl/server";

import { Logo } from "@/components/brand/logo";
import { Link } from "@/i18n/navigation";

export async function MarketingFooter() {
  const t = await getTranslations("Landing");
  return (
    <footer className="site-footer">
      <div className="site-container site-footer__grid">
        <div>
          <Logo inverse />
          <p>{t("footerLine")}</p>
        </div>
        <div className="site-footer__links">
          <Link href="/terms">{t("terms")}</Link>
          <Link href="/privacy">{t("privacy")}</Link>
        </div>
      </div>
    </footer>
  );
}
