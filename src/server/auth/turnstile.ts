type TurnstileResponse = { success: boolean };

export async function verifyTurnstile(
  token: string | undefined,
  ip?: string,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (process.env.NODE_ENV !== "production") return true;
    const authUrl = new URL(process.env.AUTH_URL ?? "http://invalid.local");
    const localHost =
      authUrl.hostname === "localhost" || authUrl.hostname === "127.0.0.1";
    return process.env.ALLOW_INSECURE_LOCAL_AUTH === "true" && localHost;
  }
  if (!token) return false;

  const body = new FormData();
  body.set("secret", secret);
  body.set("response", token);
  if (ip) body.set("remoteip", ip);

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      body,
      cache: "no-store",
    },
  );
  if (!response.ok) return false;
  const result = (await response.json()) as TurnstileResponse;
  return result.success;
}
