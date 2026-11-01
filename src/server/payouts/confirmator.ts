import { Prisma, type PayoutStatus, type Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { nextCounter } from "@/server/db/counter";
import {
  DEFAULT_CONFIRMATION_REWARD_DH,
  readConfirmationRewardDh,
} from "@/server/orders/confirmation-assignment";
import { notifyRoles } from "@/server/notifications/service";
import {
  assertPayoutTransition,
  PayoutError,
} from "./rules";

const openStatuses: PayoutStatus[] = ["PENDING", "APPROVED"];
const reservedStatuses: PayoutStatus[] = ["PENDING", "APPROVED", "PAID"];

export async function confirmatorEarnedBalance(
  tx: Prisma.TransactionClient,
  agentId: string,
) {
  const [delivered, rewardRate] = await Promise.all([
    tx.order.findMany({
      where: {
        confirmationAgentId: agentId,
        confirmationStatus: "CONFIRMED",
        deliveryStatus: "DELIVERED",
      },
      select: { confirmationReward: true },
    }),
    readConfirmationRewardDh(tx),
  ]);
  return delivered.reduce((sum, order) => {
    if (order.confirmationReward != null)
      return sum.plus(order.confirmationReward);
    return sum.plus(rewardRate || DEFAULT_CONFIRMATION_REWARD_DH);
  }, new Prisma.Decimal(0));
}

export async function confirmatorReservedBalance(
  tx: Prisma.TransactionClient,
  agentId: string,
) {
  const reserved = await tx.confirmatorPayoutRequest.aggregate({
    where: { agentId, status: { in: reservedStatuses } },
    _sum: { amount: true },
  });
  return reserved._sum.amount ?? new Prisma.Decimal(0);
}

export async function confirmatorAvailableBalance(agentId: string) {
  return prisma.$transaction(async (tx) => {
    const [earned, reserved] = await Promise.all([
      confirmatorEarnedBalance(tx, agentId),
      confirmatorReservedBalance(tx, agentId),
    ]);
    return {
      earned,
      reserved,
      available: earned.minus(reserved),
      rewardRate: await readConfirmationRewardDh(tx),
    };
  });
}

export async function requestConfirmatorPayout(
  actor: { id: string; role: Role },
  amount: Prisma.Decimal,
) {
  if (actor.role !== "CONFIRMATION_AGENT") throw new PayoutError("INSUFFICIENT");
  return prisma.$transaction(
    async (tx) => {
      const profile = await tx.user.findUniqueOrThrow({
        where: { id: actor.id },
        select: { bankName: true, rib: true },
      });
      if (!profile.bankName?.trim() || !profile.rib?.trim())
        throw new PayoutError("BANK_REQUIRED");

      const open = await tx.confirmatorPayoutRequest.findFirst({
        where: { agentId: actor.id, status: { in: openStatuses } },
        select: { id: true },
      });
      if (open) throw new PayoutError("OPEN_REQUEST");

      const earned = await confirmatorEarnedBalance(tx, actor.id);
      const reserved = await confirmatorReservedBalance(tx, actor.id);
      const available = earned.minus(reserved);
      if (available.lt(0)) throw new PayoutError("NEGATIVE_BALANCE");
      if (amount.lte(0) || amount.gt(available))
        throw new PayoutError("INSUFFICIENT");

      const year = new Date().getFullYear();
      const sequence = await nextCounter(tx, `confirmator-payout:${year}`);
      const reference = `CPAY-${year}-${String(sequence).padStart(6, "0")}`;

      const payout = await tx.confirmatorPayoutRequest.create({
        data: {
          reference,
          agentId: actor.id,
          amount,
          bankName: profile.bankName,
          rib: profile.rib,
        },
      });
      await notifyRoles(tx, ["SUPER_ADMIN", "FINANCE"], {
        type: "PAYOUT_REQUEST",
        titleKey: "confirmatorPayout.requested.title",
        bodyKey: "confirmatorPayout.requested.body",
        data: {
          reference,
          amount: amount.toString(),
          payoutId: payout.id,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "CREATE",
          entityType: "ConfirmatorPayoutRequest",
          entityId: payout.id,
          after: {
            reference,
            amount: amount.toString(),
          },
        },
      });
      return payout;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function transitionConfirmatorPayout(
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
      const payout = await tx.confirmatorPayoutRequest.findUniqueOrThrow({
        where: { id: payoutId },
        include: { agent: { select: { id: true } } },
      });
      assertPayoutTransition(payout.status, to);
      if (to === "PAID" && !options.proofObjectKey)
        throw new PayoutError("PROOF_REQUIRED");

      const updated = await tx.confirmatorPayoutRequest.update({
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
          userId: payout.agent.id,
          type: "PAYOUT_STATUS",
          titleKey: `confirmatorPayout.${to.toLowerCase()}.title`,
          bodyKey: `confirmatorPayout.${to.toLowerCase()}.body`,
          data: {
            reference: payout.reference,
            amount: payout.amount.toString(),
            payoutId: payout.id,
            ...(to === "PAID" && (options.proofUrl || payout.proofUrl)
              ? { proofUrl: options.proofUrl ?? payout.proofUrl }
              : {}),
          },
        },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: to === "PAID" ? "MONEY_DEBIT" : "STATUS_CHANGE",
          entityType: "ConfirmatorPayoutRequest",
          entityId: payout.id,
          before: { status: payout.status },
          after: {
            status: to,
            bankReference: to === "PAID" ? options.bankReference : undefined,
            hasProof: Boolean(options.proofObjectKey),
          },
        },
      });
      return updated;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
