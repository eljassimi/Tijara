import { isIP } from "node:net";

export function clientIpFromHeaders(
  incoming: Pick<Headers, "get">,
  trustProxy = process.env.TRUST_PROXY === "true",
) {
  if (!trustProxy) return null;
  const candidate =
    incoming.get("cf-connecting-ip") ||
    incoming.get("x-real-ip") ||
    incoming.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    null;
  return candidate && isIP(candidate) ? candidate : null;
}

export function loginAccountIdentity(email: string, ip: string | null) {
  const normalizedEmail = email.trim().toLowerCase();
  return ip ? `${normalizedEmail}:${ip}` : normalizedEmail;
}
