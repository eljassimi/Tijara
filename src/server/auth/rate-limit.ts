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

/** MySQL GET_LOCK names are capped; use a stable short digest. */
function mysqlLockName(key: string) {
  return `rl_${digest(key).slice(0, 60)}`;
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
  const lockName = mysqlLockName(key);
  return prisma.$transaction(async (tx) => {
    const lockRows = await tx.$queryRaw<Array<{ locked: number | bigint | null }>>`
      SELECT GET_LOCK(${lockName}, 5) AS locked
    `;
    if (Number(lockRows[0]?.locked ?? 0) !== 1) return false;

    try {
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
    } finally {
      await tx.$queryRaw`SELECT RELEASE_LOCK(${lockName})`;
    }
  });
}

export async function clearRateLimit(scope: string, identity: string) {
  const key = rateLimitKey(scope, identity);
  await prisma.authRateLimit.deleteMany({ where: { key } });
}
