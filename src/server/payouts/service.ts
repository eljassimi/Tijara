import { Prisma, type PayoutStatus, type Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { nextCounter, lockAffiliate } from "@/server/db/counter";
import { affiliateIdFor } from "@/server/orders/service";
import { notifyRoles } from "@/server/notifications/service";
import {
  assertPayoutTransition,
  availableWalletBalance,
  PayoutError,
} from "./rules";

export { PayoutError } from "./rules";

const openPayoutStatuses: PayoutStatus[] = ["PENDING", "APPROVED"];

async function balanceInsideTransaction(
  tx: Prisma.TransactionClient,
  affiliateId: string,
) {
  const [completed, pending] = await Promise.all([
    tx.walletTransaction.aggregate({
      where: { affiliateId, status: "COMPLETED" },
      _sum: { amount: true },
    }),
    tx.walletTransaction.aggregate({
      where: { affiliateId, status: "PENDING", type: "PAYOUT_DEBIT" },
      _sum: { amount: true },
    }),
  ]);
  return availableWalletBalance(
    completed._sum.amount ?? new Prisma.Decimal(0),
    pending._sum.amount ?? new Prisma.Decimal(0),
  );
}

export async function requestPayout(
  actor: { id: string; role: Role },
  amount: Prisma.Decimal,
) {
  const affiliateId = await affiliateIdFor(actor.id, actor.role);
  return prisma.$transaction(
    async (tx) => {
      await lockAffiliate(tx, affiliateId);
      const affiliate = await tx.affiliateProfile.findUniqueOrThrow({
        where: { id: affiliateId },
        select: { id: true, bankName: true, rib: true },
      });
      if (!affiliate.bankName || !affiliate.rib)
        throw new PayoutError("BANK_REQUIRED");

      const openRequest = await tx.payoutRequest.findFirst({
        where: { affiliateId, status: { in: openPayoutStatuses } },
        select: { id: true },
      });
      if (openRequest) throw new PayoutError("OPEN_REQUEST");

      const available = await balanceInsideTransaction(tx, affiliateId);
      if (available.lt(0)) throw new PayoutError("NEGATIVE_BALANCE");
      if (amount.lte(0) || amount.gt(available))
        throw new PayoutError("INSUFFICIENT");

      const year = new Date().getFullYear();
      const sequence = await nextCounter(tx, `payout:${year}`);
      const reference = `PAY-${year}-${String(sequence).padStart(6, "0")}`;
      const payout = await tx.payoutRequest.create({
        data: {
          reference,
          affiliateId,
          amount,
          bankName: affiliate.bankName,
          rib: affiliate.rib,
        },
      });
      await tx.walletTransaction.create({
        data: {
          reference: `RES-${reference}`,
          affiliateId,
          payoutId: payout.id,
          type: "PAYOUT_DEBIT",
          status: "PENDING",
          amount: amount.negated(),
          note: "Payout reservation",
        },
      });
      await notifyRoles(tx, ["SUPER_ADMIN", "FINANCE"], {
        type: "PAYOUT_REQUEST",
        titleKey: "payout.requested.title",
        bodyKey: "payout.requested.body",
        data: {
          reference,
          amount: amount.toString(),
          payoutId: payout.id,
        },
      });
      return payout;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function transitionPayout(
  actorId: string,
  payoutId: string,
  to: Extract<PayoutStatus, "APPROVED" | "REJECTED" | "PAID">,
  options: {
    reason?: string;
    bankReference?: string;
    proofObjectKey?: string;
    proofUrl?: string;
  },
) {
  return prisma.$transaction(
    async (tx) => {
      const payout = await tx.payoutRequest.findUniqueOrThrow({
        where: { id: payoutId },
        include: { affiliate: { select: { userId: true } } },
      });
      await lockAffiliate(tx, payout.affiliateId);
      assertPayoutTransition(payout.status, to);
      if (to === "PAID" && !options.proofObjectKey)
        throw new PayoutError("PROOF_REQUIRED");

      const reservation = await tx.walletTransaction.findFirst({
        where: { payoutId: payout.id, type: "PAYOUT_DEBIT" },
      });
      if (
        to === "PAID" &&
        reservation &&
        (await balanceInsideTransaction(tx, payout.affiliateId)).lt(0)
      )
        throw new PayoutError("INSUFFICIENT");
      if (!reservation) {
        const available = await balanceInsideTransaction(
          tx,
          payout.affiliateId,
        );
        if (payout.amount.gt(available)) throw new PayoutError("INSUFFICIENT");
        await tx.walletTransaction.create({
          data: {
            reference: `RES-${payout.reference}`,
            affiliateId: payout.affiliateId,
            payoutId: payout.id,
            type: "PAYOUT_DEBIT",
            status: to === "PAID" ? "COMPLETED" : "PENDING",
            amount: payout.amount.negated(),
            note:
              to === "PAID"
                ? options.bankReference
                : "Legacy payout reservation",
          },
        });
      } else if (to === "REJECTED") {
        await tx.walletTransaction.update({
          where: { id: reservation.id },
          data: { status: "REVERSED", note: options.reason },
        });
      } else if (to === "PAID") {
        await tx.walletTransaction.update({
          where: { id: reservation.id },
          data: { status: "COMPLETED", note: options.bankReference },
        });
      }

      const updated = await tx.payoutRequest.update({
        where: { id: payout.id },
        data: {
          status: to,
          rejectionReason: to === "REJECTED" ? options.reason || null : null,
          bankReference:
            to === "PAID"
              ? options.bankReference?.trim() || null
              : payout.bankReference,
          proofObjectKey:
            to === "PAID"
              ? options.proofObjectKey ?? payout.proofObjectKey
              : payout.proofObjectKey,
          proofUrl:
            to === "PAID" ? options.proofUrl ?? payout.proofUrl : payout.proofUrl,
          reviewedById: actorId,
          reviewedAt: new Date(),
          paidAt: to === "PAID" ? new Date() : null,
        },
      });
      await tx.notification.create({
        data: {
          userId: payout.affiliate.userId,
          type: "PAYOUT_STATUS",
          titleKey: `payout.${to.toLowerCase()}.title`,
          bodyKey: `payout.${to.toLowerCase()}.body`,
          data: {
            reference: payout.reference,
            amount: payout.amount.toString(),
            payoutId: payout.id,
          },
        },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: to === "PAID" ? "MONEY_DEBIT" : "STATUS_CHANGE",
          entityType: "PayoutRequest",
          entityId: payout.id,
          before: { status: payout.status },
          after: {
            status: to,
            bankReference: to === "PAID" ? options.bankReference : undefined,
          },
        },
      });
      return updated;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
