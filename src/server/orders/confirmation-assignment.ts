import type { Prisma, Role } from "@prisma/client";

import { nextCounter } from "@/server/db/counter";

export const CONFIRMATION_REWARD_SETTING_KEY = "confirmationRewardDh";
export const DEFAULT_CONFIRMATION_REWARD_DH = 10;

type AssignmentActor = { id: string; role: Role | string };

export async function listActiveConfirmationAgents(
  tx: Prisma.TransactionClient,
) {
  return tx.user.findMany({
    where: { role: "CONFIRMATION_AGENT", status: "ACTIVE" },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: { id: true, name: true, email: true },
  });
}

/** Round-robin among active confirmation agents. Returns null if none. */
export async function nextConfirmationAgentId(
  tx: Prisma.TransactionClient,
): Promise<string | null> {
  const agents = await listActiveConfirmationAgents(tx);
  if (!agents.length) return null;
  const turn = await nextCounter(tx, "confirmation-agent-rr");
  return agents[(turn - 1) % agents.length]!.id;
}

export async function readConfirmationRewardDh(
  tx: Prisma.TransactionClient,
): Promise<number> {
  const setting = await tx.setting.findUnique({
    where: { key: CONFIRMATION_REWARD_SETTING_KEY },
    select: { value: true },
  });
  const raw = setting?.value;
  const amount =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number(raw)
        : Number(raw ?? DEFAULT_CONFIRMATION_REWARD_DH);
  if (!Number.isFinite(amount) || amount < 0)
    return DEFAULT_CONFIRMATION_REWARD_DH;
  return amount;
}

/** Restrict confirmation agents to their own assigned orders only. */
export function confirmationAssignmentScope(
  actor: AssignmentActor,
): Prisma.OrderWhereInput {
  if (actor.role === "CONFIRMATION_AGENT") {
    return { confirmationAgentId: actor.id };
  }
  return {};
}

export function assertConfirmationAssignmentAccess(
  actor: AssignmentActor,
  order: { confirmationAgentId: string | null },
) {
  if (actor.role !== "CONFIRMATION_AGENT") return;
  if (
    order.confirmationAgentId &&
    order.confirmationAgentId !== actor.id
  ) {
    throw new Error("Order assigned to another confirmation agent");
  }
}

/**
 * Earnings for delivered confirmed orders.
 * Prefer snapshotted rewards; fall back to current rate for legacy rows.
 */
export function computeConfirmationEarnings(input: {
  deliveredCount: number;
  rewardSum: number | null | undefined;
  rewardRate: number;
  rowsWithReward: number;
}) {
  const snapshotted = Number(input.rewardSum ?? 0);
  const legacyCount = Math.max(0, input.deliveredCount - input.rowsWithReward);
  return {
    earnedCount: input.deliveredCount,
    earnedTotal: snapshotted + legacyCount * input.rewardRate,
  };
}
