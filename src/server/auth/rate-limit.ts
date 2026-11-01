import { createHash } from "node:crypto";

import { headers } from "next/headers";

import { prisma } from "@/lib/prisma";
import { clientIpFromHeaders } from "./rate-limit-identity";

export {
  clientIpFromHeaders,
  loginAccountIdentity,
} from "./rate-limit-identity";

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function requestIp() {
  const incoming = await headers();
  return clientIpFromHeaders(incoming);
}

function rateLimitKey(scope: string, identity: string) {
  return `${scope}:${digest(identity.trim().toLowerCase())}`;
}

export async function checkRateLimit(scope: string, identity: string) {
  const record = await prisma.authRateLimit.findUnique({
    where: { key: rateLimitKey(scope, identity) },
    select: { blockedUntil: true },
  });
  return !record?.blockedUntil || record.blockedUntil <= new Date();
}

export async function consumeRateLimit(
  scope: string,
  identity: string,
  options: { limit: number; windowMs: number; blockMs: number },
) {
  const key = rateLimitKey(scope, identity);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtext(${key}))`;
    const now = new Date();
    const record = await tx.authRateLimit.findUnique({ where: { key } });
    if (record?.blockedUntil && record.blockedUntil > now) return false;

    const expired =
      !record ||
      now.getTime() - record.windowStart.getTime() >= options.windowMs;
    const attempts = expired ? 1 : record.attempts + 1;
    const blockedUntil =
      attempts >= options.limit
        ? new Date(now.getTime() + options.blockMs)
        : null;
    await tx.authRateLimit.upsert({
      where: { key },
      create: { key, attempts, windowStart: now, blockedUntil },
      update: {
        attempts,
        windowStart: expired ? now : record!.windowStart,
        blockedUntil,
      },
    });
    return !blockedUntil;
  });
}

export async function clearRateLimit(scope: string, identity: string) {
  const key = rateLimitKey(scope, identity);
  await prisma.authRateLimit.deleteMany({ where: { key } });
}
