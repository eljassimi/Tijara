import { ShieldCheck, UserCog, Users } from "lucide-react";

import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { CustomSelect } from "@/components/ui/custom-select";
import {
  FormNotice,
  StatusPill,
  WorkflowHeader,
} from "@/components/workflow-ui";
import { prisma } from "@/lib/prisma";
import { statusLabel } from "@/lib/status";
import { requireRole } from "@/server/auth/session";
import {
  createOperationsTeamMemberAction,
  toggleOperationsTeamMemberAction,
  updateOperationsTeamRoleAction,
} from "@/server/operations/actions";

const operationsRoles = [
  "CONFIRMATION_AGENT",
  "CATALOG_MANAGER",
  "FINANCE",
  "SUPPORT",
  "SUPER_ADMIN",
] as const;

function roleLabel(
  role: (typeof operationsRoles)[number],
  locale: "fr" | "ar",
) {
  const labels = {
    CONFIRMATION_AGENT:
      locale === "ar"
        ? "التأكيد والإرسال للتوصيل"
        : "Confirmation et expédition",
    CATALOG_MANAGER: locale === "ar" ? "إدارة الكتالوج" : "Catalogue",
    FINANCE: locale === "ar" ? "المالية" : "Finance",
    SUPPORT: locale === "ar" ? "الدعم" : "Support",
    SUPER_ADMIN: locale === "ar" ? "مدير عام" : "Super administrateur",
  };
  return labels[role];
}

export default async function OperationsTeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "fr" | "ar" }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale } = await params;
  const { status } = await searchParams;
  const actor = await requireRole(locale, ["SUPER_ADMIN"]);
  const members = await prisma.user.findMany({
    where: { role: { in: [...operationsRoles] } },
    orderBy: { name: "asc" },
  });
  const activeCount = members.filter(
    (member) => member.status === "ACTIVE",
  ).length;

  return (
    <main>
      <WorkflowHeader
        eyebrow=""
        title={locale === "ar" ? "فريق الإدارة" : "Équipe administrative"}
        body={
          locale === "ar"
            ? "أنشئ وصولاً واضحاً لكل عضو حسب عمله اليومي. فريق التأكيد يتولى التأكيد والإرسال لشركة التوصيل."
            : "Attribuez à chaque membre un accès adapté à son travail quotidien. La confirmation gère aussi la remise au transporteur."
        }
      />
      <FormNotice
        status={status}
        messages={{
          created:
            locale === "ar" ? "تمت إضافة الموظف." : "Le membre a été ajouté.",
          updated:
            locale === "ar" ? "تم تحديث الوصول." : "L’accès a été mis à jour.",
          "role-updated":
            locale === "ar"
              ? "تم تغيير الدور وتسجيل خروج العضو لتطبيق الصلاحيات."
              : "Le rôle a été modifié. La session du membre a été fermée pour appliquer ses accès.",
          "self-change":
            locale === "ar"
              ? "لا يمكنك تغيير دورك أو تعطيل حسابك من هنا."
              : "Vous ne pouvez pas modifier votre propre rôle ou désactiver votre compte ici.",
          duplicate:
            locale === "ar"
              ? "هذا البريد مستخدم مسبقاً."
              : "Cette adresse e-mail est déjà utilisée.",
          invalid:
            locale === "ar"
              ? "تحقق من معلومات الموظف."
              : "Vérifiez les informations du membre.",
          failed:
            locale === "ar"
              ? "تعذر إضافة الموظف. أعد تحميل الصفحة ثم حاول مرة أخرى."
              : "Impossible d’ajouter le membre. Rechargez la page puis réessayez.",
        }}
      />

      <div className="operations-metrics operations-metrics--two">
        <article>
          <Users size={20} />
          <span>{locale === "ar" ? "أعضاء الفريق" : "Membres"}</span>
          <strong>{members.length}</strong>
        </article>
        <article>
          <ShieldCheck size={20} />
          <span>{locale === "ar" ? "وصول نشط" : "Accès actifs"}</span>
          <strong>{activeCount}</strong>
        </article>
      </div>

      <form
        action={createOperationsTeamMemberAction}
        className="workflow-form operations-team-form"
        autoComplete="off"
      >
        <input type="hidden" name="locale" value={locale} />
        <label className="field">
          <span>{locale === "ar" ? "الاسم الكامل" : "Nom complet"}</span>
          <input name="name" required minLength={2} autoComplete="off" />
        </label>
        <label className="field">
          <span>{locale === "ar" ? "البريد الإلكتروني" : "E-mail"}</span>
          <input name="email" type="email" required autoComplete="off" />
        </label>
        <label className="field">
          <span>
            {locale === "ar" ? "كلمة المرور الأولى" : "Mot de passe initial"}
          </span>
          <input
            name="password"
            type="password"
            minLength={10}
            required
            autoComplete="new-password"
          />
        </label>
        <label className="field operations-team-form__role-field">
          <span>{locale === "ar" ? "الدور" : "Rôle"}</span>
          <CustomSelect
            name="role"
            locale={locale}
            label={locale === "ar" ? "دور العضو" : "Rôle du membre"}
            defaultValue="CONFIRMATION_AGENT"
            required
            options={operationsRoles.map((role) => ({
              value: role,
              label: roleLabel(role, locale),
            }))}
          />
        </label>
        <button
          className="button button--primary workflow-form__submit"
          type="submit"
        >
          <UserCog size={17} />
          {locale === "ar" ? "إضافة الموظف" : "Ajouter le membre"}
        </button>
      </form>

      <section className="operations-team-list section-gap">
        {members.length ? (
          members.map((member) => (
            <article key={member.id}>
              <div className="operations-team-list__identity">
                <span className="operations-team-list__avatar">
                  {member.name.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <strong>{member.name}</strong>
                  <small>{member.email}</small>
                </div>
              </div>
              <form
                action={updateOperationsTeamRoleAction}
                className="operations-team-list__role-form"
              >
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="userId" value={member.id} />
                <CustomSelect
                  name="role"
                  locale={locale}
                  label={locale === "ar" ? "الدور" : "Rôle"}
                  defaultValue={member.role}
                  disabled={member.id === actor.id}
                  options={operationsRoles.map((role) => ({
                    value: role,
                    label: roleLabel(role, locale),
                  }))}
                />
                {member.id !== actor.id && (
                  <button className="button button--compact" type="submit">
                    {locale === "ar" ? "حفظ الدور" : "Enregistrer le rôle"}
                  </button>
                )}
              </form>
              <StatusPill>{statusLabel(member.status, locale)}</StatusPill>
              <form action={toggleOperationsTeamMemberAction}>
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="userId" value={member.id} />
                <input
                  type="hidden"
                  name="currentStatus"
                  value={member.status}
                />
                <ConfirmSubmitButton
                  className="button button--compact"
                  type="submit"
                  disabled={member.id === actor.id}
                  confirmMessage={
                    member.status === "ACTIVE"
                      ? locale === "ar"
                        ? `تعطيل وصول ${member.name}؟`
                        : `Désactiver l’accès de ${member.name} ?`
                      : locale === "ar"
                        ? `تفعيل وصول ${member.name}؟`
                        : `Activer l’accès de ${member.name} ?`
                  }
                >
                  {member.status === "ACTIVE"
                    ? locale === "ar"
                      ? "تعطيل الوصول"
                      : "Désactiver"
                    : locale === "ar"
                      ? "تفعيل الوصول"
                      : "Activer"}
                </ConfirmSubmitButton>
              </form>
            </article>
          ))
        ) : (
          <p className="queue-empty">
            {locale === "ar"
              ? "لا يوجد أعضاء بعد."
              : "Aucun membre pour le moment."}
          </p>
        )}
      </section>
    </main>
  );
}
