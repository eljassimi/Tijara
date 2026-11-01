import { ArrowUpRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Logo } from "@/components/brand/logo";
import { ZelligeField } from "@/components/brand/zellige-field";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Link } from "@/i18n/navigation";
import {
  requestPasswordResetAction,
  resetPasswordAction,
} from "@/server/auth/actions";

export async function PasswordShell({
  locale,
  mode,
  status,
  token,
}: {
  locale: string;
  mode: "forgot" | "reset";
  status?: string;
  token?: string;
}) {
  const [t, common] = await Promise.all([
    getTranslations("Auth"),
    getTranslations("Common"),
  ]);
  const reset = mode === "reset";
  return (
    <main className="auth-page">
      <section className="auth-story">
        <ZelligeField />
        <Link href="/" className="auth-story__logo">
          <Logo inverse />
        </Link>
        <div className="auth-story__copy">
          <h1>{t(reset ? "resetTitle" : "forgotTitle")}</h1>
          <p>{t("forgotBody")}</p>
        </div>
        <p className="auth-story__tagline">{t("loginBody")}</p>
      </section>
      <section className="auth-form-panel">
        <div className="auth-form-panel__top">
          <Link href="/login">{common("login")}</Link>
          <LocaleSwitcher />
        </div>
        <form
          className="auth-form"
          action={reset ? resetPasswordAction : requestPasswordResetAction}
        >
          <input type="hidden" name="locale" value={locale} />
          {reset && <input type="hidden" name="token" value={token ?? ""} />}
          <div className="auth-form__heading">
            <h2>{t(reset ? "resetTitle" : "forgotTitle")}</h2>
            <p>{t("forgotBody")}</p>
          </div>
          {status && ["sent", "expired", "invalid"].includes(status) && (
            <p
              className={`form-notice ${status === "sent" ? "form-notice--success" : ""}`}
            >
              {status === "invalid" ? t("status.invalid") : t(status)}
            </p>
          )}
          {reset ? (
            <>
              <label className="field">
                <span>{t("password")}</span>
                <input
                  name="password"
                  type="password"
                  minLength={10}
                  required
                />
              </label>
              <label className="field">
                <span>{t("confirmPassword")}</span>
                <input
                  name="confirmation"
                  type="password"
                  minLength={10}
                  required
                />
              </label>
            </>
          ) : (
            <label className="field">
              <span>{t("email")}</span>
              <input name="email" type="email" required />
            </label>
          )}
          <button className="button button--primary auth-submit" type="submit">
            {t(reset ? "resetAction" : "sendReset")}
            <ArrowUpRight size={18} />
          </button>
        </form>
      </section>
    </main>
  );
}
