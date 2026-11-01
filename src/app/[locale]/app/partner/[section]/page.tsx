import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { DataModule, type DataRow } from "@/components/data-module";
import { formatMoney } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/server/auth/session";

const sections = [
  "orders",
  "invoices",
  "wallet",
  "team",
  "support",
  "tickets",
  "settings",
] as const;
type Section = (typeof sections)[number];

export default async function PartnerSectionPage({
  params,
}: {
  params: Promise<{ locale: "fr" | "ar"; section: string }>;
}) {
  const { locale, section } = await params;
  if (!sections.includes(section as Section)) notFound();
  const [partner, mod] = await Promise.all([
    getTranslations("Partner"),
    getTranslations("Module"),
  ]);
  const user = await getSessionUser();
  if (!user) notFound();
  const affiliate = await prisma.affiliateProfile.findUnique({
    where: { userId: user.id },
  });
  if (!affiliate) notFound();
  let rows: DataRow[] = [];
  if (section === "orders")
    rows = (
      await prisma.order.findMany({
        where: { affiliateId: affiliate.id },
        include: { lines: true },
        orderBy: { createdAt: "desc" },
      })
    ).map((item) => ({
      reference: item.code,
      detail: `${item.customerName} · ${formatMoney(
        item.lines.reduce(
          (sum, line) => sum + Number(line.salePrice) * line.quantity,
          0,
        ),
        locale,
      )}`,
      status:
        item.deliveryStatus === "NOT_READY"
          ? item.confirmationStatus
          : item.deliveryStatus,
    }));
  if (section === "invoices")
    rows = (
      await prisma.invoice.findMany({
        where: { affiliateId: affiliate.id },
        orderBy: { createdAt: "desc" },
      })
    ).map((item) => ({
      reference: item.number,
      detail: formatMoney(String(item.totalCommission), locale),
      status: item.status,
    }));
  if (section === "wallet")
    rows = (
      await prisma.walletTransaction.findMany({
        where: { affiliateId: affiliate.id },
        orderBy: { createdAt: "desc" },
      })
    ).map((item) => ({
      reference: item.reference,
      detail: formatMoney(String(item.amount), locale),
      status: item.status,
    }));
  if (section === "team")
    rows = (
      await prisma.affiliateStaff.findMany({
        where: { affiliateProfileId: affiliate.id },
        include: { user: true },
      })
    ).map((item) => ({
      reference: item.user.name,
      detail: item.user.email,
      status: item.active ? "ACTIVE" : "INACTIVE",
    }));
  if (section === "tickets")
    rows = (
      await prisma.ticket.findMany({
        where: { affiliateId: affiliate.id },
        orderBy: { createdAt: "desc" },
      })
    ).map((item) => ({
      reference: item.code,
      detail: item.subject,
      status: item.status,
    }));
  if (section === "settings")
    rows = [
      {
        reference: user.name,
        detail: `${user.email} · ${affiliate.city ?? "—"}`,
        status: user.status,
      },
    ];
  if (section === "support" && affiliate.supportAgentId)
    rows = (
      await prisma.supportAgent.findMany({
        where: { id: affiliate.supportAgentId },
        include: { user: true },
      })
    ).map((item) => ({
      reference: item.user.name,
      detail: item.whatsapp,
      status: item.active ? "ACTIVE" : "INACTIVE",
    }));
  return (
    <DataModule
      title={partner(section as Section)}
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
