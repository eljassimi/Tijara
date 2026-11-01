import { getTranslations } from "next-intl/server";
import { LogOut } from "lucide-react";

import { FormNotice, WorkflowHeader } from "@/components/workflow-ui";
import { Link } from "@/i18n/navigation";
import { prisma } from "@/lib/prisma";
import { logoutAction } from "@/server/auth/actions";
import { requirePermission } from "@/server/auth/session";
import { affiliateIdFor } from "@/server/orders/service";
import {
  updateBankAction,
  updatePasswordAction,
  updateProfileAction,
} from "@/server/operations/actions";

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "fr" | "ar" }>;
  searchParams: Promise<{ status?: string; tab?: string }>;
}) {
  const { locale } = await params;
  const { status, tab: requestedTab } = await searchParams;
  const user = await requirePermission(locale, "profile:manage");
  const affiliateId = await affiliateIdFor(user.id, user.role);
  const [t, affiliate] = await Promise.all([
    getTranslations("Workflow"),
    prisma.affiliateProfile.findUniqueOrThrow({ where: { id: affiliateId } }),
  ]);
  const isOwner = user.role === "AFFILIATE";
  const tab =
    isOwner && requestedTab === "profile"
      ? "profile"
      : isOwner && requestedTab === "password"
        ? "password"
        : "bank";
  const logout = logoutAction.bind(null, locale);
  const copy =
    locale === "ar"
      ? {
          profile: "الملف الشخصي",
          bank: "البنك",
          password: "كلمة المرور",
          current: "كلمة المرور الحالية",
          confirm: "تأكيد كلمة المرور الجديدة",
          bankHelp: "المعلومات البنكية اختيارية حتى أول طلب تحويل.",
          saveBank: "حفظ المعلومات البنكية",
          savePassword: "تغيير كلمة المرور",
        }
      : {
          profile: "Profil",
          bank: "Banque",
          password: "Mot de passe",
          current: "Mot de passe actuel",
          confirm: "Confirmer le nouveau mot de passe",
          bankHelp:
            "Les coordonnées bancaires restent facultatives jusqu’à votre premier virement.",
          saveBank: "Enregistrer la banque",
          savePassword: "Changer le mot de passe",
        };
  return (
    <main>
      <WorkflowHeader
        eyebrow=""
        title={t("settingsTitle")}
        body={t("settingsBody")}
      />
      <FormNotice
        status={status}
        messages={{
          "profile-updated":
            locale === "ar" ? "تم حفظ الملف الشخصي." : "Profil enregistré.",
          "bank-updated":
            locale === "ar"
              ? "تم حفظ المعلومات البنكية."
              : "Coordonnées bancaires enregistrées.",
          "password-updated":
            locale === "ar" ? "تم تغيير كلمة المرور." : "Mot de passe modifié.",
          invalid: t("invalid"),
          "bank-required":
            locale === "ar"
              ? "أضف حسابك البنكي لاستلام التحويلات."
              : "Ajoutez votre RIB pour recevoir vos virements.",
          "current-password":
            locale === "ar"
              ? "كلمة المرور الحالية غير صحيحة."
              : "Le mot de passe actuel est incorrect.",
          "password-mismatch":
            locale === "ar"
              ? "كلمتا المرور غير متطابقتين."
              : "Les deux nouveaux mots de passe ne correspondent pas.",
        }}
      />
      <nav className="settings-tabs">
        {isOwner && (
          <Link
            className={tab === "profile" ? "is-active" : ""}
            href={{
              pathname: "/app/partner/settings",
              query: { tab: "profile" },
            }}
          >
            {copy.profile}
          </Link>
        )}
        <Link
          className={tab === "bank" ? "is-active" : ""}
          href={{ pathname: "/app/partner/settings", query: { tab: "bank" } }}
        >
          {copy.bank}
        </Link>
        {isOwner && (
          <Link
            className={tab === "password" ? "is-active" : ""}
            href={{
              pathname: "/app/partner/settings",
              query: { tab: "password" },
            }}
          >
            {copy.password}
          </Link>
        )}
      </nav>
      {tab === "profile" && isOwner && (
        <form
          action={updateProfileAction}
          className="workflow-form workflow-form--wide"
        >
          <input type="hidden" name="locale" value={locale} />
          <label className="field">
            <span>{t("name")}</span>
            <input name="name" defaultValue={user.name} required />
          </label>
          <label className="field">
            <span>{t("phone")}</span>
            <input
              name="phone"
              defaultValue={user.phone ?? ""}
              placeholder="06XXXXXXXX"
              required
            />
          </label>
          <label className="field workflow-form__span">
            <span>{t("socialPage")}</span>
            <input
              name="socialPage"
              type="url"
              defaultValue={affiliate.socialPage ?? ""}
            />
          </label>
          <button
            className="button button--primary workflow-form__submit"
            type="submit"
          >
            {t("saveChanges")}
          </button>
        </form>
      )}
      {tab === "bank" && (
        <form
          action={updateBankAction}
          className="workflow-form workflow-form--wide"
        >
          <input type="hidden" name="locale" value={locale} />
          <p className="workflow-form__notice">{copy.bankHelp}</p>
          <label className="field">
            <span>{t("bankName")}</span>
            <input name="bankName" defaultValue={affiliate.bankName ?? ""} />
          </label>
          <label className="field">
            <span>{t("rib")}</span>
            <input
              name="rib"
              inputMode="numeric"
              minLength={24}
              maxLength={29}
              placeholder={
                affiliate.rib
                  ? `•••• •••• •••• •••• •••• ${affiliate.rib.slice(-4)}`
                  : "24 chiffres"
              }
            />
            <small>
              {locale === "ar"
                ? "24 رقماً. اتركه فارغاً للاحتفاظ بالحساب الحالي."
                : "24 chiffres. Laissez vide pour conserver le RIB actuel."}
            </small>
          </label>
          <label className="field workflow-form__span">
            <span>{copy.current}</span>
            <input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
            />
            <small>
              {locale === "ar"
                ? "مطلوبة فقط عند تغيير المعلومات البنكية."
                : "Requis uniquement pour modifier les coordonnées bancaires."}
            </small>
          </label>
          <button
            className="button button--primary workflow-form__submit"
            type="submit"
          >
            {copy.saveBank}
          </button>
        </form>
      )}
      {tab === "password" && isOwner && (
        <form
          action={updatePasswordAction}
          className="workflow-form workflow-form--wide"
        >
          <input type="hidden" name="locale" value={locale} />
          <label className="field workflow-form__span">
            <span>{copy.current}</span>
            <input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <label className="field">
            <span>{t("newPassword")}</span>
            <input
              name="password"
              type="password"
              minLength={10}
              autoComplete="new-password"
              required
            />
          </label>
          <label className="field">
            <span>{copy.confirm}</span>
            <input
              name="confirmation"
              type="password"
              minLength={10}
              autoComplete="new-password"
              required
            />
          </label>
          <button
            className="button button--primary workflow-form__submit"
            type="submit"
          >
            {copy.savePassword}
          </button>
        </form>
      )}
      <form action={logout} className="settings-logout">
        <button className="button" type="submit">
          <LogOut size={17} />
          {locale === "ar" ? "تسجيل الخروج" : "Déconnexion"}
        </button>
      </form>
    </main>
  );
}
