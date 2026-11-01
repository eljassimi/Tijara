import {
  BadgeDollarSign,
  Banknote,
  Boxes,
  ClipboardList,
  Gauge,
  Headphones,
  History,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  PhoneCall,
  Settings,
  Truck,
  Users,
  UserRoundCog,
  WalletCards,
  Workflow,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

import { AppShell, type ShellItem } from "@/components/app-shell";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/server/auth/session";
import { unreadChatMessageCount } from "@/server/chat/service";
import type { AppRole } from "@/lib/permissions";

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await requireRole(locale, [
    "SUPER_ADMIN",
    "CATALOG_MANAGER",
    "CONFIRMATION_AGENT",
    "FINANCE",
    "SUPPORT",
  ]);
  const t = await getTranslations("Admin");
  const common = await getTranslations("Common");
  const [notificationCount, chatUnread] = await Promise.all([
    prisma.notification.count({
      where: { userId: user.id, readAt: null },
    }),
    unreadChatMessageCount(user.id),
  ]);
  const nav: Array<ShellItem & { roles: readonly AppRole[] }> = [
    {
      label: t("overview"),
      href: "/admin",
      icon: Gauge,
      roles: ["SUPER_ADMIN", "FINANCE"],
    },
    {
      label: t("affiliates"),
      href: "/admin/affiliates",
      icon: Users,
      roles: ["SUPER_ADMIN"],
    },
    {
      label: t("catalog"),
      href: "/admin/catalog",
      icon: Boxes,
      roles: ["SUPER_ADMIN", "CATALOG_MANAGER"],
    },
    {
      label: t("confirmatorDashboard"),
      href: "/admin/confirmation/dashboard",
      icon: LayoutDashboard,
      roles: ["SUPER_ADMIN", "CONFIRMATION_AGENT"],
    },
    {
      label: t("orders"),
      href: "/admin/orders",
      icon: ClipboardList,
      roles: ["SUPER_ADMIN", "CONFIRMATION_AGENT", "FINANCE", "SUPPORT"],
    },
    {
      label: t("confirmation"),
      href: "/admin/confirmation",
      icon: PhoneCall,
      roles: ["SUPER_ADMIN", "CONFIRMATION_AGENT"],
    },
    {
      label: t("confirmatorPayments"),
      href: "/admin/confirmation/payments",
      icon: WalletCards,
      roles: ["CONFIRMATION_AGENT"],
    },
    {
      label: t("logistics"),
      href: "/admin/logistics",
      icon: Truck,
      roles: ["SUPER_ADMIN", "CONFIRMATION_AGENT"],
    },
    {
      label: t("confirmatorPayouts"),
      href: "/admin/confirmator-payouts",
      icon: Banknote,
      roles: ["SUPER_ADMIN", "FINANCE"],
    },
    {
      label: t("couriers"),
      href: "/admin/couriers",
      icon: Truck,
      roles: ["SUPER_ADMIN"],
    },
    {
      label: t("team"),
      href: "/admin/team",
      icon: UserRoundCog,
      roles: ["SUPER_ADMIN"],
    },
    {
      label: t("finance"),
      href: "/admin/finance",
      icon: BadgeDollarSign,
      roles: ["SUPER_ADMIN", "FINANCE"],
    },
    {
      label: t("support"),
      href: "/admin/support",
      icon: Headphones,
      roles: ["SUPER_ADMIN", "SUPPORT"],
    },
    {
      label: t("chat"),
      href: "/admin/chat",
      icon: MessageSquare,
      badge: chatUnread,
      liveChatBadge: true,
      roles: [
        "SUPER_ADMIN",
        "CATALOG_MANAGER",
        "CONFIRMATION_AGENT",
        "FINANCE",
        "SUPPORT",
      ],
    },
    {
      label: t("content"),
      href: "/admin/content",
      icon: Megaphone,
      roles: ["SUPER_ADMIN", "SUPPORT"],
    },
    {
      label: t("settings"),
      href: "/admin/settings",
      icon: Settings,
      roles: [
        "SUPER_ADMIN",
        "CATALOG_MANAGER",
        "CONFIRMATION_AGENT",
        "FINANCE",
        "SUPPORT",
      ],
    },
    {
      label: t("audit"),
      href: "/admin/audit",
      icon: History,
      roles: ["SUPER_ADMIN"],
    },
    {
      label: t("jobs"),
      href: "/admin/jobs",
      icon: Workflow,
      roles: ["SUPER_ADMIN"],
    },
  ];
  const items = nav.filter((item) => item.roles.includes(user.role as AppRole));
  return (
    <AppShell
      areaLabel={t("area")}
      items={items}
      notificationCount={notificationCount}
      notificationHref="/admin/notifications"
      locale={locale}
      logoutLabel={common("logout")}
      userName={user.name}
    >
      {children}
    </AppShell>
  );
}
