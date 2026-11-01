import {
  ArrowUpRight,
  BadgeCheck,
  Banknote,
  Boxes,
  Camera,
  Headphones,
  PackageCheck,
  PhoneCall,
  ShieldCheck,
  Truck,
  WalletCards,
} from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ZelligeField } from "@/components/brand/zellige-field";
import { ZelligeMark } from "@/components/brand/zellige-mark";
import { Link } from "@/i18n/navigation";
import { homeHrefForRole } from "@/lib/navigation";
import { getSessionUser } from "@/server/auth/session";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, common, user] = await Promise.all([
    getTranslations("Landing"),
    getTranslations("Common"),
    getSessionUser(),
  ]);
  const dashboardHref = user ? homeHrefForRole(user.role) : null;

  const steps = [
    ["01", "oneTitle", "oneBody"],
    ["02", "twoTitle", "twoBody"],
    ["03", "threeTitle", "threeBody"],
    ["04", "fourTitle", "fourBody"],
  ] as const;
  const benefits = [
    [Boxes, "storageTitle", "storageBody"],
    [Camera, "mediaTitle", "mediaBody"],
    [Truck, "deliveryTitle", "deliveryBody"],
    [BadgeCheck, "commissionTitle", "commissionBody"],
    [Banknote, "payoutTitle", "payoutBody"],
  ] as const;
  const faq = ["one", "two", "three", "four"] as const;

  return (
    <main id="main-content">
      <section className="hero-section">
        <ZelligeField className="hero-pattern" />
        <div className="site-container hero-grid">
          <div className="hero-copy">
            <p className="eyebrow eyebrow--light">
              <span />
              {t("eyebrow")}
            </p>
            <h1>
              {t("heroTitleA")} <strong>{t("heroTitleAccent")}</strong>
              <br />
              {t("heroTitleB")}
            </h1>
            <p className="hero-lead">{t("heroBody")}</p>
            <div className="hero-actions">
              <Link
                href={dashboardHref ?? "/signup"}
                className="button button--saffron"
              >
                {dashboardHref ? common("goToDashboard") : common("signup")}{" "}
                <ArrowUpRight aria-hidden="true" size={18} />
              </Link>
              <a href="#how" className="button button--glass">
                {common("learnMore")}
              </a>
            </div>
            {!dashboardHref && (
              <p className="hero-note">
                <ShieldCheck aria-hidden="true" size={17} />
                {t("heroNote")}
              </p>
            )}
          </div>
          <div className="hero-visual" aria-hidden="true">
            <div className="hero-orbit hero-orbit--outer" />
            <div className="hero-orbit hero-orbit--inner" />
            <div className="hero-star">
              <ZelligeMark />
            </div>
            <div className="hero-chip hero-chip--sale">
              <PhoneCall size={20} />
              <span>1</span>
            </div>
            <div className="hero-chip hero-chip--parcel">
              <PackageCheck size={20} />
              <span>2</span>
            </div>
            <div className="hero-chip hero-chip--wallet">
              <WalletCards size={20} />
              <span>3</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section section--journey" id="how">
        <div className="site-container">
          <div className="section-heading section-heading--split">
            <h2>{t("journeyTitle")}</h2>
            <p>{t("journeyBody")}</p>
          </div>
          <div className="journey-grid">
            {steps.map(([number, title, body], index) => (
              <article className="journey-card" key={number}>
                <span className="journey-card__number">{number}</span>
                <div className="journey-card__star">
                  <ZelligeMark />
                </div>
                <h3>{t(`steps.${title}`)}</h3>
                <p>{t(`steps.${body}`)}</p>
                {index < steps.length - 1 && (
                  <span className="journey-card__line" aria-hidden="true" />
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--benefits" id="benefits">
        <div className="site-container benefits-grid">
          <div className="benefits-intro">
            <p className="eyebrow">
              <span />
              Tijara
            </p>
            <h2>{t("benefitsTitle")}</h2>
            <p>{t("benefitsBody")}</p>
          </div>
          <div className="benefit-list">
            {benefits.map(([Icon, title, body], index) => (
              <article className="benefit-row" key={title}>
                <span className="benefit-row__index">0{index + 1}</span>
                <span className="benefit-row__icon">
                  <Icon size={23} />
                </span>
                <div>
                  <h3>{t(`benefits.${title}`)}</h3>
                  <p>{t(`benefits.${body}`)}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section catalog-preview">
        <div className="site-container catalog-preview__inner">
          <div>
            <p className="eyebrow">
              <span />
              {t("catalogEyebrow")}
            </p>
            <h2>{t("catalogTitle")}</h2>
            <p>{t("catalogBody")}</p>
          </div>
          <div className="empty-catalog">
            <ZelligeMark />
            <p>{common("noPublishedProducts")}</p>
          </div>
        </div>
      </section>

      <section className="section faq-section" id="faq">
        <div className="site-container faq-grid">
          <h2>{t("faqTitle")}</h2>
          <div className="faq-list">
            {faq.map((item, index) => (
              <details key={item} open={index === 0}>
                <summary>
                  <span>0{index + 1}</span>
                  {t(`faq.${item}Q`)}
                </summary>
                <p>{t(`faq.${item}A`)}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="section contact-section" id="contact">
        <div className="site-container contact-card">
          <ZelligeField />
          <div>
            <Headphones size={28} />
            <h2>{t("contactTitle")}</h2>
            <p>{t("contactBody")}</p>
          </div>
          <div className="contact-card__action">
            <Link
              href={dashboardHref ?? "/signup"}
              className="button button--saffron"
            >
              {dashboardHref ? common("goToDashboard") : common("signup")}
              <ArrowUpRight size={18} />
            </Link>
            {!dashboardHref && <small>{t("contactNote")}</small>}
          </div>
        </div>
      </section>
    </main>
  );
}
