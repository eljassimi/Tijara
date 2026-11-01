import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { DataModule, type DataRow } from "@/components/data-module";
import { formatMoney } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { formatAppDateTime } from "@/lib/time";
import { requireRole } from "@/server/auth/session";

const sections = [
  "affiliates",
  "catalog",
  "confirmation",
  "logistics",
  "couriers",
  "finance",
  "support",
  "content",
  "settings",
  "audit",
  "jobs",
] as const;
type Section = (typeof sections)[number];

export default async function AdminSectionPage({
  params,
}: {
  params: Promise<{ locale: "fr" | "ar"; section: string }>;
}) {
  const { locale, section } = await params;
  if (!sections.includes(section as Section)) notFound();
  if (section === "audit" || section === "jobs")
    await requireRole(locale, ["SUPER_ADMIN"]);
  const [admin, mod] = await Promise.all([
    getTranslations("Admin"),
    getTranslations("Module"),
  ]);
  let rows: DataRow[] = [];
  if (section === "affiliates")
    rows = (
      await prisma.user.findMany({
        where: { role: "AFFILIATE" },
        orderBy: { createdAt: "desc" },
      })
    ).map((item) => ({
      reference: item.name,
      detail: item.email,
      status: item.status,
    }));
  if (section === "catalog")
    rows = (
      await prisma.product.findMany({
        include: { variants: true },
        orderBy: { createdAt: "desc" },
      })
    ).map((item) => ({
      reference: item.code,
      detail: `${item.nameFr} · ${formatMoney(String(item.salePrice), locale)}`,
      status: item.published ? "PUBLISHED" : "DRAFT",
    }));
  if (section === "confirmation")
    rows = (
      await prisma.order.findMany({
        where: {
          confirmationStatus: {
            notIn: ["CONFIRMED", "CANCELLED", "UNREACHABLE"],
          },
        },
        orderBy: { createdAt: "asc" },
      })
    ).map((item) => ({
      reference: item.code,
      detail: `${item.customerName} · ${item.phone}`,
      status: item.confirmationStatus,
    }));
  if (section === "logistics")
    rows = (
      await prisma.order.findMany({
        where: { confirmationStatus: "CONFIRMED" },
        orderBy: { createdAt: "desc" },
      })
    ).map((item) => ({
      reference: item.code,
      detail: item.customerName,
      status: item.deliveryStatus,
    }));
  if (section === "couriers")
    rows = (await prisma.courier.findMany()).map((item) => ({
      reference: item.name,
      detail: item.phone ?? "—",
      status: item.active ? "ACTIVE" : "INACTIVE",
    }));
  if (section === "finance")
    rows = (
      await prisma.order.findMany({
        where: { deliveryStatus: "DELIVERED" },
        include: { lines: true },
      })
    ).map((item) => ({
      reference: item.code,
      detail: formatMoney(
        item.lines.reduce((sum, line) => sum + Number(line.commission), 0),
        locale,
      ),
      status: item.financeStatus,
    }));
  if (section === "support")
    rows = (
      await prisma.ticket.findMany({ orderBy: { createdAt: "desc" } })
    ).map((item) => ({
      reference: item.code,
      detail: item.subject,
      status: item.status,
    }));
  if (section === "content")
    rows = (
      await prisma.announcement.findMany({ orderBy: { startsAt: "desc" } })
    ).map((item) => ({
      reference: locale === "ar" ? item.titleAr : item.titleFr,
      detail: item.startsAt.toLocaleDateString(locale),
      status: item.published ? "PUBLISHED" : "DRAFT",
    }));
  if (section === "settings")
    rows = (await prisma.setting.findMany()).map((item) => ({
      reference: item.key,
      detail: item.description ?? "—",
      status: "CONFIGURED",
    }));
  if (section === "audit")
    rows = (
      await prisma.auditLog.findMany({
        include: { actor: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      })
    ).map((item) => ({
      reference: `${item.entityType} · ${item.entityId}`,
      detail:
        `${item.actor?.name ?? "Système"} · ${formatAppDateTime(item.createdAt, locale)} · ${item.before ? `Avant ${JSON.stringify(item.before)}` : ""} ${item.after ? `Après ${JSON.stringify(item.after)}` : ""}`.trim(),
      status: item.action,
    }));
  if (section === "jobs")
    rows = (
      await prisma.importJob.findMany({
        include: { createdBy: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      })
    ).map((item) => ({
      reference: item.type,
      detail: `${item.createdBy.name} · ${item.progress}% · ${item.processedRows}/${item.totalRows ?? "—"} · ${item.error ?? formatAppDateTime(item.createdAt, locale)}`,
      status: item.status,
    }));
  return (
    <DataModule
      title={admin(section as Section)}
      body={mod("body")}
      notice={mod("demoNotice")}
      labels={{
        records: mod("records"),
        reference: mod("reference"),
        detail: mod("detail"),
        status: mod("status"),
        empty: mod("empty"),
      }}
      rows={rows}
    />
  );
}
