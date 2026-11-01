import { AuthShell } from "@/components/auth/auth-shell";

export default async function SignupPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const [{ locale }, { status }] = await Promise.all([params, searchParams]);
  return <AuthShell mode="signup" locale={locale} status={status} />;
}
