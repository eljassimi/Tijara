import { getTranslations } from "next-intl/server";

import { Logo } from "@/components/brand/logo";

export default async function BrandPage() {
  const t = await getTranslations("Brand");
  const colors = [
    "ink",
    "majorelle",
    "saffron",
    "terracotta",
    "mint",
    "sand",
    "clay",
    "muted-ink",
  ];
  return (
    <main>
      <div className="dashboard-heading">
        <div>
          <p className="app-kicker">{t("logo")}</p>
          <h1>{t("title")}</h1>
          <p>{t("body")}</p>
        </div>
      </div>
      <section className="brand-section">
        <h2>{t("logo")}</h2>
        <div className="logo-stage">
          <Logo />
          <div className="logo-stage__dark">
            <Logo inverse />
          </div>
        </div>
      </section>
      <section className="brand-section">
        <h2>{t("colors")}</h2>
        <div className="swatch-grid">
          {colors.map((color) => (
            <article key={color}>
              <span style={{ background: `var(--${color})` }} />
              <strong>--{color}</strong>
            </article>
          ))}
        </div>
      </section>
      <section className="brand-section">
        <h2>{t("type")}</h2>
        <div className="type-specimen">
          <h3>Tijara تجارة</h3>
          <p>Vendez sans stock. On s&apos;occupe du reste.</p>
          <strong>199,00 MAD</strong>
        </div>
      </section>
      <section className="brand-section brand-section--grid">
        <div>
          <h2>{t("actions")}</h2>
          <div className="component-row">
            <button className="button button--primary">{t("primary")}</button>
            <button className="button button--secondary">
              {t("secondary")}
            </button>
          </div>
        </div>
        <div>
          <h2>{t("statuses")}</h2>
          <div className="component-row">
            <Badge tone="blue" label={t("new")} />
            <Badge tone="yellow" label={t("waiting")} />
            <Badge tone="green" label={t("confirmed")} />
            <Badge tone="outline" label={t("transit")} />
            <Badge tone="red" label={t("refused")} />
          </div>
        </div>
      </section>
      <section className="brand-section">
        <h2>{t("forms")}</h2>
        <label className="field brand-field">
          <span>{t("fieldLabel")}</span>
          <input placeholder={t("fieldPlaceholder")} />
          <small>{t("fieldHelp")}</small>
        </label>
      </section>
    </main>
  );
}

function Badge({ tone, label }: { tone: string; label: string }) {
  return (
    <span className={`status-badge status-badge--${tone}`}>
      <i />
      {label}
    </span>
  );
}
