import { getTranslations } from "next-intl/server";

import { ChatWorkspace } from "@/components/chat/workspace";
import { requireUser } from "@/server/auth/session";
import {
  getConversationForUser,
  listChatPeers,
  listConversationsFor,
  markConversationRead,
} from "@/server/chat/service";

export default async function AdminChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "fr" | "ar" }>;
  searchParams: Promise<{ c?: string; status?: string }>;
}) {
  const { locale } = await params;
  const { c: rawC, status } = await searchParams;
  const conversationId = rawC?.split("?")[0]?.trim() || undefined;
  const user = await requireUser(locale);
  const [t, peers, conversations] = await Promise.all([
    getTranslations("Chat"),
    listChatPeers(user.id, user.role),
    listConversationsFor(user.id),
  ]);
  const active = conversationId
    ? await getConversationForUser(user.id, conversationId)
    : null;
  if (active) await markConversationRead(user.id, active.id);

  return (
    <ChatWorkspace
      locale={locale}
      area="admin"
      userId={user.id}
      peers={peers}
      conversations={conversations}
      active={active}
      status={status}
      labels={{
        title: t("title"),
        body: t("body"),
        empty: t("empty"),
        start: t("start"),
        choosePeer: t("choosePeer"),
        subject: t("subject"),
        open: t("open"),
        placeholder: t("placeholder"),
        send: t("send"),
        emoji: t("emoji"),
        attach: t("attach"),
        removeImage: t("removeImage"),
        noThread: t("noThread"),
        you: t("you"),
      }}
    />
  );
}
