import type { Prisma, Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/server/notifications/service";
import { canChatWith } from "./access";

type Db = Prisma.TransactionClient;

export async function listChatPeers(actorId: string, actorRole: Role | string) {
  const roles = (
    await import("./access")
  ).allowedChatPeerRoles(actorRole);
  const includePending =
    actorRole === "SUPER_ADMIN" || actorRole === "SUPPORT";
  return prisma.user.findMany({
    where: {
      id: { not: actorId },
      status: includePending
        ? { in: ["ACTIVE", "PENDING"] }
        : "ACTIVE",
      role: { in: roles },
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      role: true,
      status: true,
      image: true,
      email: true,
    },
    take: 300,
  });
}

export async function listConversationsFor(userId: string) {
  const memberships = await prisma.conversationParticipant.findMany({
    where: { userId },
    include: {
      conversation: {
        include: {
          participants: {
            include: {
              user: {
                select: { id: true, name: true, role: true, image: true },
              },
            },
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: {
              author: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
    orderBy: { conversation: { lastMessageAt: "desc" } },
  });
  return memberships.map((membership) => {
    const others = membership.conversation.participants.filter(
      (participant) => participant.userId !== userId,
    );
    const lastMessage = membership.conversation.messages[0] ?? null;
    const unread =
      !membership.lastReadAt ||
      (lastMessage &&
        lastMessage.authorId !== userId &&
        lastMessage.createdAt > membership.lastReadAt);
    return {
      id: membership.conversation.id,
      subject: membership.conversation.subject,
      lastMessageAt: membership.conversation.lastMessageAt,
      lastMessage,
      others,
      unread: Boolean(unread),
      lastReadAt: membership.lastReadAt,
    };
  });
}

export async function getConversationForUser(
  userId: string,
  conversationId: string,
) {
  const membership = await prisma.conversationParticipant.findUnique({
    where: {
      conversationId_userId: { conversationId, userId },
    },
    include: {
      conversation: {
        include: {
          participants: {
            include: {
              user: {
                select: { id: true, name: true, role: true, image: true },
              },
            },
          },
          messages: {
            orderBy: { createdAt: "asc" },
            take: 200,
            include: {
              author: {
                select: { id: true, name: true, role: true, image: true },
              },
            },
          },
        },
      },
    },
  });
  return membership?.conversation ?? null;
}

async function findDirectConversation(
  tx: Db,
  userA: string,
  userB: string,
) {
  const candidates = await tx.conversation.findMany({
    where: {
      AND: [
        { participants: { some: { userId: userA } } },
        { participants: { some: { userId: userB } } },
      ],
    },
    include: {
      participants: { select: { userId: true } },
    },
  });
  return (
    candidates.find((conversation) => conversation.participants.length === 2) ??
    null
  );
}

export async function getOrCreateDirectConversation(
  actor: { id: string; role: Role | string },
  peerId: string,
  subject?: string | null,
) {
  if (peerId === actor.id) throw new Error("Cannot chat with yourself");
  const peer = await prisma.user.findFirst({
    where: {
      id: peerId,
      status: {
        in:
          actor.role === "SUPER_ADMIN" || actor.role === "SUPPORT"
            ? ["ACTIVE", "PENDING"]
            : ["ACTIVE"],
      },
    },
    select: { id: true, role: true, name: true },
  });
  if (!peer || !canChatWith(actor.role, peer.role))
    throw new Error("Chat peer not allowed");

  return prisma.$transaction(async (tx) => {
    const existing = await findDirectConversation(tx, actor.id, peer.id);
    if (existing) return existing;
    return tx.conversation.create({
      data: {
        subject: subject?.trim() || null,
        createdById: actor.id,
        participants: {
          create: [
            { userId: actor.id, lastReadAt: new Date() },
            { userId: peer.id },
          ],
        },
      },
    });
  });
}

export async function markConversationRead(
  userId: string,
  conversationId: string,
) {
  await prisma.conversationParticipant.updateMany({
    where: { conversationId, userId },
    data: { lastReadAt: new Date() },
  });
  const unreadChat = await prisma.notification.findMany({
    where: { userId, readAt: null, type: "CHAT_MESSAGE" },
    select: { id: true, data: true },
  });
  const ids = unreadChat
    .filter((item) => {
      const data =
        item.data && typeof item.data === "object" && !Array.isArray(item.data)
          ? (item.data as Record<string, unknown>)
          : {};
      return data.conversationId === conversationId;
    })
    .map((item) => item.id);
  if (ids.length)
    await prisma.notification.updateMany({
      where: { id: { in: ids } },
      data: { readAt: new Date() },
    });
}

export async function postChatMessage(
  actor: { id: string; role: Role | string; name: string },
  input: {
    conversationId: string;
    body: string;
    imageObjectKey?: string | null;
    imageUrl?: string | null;
  },
) {
  const body = input.body.trim();
  if (!body && !input.imageUrl) throw new Error("Empty message");
  if (body.length > 4000) throw new Error("Message too long");

  return prisma.$transaction(async (tx) => {
    const membership = await tx.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId: input.conversationId,
          userId: actor.id,
        },
      },
    });
    if (!membership) throw new Error("Not a participant");

    const message = await tx.chatMessage.create({
      data: {
        conversationId: input.conversationId,
        authorId: actor.id,
        body: body || (input.imageUrl ? "📷" : ""),
        imageObjectKey: input.imageObjectKey || null,
        imageUrl: input.imageUrl || null,
      },
    });
    await tx.conversation.update({
      where: { id: input.conversationId },
      data: { lastMessageAt: message.createdAt },
    });
    await tx.conversationParticipant.update({
      where: { id: membership.id },
      data: { lastReadAt: new Date() },
    });

    const peers = await tx.conversationParticipant.findMany({
      where: {
        conversationId: input.conversationId,
        userId: { not: actor.id },
      },
      select: { userId: true },
    });
    const preview = body
      ? body.slice(0, 120)
      : input.imageUrl
        ? "📷"
        : "";
    for (const peer of peers) {
      await notifyUser(tx, {
        userId: peer.userId,
        type: "CHAT_MESSAGE",
        titleKey: "chat.message.title",
        bodyKey: "chat.message.body",
        data: {
          conversationId: input.conversationId,
          senderName: actor.name,
          preview,
        },
      });
    }
    return message;
  });
}

export async function unreadConversationCount(userId: string) {
  const conversations = await listConversationsFor(userId);
  return conversations.filter((item) => item.unread).length;
}

/** Total unread incoming chat messages across all threads. */
export async function unreadChatMessageCount(userId: string) {
  const memberships = await prisma.conversationParticipant.findMany({
    where: { userId },
    select: { conversationId: true, lastReadAt: true },
  });
  if (!memberships.length) return 0;
  const counts = await Promise.all(
    memberships.map((membership) =>
      prisma.chatMessage.count({
        where: {
          conversationId: membership.conversationId,
          authorId: { not: userId },
          ...(membership.lastReadAt
            ? { createdAt: { gt: membership.lastReadAt } }
            : {}),
        },
      }),
    ),
  );
  return counts.reduce((sum, count) => sum + count, 0);
}
