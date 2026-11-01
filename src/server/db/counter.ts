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
  await tx.$queryRaw`SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtext(${affiliateId}))`;
}
