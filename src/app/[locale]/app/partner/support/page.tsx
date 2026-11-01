import { redirect } from "next/navigation";

export default async function PartnerSupportPage({
  params,
}: {
  params: Promise<{ locale: "fr" | "ar" }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/app/partner/tickets`);
}
