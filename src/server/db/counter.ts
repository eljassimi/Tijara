import type { Prisma } from "@prisma/client";

export async function nextCounter(tx: Prisma.TransactionClient, key: string) {
  const counter = await tx.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
    select: { value: true },
  });
  return counter.value;
}

export async function lockAffiliate(
  tx: Prisma.TransactionClient,
  affiliateId: string,
) {
  // MySQL-compatible row lock (replaces Postgres pg_advisory_xact_lock).
  await tx.$queryRaw`
    SELECT id FROM AffiliateProfile WHERE id = ${affiliateId} FOR UPDATE
  `;
}
