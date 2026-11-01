import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

export async function LegalPage({ kind }: { kind: "terms" | "privacy" }) {
  const [t, common] = await Promise.all([
    getTranslations("Legal"),
    getTranslations("Common"),
  ]);
  const isTerms = kind === "terms";
  const sections = ["orders", "delivery", "money", "customer"] as const;
  return (
    <main id="main-content" className="legal-page">
      <div className="site-container legal-page__inner">
        <Link href="/" className="legal-back">
          <ArrowLeft size={17} />
          {common("backHome")}
        </Link>
        <h1>{t(isTerms ? "termsTitle" : "privacyTitle")}</h1>
        <p className="legal-intro">
          {t(isTerms ? "termsIntro" : "privacyIntro")}
        </p>
        {isTerms ? (
          <div className="legal-sections">
            {sections.map((section, index) => (
              <section key={section}>
                <span>0{index + 1}</span>
                <div>
                  <h2>{t(`termsSections.${section}Title`)}</h2>
                  <p>{t(`termsSections.${section}Body`)}</p>
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="legal-sections">
            <section>
              <span>01</span>
              <div>
                <h2>{t("privacyTitle")}</h2>
                <p>{t("privacyBody")}</p>
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
