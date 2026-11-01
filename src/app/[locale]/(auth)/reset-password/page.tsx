import { PasswordShell } from "@/components/auth/password-shell";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; token?: string }>;
}) {
  const [{ locale }, { status, token }] = await Promise.all([
    params,
    searchParams,
  ]);
  return (
    <PasswordShell locale={locale} mode="reset" status={status} token={token} />
  );
}
