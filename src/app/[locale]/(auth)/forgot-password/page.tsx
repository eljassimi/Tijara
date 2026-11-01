import { PasswordShell } from "@/components/auth/password-shell";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const [{ locale }, { status }] = await Promise.all([params, searchParams]);
  return <PasswordShell locale={locale} mode="forgot" status={status} />;
}
