import "dotenv/config";

import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";

import { brand } from "@/config/brand";
import { prisma } from "@/lib/prisma";

const connection = new IORedis(
  process.env.REDIS_URL ?? "redis://localhost:6379",
  { maxRetriesPerRequest: null },
);
const queueName = "confirmation-timeouts";
const queue = new Queue(queueName, { connection });

async function expireUnreachableOrders() {
  const setting = await prisma.setting.findUnique({
    where: { key: "unreachableDays" },
  });
  const days = typeof setting?.value === "number" ? setting.value : 4;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const openStatuses = [
    "NEW",
    "CALLING",
    "BUSY",
    "NO_ANSWER",
    "CALL_BACK_LATER",
  ] as const;
  const [orders, systemActor] = await Promise.all([
    prisma.order.findMany({
      where: {
        createdAt: { lte: cutoff },
        confirmationStatus: { in: [...openStatuses] },
      },
      select: {
        id: true,
        code: true,
        confirmationStatus: true,
        affiliate: { select: { userId: true } },
      },
    }),
    prisma.user.findFirstOrThrow({
      where: { role: "SUPER_ADMIN", status: "ACTIVE" },
      select: { id: true },
    }),
  ]);
  let processed = 0;
  for (const order of orders) {
    const changed = await prisma.$transaction(async (tx) => {
      const update = await tx.order.updateMany({
        where: {
          id: order.id,
          createdAt: { lte: cutoff },
          confirmationStatus: { in: [...openStatuses] },
        },
        data: { confirmationStatus: "UNREACHABLE" },
      });
      if (!update.count) return false;
      await tx.callAttempt.create({
        data: {
          orderId: order.id,
          agentId: systemActor.id,
          outcome: "UNREACHABLE",
          note: `Automatic timeout after ${days} days`,
        },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          actorId: systemActor.id,
          statusType: "CONFIRMATION",
          fromStatus: order.confirmationStatus,
          toStatus: "UNREACHABLE",
          note: `Automatic timeout after ${days} days`,
        },
      });
      await tx.notification.create({
        data: {
          userId: order.affiliate.userId,
          type: "ORDER_STATUS",
          titleKey: "order.unreachable.title",
          bodyKey: "order.unreachable.body",
          data: { orderCode: order.code, orderId: order.id },
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: systemActor.id,
          action: "STATUS_CHANGE",
          entityType: "Order",
          entityId: order.id,
          before: { confirmationStatus: order.confirmationStatus },
          after: { confirmationStatus: "UNREACHABLE", automatic: true },
        },
      });
      return true;
    });
    if (changed) processed += 1;
  }
  return processed;
}

await queue.upsertJobScheduler(
  "confirmation-timeout-hourly",
  { pattern: "0 * * * *", tz: brand.timezone },
  {
    name: "expire-unreachable",
    data: {},
    opts: {
      attempts: 5,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  },
);

const worker = new Worker(
  queueName,
  async (job) => {
    const record = await prisma.importJob.create({
      data: {
        type: "CONFIRMATION_TIMEOUT",
        status: "RUNNING",
        createdById: String(
          job.data.createdById ??
            (
              await prisma.user.findFirstOrThrow({
                where: { role: "SUPER_ADMIN" },
                select: { id: true },
              })
            ).id,
        ),
        startedAt: new Date(),
        attempts: job.attemptsMade + 1,
      },
    });
    try {
      const processed = await expireUnreachableOrders();
      await prisma.importJob.update({
        where: { id: record.id },
        data: {
          status: "COMPLETED",
          progress: 100,
          processedRows: processed,
          totalRows: processed,
          completedAt: new Date(),
        },
      });
      return { processed };
    } catch (error) {
      await prisma.importJob.update({
        where: { id: record.id },
        data: {
          status: "FAILED",
          error:
            error instanceof Error ? error.message : "Unknown worker error",
          completedAt: new Date(),
        },
      });
      throw error;
    }
  },
  { connection, concurrency: 2 },
);

async function shutdown() {
  await worker.close();
  await queue.close();
  await connection.quit();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
console.log("Tijara worker ready");
