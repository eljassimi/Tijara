import { AuthShell } from "@/components/auth/auth-shell";

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const [{ locale }, { status }] = await Promise.all([params, searchParams]);
  return <AuthShell mode="login" locale={locale} status={status} />;
}
