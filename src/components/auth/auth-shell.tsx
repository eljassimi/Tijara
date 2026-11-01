import { ArrowUpRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Script from "next/script";

import { Logo } from "@/components/brand/logo";
import { ZelligeField } from "@/components/brand/zellige-field";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Link } from "@/i18n/navigation";
import { loginAction, signupAction } from "@/server/auth/actions";

type AuthShellProps = {
  mode: "login" | "signup";
  locale: string;
  status?: string;
};

export async function AuthShell({ mode, locale, status }: AuthShellProps) {
  const [t, common] = await Promise.all([
    getTranslations("Auth"),
    getTranslations("Common"),
  ]);
  const isLogin = mode === "login";

  return (
    <main className="auth-page">
      {process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
          strategy="afterInteractive"
        />
      )}
      <section className="auth-story">
        <ZelligeField />
        <Link
          href="/"
          className="auth-story__logo"
          aria-label={common("brandLabel")}
        >
          <Logo inverse />
        </Link>
        <div className="auth-story__copy">
          <h1>{isLogin ? t("loginTitle") : t("signupTitle")}</h1>
          <p>{isLogin ? t("loginBody") : t("signupBody")}</p>
        </div>
        <p className="auth-story__tagline">
          {isLogin ? t("signupBody") : t("pending")}
        </p>
      </section>
      <section className="auth-form-panel">
        <div className="auth-form-panel__top">
          <Link href="/">{common("backHome")}</Link>
          <LocaleSwitcher />
        </div>
        <form
          className="auth-form"
          action={isLogin ? loginAction : signupAction}
        >
          <input type="hidden" name="locale" value={locale} />
          {status &&
            [
              "invalid",
              "captcha",
              "pending-login",
              "suspended",
              "exists",
              "pending",
              "reset",
              "rate-limited",
            ].includes(status) && (
              <p
                className={`form-notice ${status === "pending" || status === "reset" ? "form-notice--success" : ""}`}
              >
                {t(`status.${status}`)}
              </p>
            )}
          {!isLogin && (
            <Field label={t("fullName")} name="name" autoComplete="name" />
          )}
          <Field
            label={t("email")}
            name="email"
            type="email"
            autoComplete="email"
          />
          {!isLogin && (
            <div className="form-row">
              <Field
                label={t("phone")}
                name="phone"
                type="tel"
                autoComplete="tel"
              />
              <Field
                label={t("city")}
                name="city"
                autoComplete="address-level2"
              />
            </div>
          )}
          {!isLogin && (
            <Field
              label={t("socialPage")}
              name="socialPage"
              type="text"
              autoComplete="url"
            />
          )}
          <Field
            label={t("password")}
            name="password"
            type="password"
            autoComplete={isLogin ? "current-password" : "new-password"}
          />
          {isLogin ? (
            <div className="form-options">
              <label className="check-label">
                <input type="checkbox" name="remember" defaultChecked />
                {t("remember")}
              </label>
              <Link href="/forgot-password">{t("forgot")}</Link>
            </div>
          ) : (
            <label className="check-label">
              <input type="checkbox" name="terms" required />
              {t("acceptTerms")}
            </label>
          )}
          {process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && (
            <div
              className="cf-turnstile"
              data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
            />
          )}
          <button type="submit" className="button button--primary auth-submit">
            {isLogin ? t("loginAction") : t("signupAction")}
            <ArrowUpRight size={18} />
          </button>
          <p className="auth-switch">
            {isLogin ? t("noAccount") : t("hasAccount")}{" "}
            <Link href={isLogin ? "/signup" : "/login"}>
              {isLogin ? common("signup") : common("login")}
            </Link>
          </p>
        </form>
      </section>
    </main>
  );
}

function Field({
  label,
  name,
  type = "text",
  autoComplete,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input name={name} type={type} autoComplete={autoComplete} required />
    </label>
  );
}
