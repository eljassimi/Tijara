import { getTranslations } from "next-intl/server";

import { FormNotice, WorkflowHeader } from "@/components/workflow-ui";
import { Link } from "@/i18n/navigation";
import { prisma } from "@/lib/prisma";
import {
  requireRole,
  sessionUserCan,
} from "@/server/auth/session";
import {
  saveSettingsAction,
  updateStaffBankAction,
  updateStaffPasswordAction,
  updateStaffProfileAction,
} from "@/server/operations/actions";

export default async function AdminSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "fr" | "ar" }>;
  searchParams: Promise<{ status?: string; tab?: string }>;
}) {
  const { locale } = await params;
  const { status, tab: requestedTab } = await searchParams;
  const user = await requireRole(locale, [
    "SUPER_ADMIN",
    "CATALOG_MANAGER",
    "CONFIRMATION_AGENT",
    "FINANCE",
    "SUPPORT",
  ]);
  const canOps = sessionUserCan(user, "settings:manage");
  const [t, adminT, values, profile] = await Promise.all([
    getTranslations("Workflow"),
    getTranslations("Admin"),
    canOps ? prisma.setting.findMany() : Promise.resolve([]),
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        name: true,
        email: true,
        phone: true,
        bankName: true,
        rib: true,
      },
    }),
  ]);
  const isSuperAdmin = user.role === "SUPER_ADMIN";
  const isFinance = user.role === "FINANCE" || isSuperAdmin;
  const adminLinks = [
    ...(isSuperAdmin
      ? [
          {
            href: "/admin/confirmation/dashboard" as const,
            label: adminT("confirmatorDashboardAdmin"),
          },
          { href: "/admin/team" as const, label: adminT("team") },
          { href: "/admin/couriers" as const, label: adminT("couriers") },
          { href: "/admin/content" as const, label: adminT("content") },
          { href: "/admin/audit" as const, label: adminT("audit") },
          { href: "/admin/jobs" as const, label: adminT("jobs") },
        ]
      : []),
    ...(isFinance
      ? [
          {
            href: "/admin/confirmator-payouts" as const,
            label: adminT("confirmatorPayouts"),
          },
        ]
      : []),
  ];
  const setting = (key: string, fallback: string | number) =>
    String(values.find((item) => item.key === key)?.value ?? fallback);

  const tab =
    requestedTab === "profile"
      ? "profile"
      : requestedTab === "password"
        ? "password"
        : requestedTab === "operations" && canOps
          ? "operations"
          : requestedTab === "bank"
            ? "bank"
            : canOps
              ? "operations"
              : "bank";

  const copy =
    locale === "ar"
      ? {
          profile: "الملف الشخصي",
          bank: "البنك",
          password: "كلمة المرور",
          operations: "قواعد العمليات",
          current: "كلمة المرور الحالية",
          confirm: "تأكيد كلمة المرور الجديدة",
          bankHelp: "احفظ بنكك وRIB مرة واحدة. يمكنك تحديثهما لاحقاً.",
          saveBank: "حفظ المعلومات البنكية",
          savePassword: "تغيير كلمة المرور",
          saveProfile: "حفظ الملف",
        }
      : {
          profile: "Profil",
          bank: "Banque",
          password: "Mot de passe",
          operations: "Règles opérationnelles",
          current: "Mot de passe actuel",
          confirm: "Confirmer le nouveau mot de passe",
          bankHelp:
            "Enregistrez votre banque et votre RIB une seule fois. Vous pourrez les modifier ensuite.",
          saveBank: "Enregistrer la banque",
          savePassword: "Changer le mot de passe",
          saveProfile: "Enregistrer le profil",
        };

  return (
    <main>
      <WorkflowHeader
        eyebrow=""
        title={locale === "ar" ? "الإعدادات" : "Paramètres"}
        body={
          locale === "ar"
            ? "إدارة حسابك والمعلومات البنكية المستخدمة في التحويلات."
            : "Gérez votre compte et les coordonnées bancaires utilisées pour les virements."
        }
      />
      <FormNotice
        status={status}
        messages={{
          updated: t("statusUpdated"),
          "profile-updated":
            locale === "ar" ? "تم حفظ الملف الشخصي." : "Profil enregistré.",
          "bank-updated":
            locale === "ar"
              ? "تم حفظ المعلومات البنكية."
              : "Coordonnées bancaires enregistrées.",
          "password-updated":
            locale === "ar" ? "تم تغيير كلمة المرور." : "Mot de passe modifié.",
          "bank-required":
            locale === "ar"
              ? "أضف بنكك وRIB قبل طلب تحويل."
              : "Ajoutez votre banque et votre RIB avant de demander un virement.",
          invalid: t("invalid"),
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

      {adminLinks.length > 0 ? (
        <section className="settings-hub">
          <div className="settings-hub__intro">
            <h2>{adminT("settingsHub")}</h2>
            <p>{adminT("settingsHubBody")}</p>
          </div>
          <div className="settings-hub__links">
            {adminLinks.map((item) => (
              <Link key={item.href} className="settings-hub__link" href={item.href}>
                {item.label}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <nav className="settings-tabs">
        {canOps ? (
          <Link
            className={tab === "operations" ? "is-active" : ""}
            href={{ pathname: "/admin/settings", query: { tab: "operations" } }}
          >
            {copy.operations}
          </Link>
        ) : null}
        <Link
          className={tab === "bank" ? "is-active" : ""}
          href={{ pathname: "/admin/settings", query: { tab: "bank" } }}
        >
          {copy.bank}
        </Link>
        <Link
          className={tab === "profile" ? "is-active" : ""}
          href={{ pathname: "/admin/settings", query: { tab: "profile" } }}
        >
          {copy.profile}
        </Link>
        <Link
          className={tab === "password" ? "is-active" : ""}
          href={{ pathname: "/admin/settings", query: { tab: "password" } }}
        >
          {copy.password}
        </Link>
      </nav>

      {tab === "operations" && canOps ? (
        <form
          action={saveSettingsAction}
          className="workflow-form workflow-form--wide"
        >
          <input type="hidden" name="locale" value={locale} />
          <label className="field">
            <span>{t("weekdayCutoff")}</span>
            <input
              name="weekdayCutoff"
              type="time"
              defaultValue={setting("weekdayCutoff", "18:00")}
              required
            />
            <small>
              Heure de Casablanca utilisée pour les expéditions du lundi au
              vendredi.
            </small>
          </label>
          <label className="field">
            <span>{t("saturdayCutoff")}</span>
            <input
              name="saturdayCutoff"
              type="time"
              defaultValue={setting("saturdayCutoff", "15:30")}
              required
            />
            <small>Limite du samedi avant report au lundi.</small>
          </label>
          <label className="field">
            <span>{t("unreachableDays")}</span>
            <input
              name="unreachableDays"
              type="number"
              min="1"
              max="14"
              defaultValue={setting("unreachableDays", 4)}
              required
            />
            <small>Délai avant classement automatique comme injoignable.</small>
          </label>
          <label className="field">
            <span>{t("proThreshold")}</span>
            <input
              name="proThreshold"
              type="number"
              min="1"
              defaultValue={setting("proThreshold", 25)}
              required
            />
            <small>Livraisons nécessaires pour passer de Starter à Pro.</small>
          </label>
          <label className="field">
            <span>{t("masterThreshold")}</span>
            <input
              name="masterThreshold"
              type="number"
              min="2"
              defaultValue={setting("masterThreshold", 100)}
              required
            />
            <small>Livraisons nécessaires pour passer de Pro à Master.</small>
          </label>
          <label className="field">
            <span>{t("confirmationRewardDh")}</span>
            <input
              name="confirmationRewardDh"
              type="number"
              min="0"
              step="0.5"
              defaultValue={setting("confirmationRewardDh", 10)}
              required
            />
            <small>
              {locale === "ar"
                ? "المبلغ الذي يحصل عليه مؤكد الطلبات عند تأكيد الطلب وتسليمه."
                : "Montant versé au confirmateur pour chaque commande confirmée puis livrée."}
            </small>
          </label>
          <button
            className="button button--primary workflow-form__submit"
            type="submit"
          >
            {t("saveSettings")}
          </button>
        </form>
      ) : null}

      {tab === "bank" ? (
        <form
          action={updateStaffBankAction}
          className="workflow-form workflow-form--wide"
        >
          <input type="hidden" name="locale" value={locale} />
          <p className="workflow-form__notice">{copy.bankHelp}</p>
          <label className="field">
            <span>{t("bankName")}</span>
            <input name="bankName" defaultValue={profile.bankName ?? ""} />
          </label>
          <label className="field">
            <span>{t("rib")}</span>
            <input
              name="rib"
              inputMode="numeric"
              minLength={24}
              maxLength={29}
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
      ) : null}

      {tab === "profile" ? (
        <form
          action={updateStaffProfileAction}
          className="workflow-form workflow-form--wide"
        >
          <input type="hidden" name="locale" value={locale} />
          <label className="field">
            <span>{locale === "ar" ? "الاسم" : "Nom"}</span>
            <input
              name="name"
              defaultValue={profile.name}
              required
              minLength={2}
            />
          </label>
          <label className="field">
            <span>{locale === "ar" ? "البريد" : "E-mail"}</span>
            <input value={profile.email} disabled readOnly />
          </label>
          <label className="field">
            <span>{locale === "ar" ? "الهاتف" : "Téléphone"}</span>
            <input
              name="phone"
              defaultValue={profile.phone ?? ""}
            />
          </label>
          <button
            className="button button--primary workflow-form__submit"
            type="submit"
          >
            {copy.saveProfile}
          </button>
        </form>
      ) : null}

      {tab === "password" ? (
        <form
          action={updateStaffPasswordAction}
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
              autoComplete="new-password"
              minLength={10}
              required
            />
          </label>
          <label className="field">
            <span>{copy.confirm}</span>
            <input
              name="confirmation"
              type="password"
              autoComplete="new-password"
              minLength={10}
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
      ) : null}
    </main>
  );
}
