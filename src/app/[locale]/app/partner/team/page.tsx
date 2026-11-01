import { getTranslations } from "next-intl/server";

import {
  FormNotice,
  StatusPill,
  WorkflowHeader,
} from "@/components/workflow-ui";
import { prisma } from "@/lib/prisma";
import { statusLabel } from "@/lib/status";
import { requirePermission } from "@/server/auth/session";
import { affiliateIdFor } from "@/server/orders/service";
import {
  inviteStaffAction,
  updateStaffAction,
} from "@/server/operations/actions";

const permissionLabels = {
  CREATE_ORDERS: "createOrdersPermission",
  VIEW_ORDERS: "viewOrdersPermission",
  VIEW_WALLET: "viewWalletPermission",
  REQUEST_PAYOUTS: "requestPayoutsPermission",
  MANAGE_BANK_DETAILS: "bankPermission",
  MANAGE_STAFF: "staffPermission",
} as const;

export default async function TeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "fr" | "ar" }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale } = await params;
  const { status } = await searchParams;
  const user = await requirePermission(locale, "team:manage");
  const affiliateProfileId = await affiliateIdFor(user.id, user.role);
  const affiliate = await prisma.affiliateProfile.findUniqueOrThrow({
    where: { id: affiliateProfileId },
  });
  const [t, staff] = await Promise.all([
    getTranslations("Workflow"),
    prisma.affiliateStaff.findMany({
      where: { affiliateProfileId: affiliate.id },
      include: { user: true, permissions: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return (
    <main>
      <WorkflowHeader
        eyebrow={t("live")}
        title={t("teamTitle")}
        body={t("teamBody")}
      />
      <FormNotice
        status={status}
        messages={{
          created:
            locale === "ar" ? "تمت إضافة المتعاون." : "Collaborateur ajouté.",
          updated:
            locale === "ar"
              ? "تم حفظ صلاحيات المتعاون."
              : "Permissions du collaborateur enregistrées.",
          invalid: t("invalid"),
          failed:
            locale === "ar"
              ? "تعذر حفظ المتعاون. تحقق من أن البريد غير مستخدم."
              : "Le collaborateur n’a pas pu être enregistré. Vérifiez que l’e-mail n’est pas déjà utilisé.",
        }}
      />
      <form action={inviteStaffAction} className="inline-create team-create">
        <input type="hidden" name="locale" value={locale} />
        <label>
          <span>{t("name")}</span>
          <input name="name" required />
        </label>
        <label>
          <span>{t("staffEmail")}</span>
          <input name="email" type="email" required />
        </label>
        <label>
          <span>{t("phone")}</span>
          <input name="phone" />
        </label>
        <label>
          <span>{t("temporaryPassword")}</span>
          <input name="password" type="password" minLength={10} required />
        </label>
        <fieldset className="staff-create-permissions">
          <legend>{t("permissions")}</legend>
          {Object.entries(permissionLabels).map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                name={key}
                defaultChecked={
                  key === "CREATE_ORDERS" || key === "VIEW_ORDERS"
                }
              />
              {t(label)}
            </label>
          ))}
        </fieldset>
        <button className="button button--primary" type="submit">
          {t("inviteStaff")}
        </button>
      </form>
      <div className="work-queue section-gap">
        {staff.length ? (
          staff.map((member) => (
            <article className="queue-card" key={member.id}>
              <div className="queue-card__summary">
                <div>
                  <strong>{member.user.name}</strong>
                  <span>
                    {member.user.email} · {member.user.phone ?? "—"}
                  </span>
                </div>
                <StatusPill>
                  {statusLabel(member.active ? "ACTIVE" : "INACTIVE", locale)}
                </StatusPill>
              </div>
              <form action={updateStaffAction} className="staff-permissions">
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="staffId" value={member.id} />
                <input
                  type="hidden"
                  name="currentActive"
                  value={String(member.active)}
                />
                <strong>{t("permissions")}</strong>
                {Object.entries(permissionLabels).map(([key, label]) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      name={key}
                      defaultChecked={member.permissions.some(
                        (item) => item.key === key && item.enabled,
                      )}
                    />
                    {t(label)}
                  </label>
                ))}
                <button
                  className="button button--primary button--compact"
                  name="intent"
                  value="save"
                  type="submit"
                >
                  {t("savePermissions")}
                </button>
                <button
                  className="button button--compact"
                  name="intent"
                  value="toggle"
                  type="submit"
                >
                  {member.active ? t("deactivate") : t("reactivate")}
                </button>
              </form>
            </article>
          ))
        ) : (
          <p className="queue-empty">{t("noRecords")}</p>
        )}
      </div>
    </main>
  );
}
