import "dotenv/config";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requestPayout, transitionPayout } from "@/server/payouts/service";

const email = `payout-check-${Date.now()}@tijara.test`;
const user = await prisma.user.create({ data: { name: "Payout concurrency check", email, role: "AFFILIATE", status: "ACTIVE", preferredLocale: "FR" } });
const affiliate = await prisma.affiliateProfile.create({ data: { userId: user.id, bankName: "Test bank", rib: "000000000000000000000000" } });

try {
  await prisma.walletTransaction.create({ data: { reference: `CHECK-CREDIT-${user.id}`, affiliateId: affiliate.id, type: "ADJUSTMENT", status: "COMPLETED", amount: new Prisma.Decimal("225.00") } });
  const attempts = await Promise.allSettled(Array.from({ length: 5 }, () => requestPayout({ id: user.id, role: "AFFILIATE" }, new Prisma.Decimal("225.00"))));
  const accepted = attempts.filter((attempt) => attempt.status === "fulfilled");
  const payouts = await prisma.payoutRequest.findMany({ where: { affiliateId: affiliate.id } });
  const pendingDebits = await prisma.walletTransaction.aggregate({ where: { affiliateId: affiliate.id, type: "PAYOUT_DEBIT", status: "PENDING" }, _sum: { amount: true } });
  if (accepted.length !== 1 || payouts.length !== 1 || !pendingDebits._sum.amount?.equals(new Prisma.Decimal("-225.00"))) throw new Error(`Concurrency protection failed: accepted=${accepted.length}, payouts=${payouts.length}, reservation=${pendingDebits._sum.amount}`);

  let skippedApproval = false;
  try { await transitionPayout(user.id, payouts[0].id, "PAID", { bankReference: "CHECK-SKIP" }); } catch { skippedApproval = true; }
  if (!skippedApproval) throw new Error("PENDING -> PAID was incorrectly accepted");
  await transitionPayout(user.id, payouts[0].id, "APPROVED", {});
  await transitionPayout(user.id, payouts[0].id, "PAID", { bankReference: "CHECK-PAID" });
  const final = await prisma.walletTransaction.aggregate({ where: { affiliateId: affiliate.id, status: "COMPLETED" }, _sum: { amount: true } });
  if (!final._sum.amount?.equals(new Prisma.Decimal(0))) throw new Error(`Expected a zero final balance, received ${final._sum.amount}`);
  console.log(JSON.stringify({ accepted: accepted.length, rejected: attempts.length - accepted.length, skippedApprovalBlocked: true, finalBalance: final._sum.amount.toString() }));
} finally {
  await prisma.walletTransaction.deleteMany({ where: { affiliateId: affiliate.id } });
  await prisma.payoutRequest.deleteMany({ where: { affiliateId: affiliate.id } });
  await prisma.affiliateProfile.delete({ where: { id: affiliate.id } });
  await prisma.user.delete({ where: { id: user.id } });
  await prisma.$disconnect();
}
