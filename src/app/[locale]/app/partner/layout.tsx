import {
  Boxes,
  FileText,
  Gauge,
  Headphones,
  Megaphone,
  MessageSquare,
  PackageSearch,
  Settings,
  Users,
  WalletCards,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

import { AppShell, type ShellItem } from "@/components/app-shell";
import { prisma } from "@/lib/prisma";
import { affiliateIdFor } from "@/server/orders/service";
import { requireRole, sessionUserCan } from "@/server/auth/session";
import { unreadChatMessageCount } from "@/server/chat/service";
import { cleanDemoLabel } from "@/lib/display-text";

export default async function PartnerLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await requireRole(locale, ["AFFILIATE", "AFFILIATE_STAFF"]);
  const t = await getTranslations("Partner");
  const common = await getTranslations("Common");
  const affiliateProfileId = await affiliateIdFor(user.id, user.role);
  const cart = await prisma.cart.findUnique({
    where: {
      affiliateProfileId_createdById: {
        affiliateProfileId,
        createdById: user.id,
      },
    },
    include: { items: true },
  });
  const cartCount =
    cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  const [notificationCount, chatUnread] = await Promise.all([
    prisma.notification.count({
      where: { userId: user.id, readAt: null },
    }),
    unreadChatMessageCount(user.id),
  ]);
  const items: ShellItem[] = [
    {
      label: t("dashboard"),
      mobileLabel: locale === "ar" ? "الرئيسية" : "Accueil",
      mobilePrimary: true,
      href: "/app/partner",
      icon: Gauge,
    },
    ...(sessionUserCan(user, "orders:view")
      ? [
          {
            label: t("products"),
            mobileLabel: locale === "ar" ? "المنتجات" : "Produits",
            mobilePrimary: true,
            href: "/app/partner/products",
            icon: Boxes,
          },
          {
            label: t("orders"),
            mobileLabel: locale === "ar" ? "الطلبات" : "Commandes",
            mobilePrimary: true,
            href: "/app/partner/orders",
            icon: PackageSearch,
          },
          {
            label: locale === "ar" ? "المساعدة" : "Aide",
            href: "/app/partner/tickets",
            icon: Headphones,
          },
        ]
      : []),
    {
      label: t("chat"),
      mobileLabel: locale === "ar" ? "دردشة" : "Chat",
      href: "/app/partner/chat",
      icon: MessageSquare,
      badge: chatUnread,
      liveChatBadge: true,
    },
    {
      label: t("announcements"),
      href: "/app/partner/announcements",
      icon: Megaphone,
    },
    ...(sessionUserCan(user, "wallet:view")
      ? [
          {
            label: t("invoices"),
            href: "/app/partner/invoices",
            icon: FileText,
          },
          {
            label: t("wallet"),
            mobileLabel: locale === "ar" ? "المحفظة" : "Portefeuille",
            mobilePrimary: true,
            href: "/app/partner/wallet",
            icon: WalletCards,
          },
        ]
      : []),
    ...(sessionUserCan(user, "team:manage")
      ? [{ label: t("team"), href: "/app/partner/team", icon: Users }]
      : []),
    ...(sessionUserCan(user, "profile:manage")
      ? [
          {
            label: t("settings"),
            href: "/app/partner/settings",
            icon: Settings,
          },
        ]
      : []),
  ];
  return (
    <AppShell
      areaLabel={t("area")}
      items={items}
      showCart
      cartCount={cartCount}
      notificationCount={notificationCount}
      notificationHref="/app/partner/notifications"
      locale={locale}
      logoutLabel={common("logout")}
      userName={cleanDemoLabel(user.name)}
    >
      {children}
    </AppShell>
  );
}
