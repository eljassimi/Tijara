import { redirect } from "next/navigation";

export default async function PendingOrdersPage({
  params,
}: {
  params: Promise<{ locale: "fr" | "ar" }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/app/partner/orders?confirmation=NEW`);
}
