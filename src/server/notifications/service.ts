import type { NotificationType, Prisma, Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type NotifyInput = {
  userId: string;
  type: NotificationType;
  titleKey: string;
  bodyKey: string;
  data?: Prisma.InputJsonValue;
};

type Db = Prisma.TransactionClient | typeof prisma;

export async function notifyUser(db: Db, input: NotifyInput) {
  return db.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      titleKey: input.titleKey,
      bodyKey: input.bodyKey,
      data: input.data ?? undefined,
    },
  });
}

export async function notifyUsers(db: Db, inputs: NotifyInput[]) {
  if (!inputs.length) return { count: 0 };
  return db.notification.createMany({
    data: inputs.map((input) => ({
      userId: input.userId,
      type: input.type,
      titleKey: input.titleKey,
      bodyKey: input.bodyKey,
      data: input.data ?? undefined,
    })),
  });
}

export async function notifyRoles(
  db: Db,
  roles: Role[],
  payload: Omit<NotifyInput, "userId">,
) {
  const users = await db.user.findMany({
    where: { role: { in: roles }, status: "ACTIVE" },
    select: { id: true },
  });
  return notifyUsers(
    db,
    users.map((user) => ({ ...payload, userId: user.id })),
  );
}

export async function notifyActiveAffiliates(
  db: Db,
  payload: Omit<NotifyInput, "userId">,
) {
  const affiliates = await db.user.findMany({
    where: {
      status: "ACTIVE",
      role: { in: ["AFFILIATE", "AFFILIATE_STAFF"] },
    },
    select: { id: true },
  });
  return notifyUsers(
    db,
    affiliates.map((user) => ({ ...payload, userId: user.id })),
  );
}
