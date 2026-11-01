import { NotificationsPage } from "@/components/notifications-page";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "fr" | "ar" }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale } = await params;
  const { status } = await searchParams;
  return <NotificationsPage locale={locale} area="admin" status={status} />;
}
